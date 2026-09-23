/**
 * Ringkasan mingguan otomatis.
 *
 * Dua jalur masuk, satu cara kerja:
 *
 * 1. JADWAL — dipanggil cron tiap Senin pagi dengan header `x-jadwal-rahasia`.
 *    Endpoint mengambil antrean pengguna yang pekannya belum diringkas
 *    (`pengguna_perlu_ringkasan`), lalu meringkas satu per satu sampai
 *    antreannya habis atau batas waktunya dekat. Antrean bisa dilanjutkan:
 *    yang sudah punya ringkasan tidak ikut lagi, jadi cron yang diulang tiap
 *    jam sepanjang Senin pagi otomatis menyelesaikan sisanya.
 * 2. PENGGUNA — dipanggil app dengan JWT pengguna, untuk pengguna yang membuka
 *    app sebelum jadwal sampai kepadanya. Semua pembacaan berjalan sebagai
 *    pengguna itu; RLS berlaku penuh.
 *
 * Yang dijaga:
 *
 * • ANGKA tidak pernah berasal dari model. Poin dihitung SQL; model hanya
 *   menulis narasi, dan `simpan_ringkasan_mingguan` menghitung ulang poinnya
 *   sendiri sehingga tidak ada angka dari sini yang bisa masuk ke kartu.
 * • Angka DI DALAM narasi diperiksa terhadap poin (`bacaJawaban`). Model yang
 *   mengarang angka diberi satu kesempatan memperbaiki; setelah itu narasinya
 *   diganti narasi cadangan yang disusun tanpa model.
 * • Kegagalan SEMENTARA (jaringan, 5xx) tidak diganti narasi cadangan: pengguna
 *   itu dilewati dan tetap di antrean untuk putaran cron berikutnya. Narasi
 *   cadangan hanya untuk kegagalan yang akan berulang (angka asing dua kali,
 *   penolakan). Kalau tidak, satu gangguan jaringan Senin pagi akan mengunci
 *   ringkasan sepekan penuh dengan narasi yang lebih datar dari seharusnya.
 * • Rahasia jadwal bukan kunci service role. Cron hanya memegang hak untuk
 *   MEMICU ringkasan; kunci service role tetap tinggal di env Edge Function.
 *
 * Penyebaran (tanpa rahasia di repo):
 *   supabase secrets set ANTHROPIC_API_KEY=... RINGKASAN_JADWAL_RAHASIA=...
 *   supabase functions deploy ringkasan-mingguan
 * lalu jadwalkan lewat `supabase/jadwal/ringkasan_mingguan.sql`.
 * `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` sudah
 * disediakan runtime-nya.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.127.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { judulRingkasan } from '../_shared/logika/index.ts';
import type { DataRingkasanMingguan } from '../_shared/logika/index.ts';
import { BETA_FALLBACK, MODEL_COACH } from '../_shared/promptCoach.ts';
import {
  ATURAN_RINGKASAN,
  bacaJawaban,
  MAKS_PERCOBAAN_RINGKASAN,
  MAKS_TOKEN_RINGKASAN,
  narasiCadangan,
  pesanPerbaikan,
  SKEMA_RINGKASAN,
  susunPermintaan,
  UPAYA_RINGKASAN,
} from '../_shared/promptRingkasan.ts';

const KEPALA_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Berapa pengguna diambil dari antrean per panggilan jadwal. */
const BATAS_ANTREAN = 25;

/**
 * Setelah selama ini, jadwal berhenti mengambil pengguna BARU dan melapor.
 * Jauh di bawah batas waktu Edge Function, supaya satu pengguna yang sedang
 * diringkas masih sempat selesai dan tersimpan.
 */
const BATAS_WAKTU_MS = 100_000;

type HasilSatu =
  | {
      status: 'baru' | 'sudah-ada';
      oleh?: 'model' | 'cadangan';
      ringkasan_id: string;
      pesan_id: string | null;
      percakapan_id: string | null;
    }
  | { status: 'dilewati'; alasan: 'data-kurang' }
  | { status: 'gagal'; alasan: string };

function jawab(isi: unknown, status = 200): Response {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...KEPALA_CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Bandingkan rahasia dalam waktu tetap. Keduanya di-hash dulu supaya panjang
 * rahasia pun tidak bocor lewat lama perbandingan.
 */
async function rahasiaCocok(diberikan: string, seharusnya: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(diberikan)),
    crypto.subtle.digest('SHA-256', enc.encode(seharusnya)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let beda = 0;
  for (let i = 0; i < x.length; i += 1) beda |= x[i] ^ y[i];
  return beda === 0;
}

/**
 * Tulis narasi untuk satu pekan. Melempar galat hanya untuk kegagalan
 * SEMENTARA (jaringan, API); kegagalan yang akan berulang dijawab narasi
 * cadangan.
 */
async function tulisNarasi(
  anthropic: Anthropic,
  data: DataRingkasanMingguan,
): Promise<{ bacaan: string; lanjutan: string[]; oleh: 'model' | 'cadangan' }> {
  const pesan: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: susunPermintaan(data) },
  ];

  for (let percobaan = 0; percobaan < MAKS_PERCOBAAN_RINGKASAN; percobaan += 1) {
    const balasan = await anthropic.beta.messages
      .stream({
        model: MODEL_COACH,
        max_tokens: MAKS_TOKEN_RINGKASAN,
        output_config: {
          effort: UPAYA_RINGKASAN,
          format: { type: 'json_schema', schema: SKEMA_RINGKASAN },
        },
        betas: [BETA_FALLBACK],
        fallbacks: 'default',
        // Aturannya sama untuk semua pengguna; titik cache di ujungnya membuat
        // pengguna kedua dan seterusnya dalam satu jadwal membaca dari cache.
        system: [{ type: 'text', text: ATURAN_RINGKASAN, cache_control: { type: 'ephemeral' } }],
        messages: pesan,
      })
      .finalMessage();

    // Penolakan datang sebagai HTTP 200; sampai di sini berarti seluruh rantai
    // fallback ikut menolak. Mengulang tidak akan mengubahnya.
    if (balasan.stop_reason === 'refusal') break;

    let teks = '';
    for (const blok of balasan.content) {
      if (blok.type === 'text') teks += blok.text;
    }

    const hasil = bacaJawaban(teks, data);
    if (hasil.ok) return { bacaan: hasil.bacaan, lanjutan: hasil.lanjutan, oleh: 'model' };

    console.warn('narasi ditolak pemeriksa', hasil.alasan, hasil.asing ?? []);
    pesan.push({ role: 'assistant', content: balasan.content });
    pesan.push({ role: 'user', content: pesanPerbaikan(hasil) });
  }

  return { ...narasiCadangan(data), oleh: 'cadangan' };
}

/**
 * Ringkas satu pengguna. `userId` null berarti jalur pengguna (JWT); selain
 * itu jalur jadwal (service role), dan setiap kueri WAJIB menyebut penggunanya
 * karena service role melewati RLS.
 */
async function ringkasSatu(
  db: SupabaseClient,
  anthropic: Anthropic,
  userId: string | null,
  mingguMulai: string | null,
): Promise<HasilSatu> {
  const { data: mentah, error: galatPoin } = await db.rpc('poin_ringkasan_mingguan', {
    p_minggu_mulai: mingguMulai,
    p_user_id: userId,
  });
  if (galatPoin || !mentah) {
    console.error('gagal membaca poin', galatPoin);
    return { status: 'gagal', alasan: galatPoin?.code ?? 'poin-kosong' };
  }
  const data = mentah as DataRingkasanMingguan;
  if (!data.cukup) return { status: 'dilewati', alasan: 'data-kurang' };

  // Sudah ada? Jangan bayar model untuk narasi yang akan dibuang.
  let kueri = db
    .from('ringkasan_mingguan')
    .select('id, pesan_id')
    .eq('periode_dari', data.periode.dari);
  if (userId) kueri = kueri.eq('user_id', userId);
  const { data: ada } = await kueri.maybeSingle();
  if (ada) {
    return {
      status: 'sudah-ada',
      ringkasan_id: ada.id as string,
      pesan_id: (ada.pesan_id as string | null) ?? null,
      percakapan_id: null,
    };
  }

  let narasi: Awaited<ReturnType<typeof tulisNarasi>>;
  try {
    narasi = await tulisNarasi(anthropic, data);
  } catch (galat) {
    // Sementara: biarkan di antrean untuk putaran berikutnya.
    console.error('gagal memanggil model', galat);
    return { status: 'gagal', alasan: 'model-tidak-terjangkau' };
  }

  const { data: simpan, error: galatSimpan } = await db.rpc('simpan_ringkasan_mingguan', {
    p_minggu_mulai: data.periode.dari,
    p_bacaan: narasi.bacaan,
    p_lanjutan: narasi.lanjutan.length > 0 ? narasi.lanjutan : null,
    p_judul: judulRingkasan(data.periode),
    p_user_id: userId,
  });
  if (galatSimpan || !simpan) {
    console.error('gagal menyimpan ringkasan', galatSimpan);
    return { status: 'gagal', alasan: galatSimpan?.code ?? 'simpan-kosong' };
  }
  const s = simpan as {
    baru: boolean;
    ringkasan_id: string;
    pesan_id: string | null;
    percakapan_id: string | null;
  };
  return {
    status: s.baru ? 'baru' : 'sudah-ada',
    oleh: s.baru ? narasi.oleh : undefined,
    ringkasan_id: s.ringkasan_id,
    pesan_id: s.pesan_id,
    percakapan_id: s.percakapan_id,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: KEPALA_CORS });
  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  const kunciAi = Deno.env.get('ANTHROPIC_API_KEY');
  if (!kunciAi) {
    console.error('ANTHROPIC_API_KEY belum diset pada Edge Function');
    return jawab({ galat: 'Ringkasan belum siap. Coba lagi nanti.' }, 503);
  }
  const anthropic = new Anthropic({ apiKey: kunciAi });

  let badan: { minggu_mulai?: unknown } = {};
  try {
    const teks = await req.text();
    if (teks.trim().length > 0) badan = JSON.parse(teks);
  } catch {
    return jawab({ galat: 'Badan permintaan bukan JSON' }, 400);
  }
  const mingguMulai =
    typeof badan.minggu_mulai === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(badan.minggu_mulai)
      ? badan.minggu_mulai
      : null;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const rahasiaDiberikan = req.headers.get('x-jadwal-rahasia');

  // --- Jalur jadwal --------------------------------------------------------
  if (rahasiaDiberikan !== null) {
    const rahasia = Deno.env.get('RINGKASAN_JADWAL_RAHASIA');
    if (!rahasia || !(await rahasiaCocok(rahasiaDiberikan, rahasia))) {
      return jawab({ galat: 'Tidak berwenang' }, 401);
    }
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: antrean, error: galatAntrean } = await db.rpc('pengguna_perlu_ringkasan', {
      p_minggu_mulai: mingguMulai,
      p_batas: BATAS_ANTREAN,
    });
    if (galatAntrean) {
      console.error('gagal membaca antrean', galatAntrean);
      return jawab({ galat: 'Gagal membaca antrean' }, 502);
    }

    const daftar = (antrean ?? []) as { pengguna_id: string; pekan_mulai: string }[];
    const mulai = Date.now();
    const tally = { baru: 0, sudah_ada: 0, dilewati: 0, gagal: 0, cadangan: 0 };
    let diproses = 0;
    for (const baris of daftar) {
      if (Date.now() - mulai > BATAS_WAKTU_MS) break;
      const h = await ringkasSatu(db, anthropic, baris.pengguna_id, baris.pekan_mulai);
      diproses += 1;
      if (h.status === 'baru') {
        tally.baru += 1;
        if (h.oleh === 'cadangan') tally.cadangan += 1;
      } else if (h.status === 'sudah-ada') tally.sudah_ada += 1;
      else if (h.status === 'dilewati') tally.dilewati += 1;
      else tally.gagal += 1;
    }

    // Tidak ada id pengguna di jawaban maupun log: laporan jadwal cukup angka.
    return jawab({
      ...tally,
      diproses,
      belum_diproses: daftar.length - diproses,
      antrean_penuh: daftar.length === BATAS_ANTREAN,
    });
  }

  // --- Jalur pengguna ------------------------------------------------------
  const otorisasi = req.headers.get('Authorization');
  if (!otorisasi) return jawab({ galat: 'Tidak ada sesi login' }, 401);
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    // JWT pengguna diteruskan apa adanya; tanpa `p_user_id`, fungsi SQL
    // menurunkan penggunanya dari sesi ini dan RLS berlaku penuh.
    global: { headers: { Authorization: otorisasi } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hasil = await ringkasSatu(db, anthropic, null, mingguMulai);
  if (hasil.status === 'gagal') {
    const status =
      hasil.alasan === '28000' || hasil.alasan === 'PGRST301'
        ? 401
        : hasil.alasan === '22023' // pekan yang diminta belum selesai
          ? 409
          : 502;
    return jawab({ galat: 'Ringkasan belum bisa dibuat. Coba lagi nanti.', ...hasil }, status);
  }
  return jawab(hasil);
});
