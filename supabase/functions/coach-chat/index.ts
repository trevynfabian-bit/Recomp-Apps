/**
 * Endpoint chat AI Coach.
 *
 * Ada di Edge Function, bukan di app, karena satu alasan yang tidak bisa
 * ditawar: kunci API Anthropic tidak boleh ada di bundel aplikasi. Apa pun yang
 * masuk ke `EXPO_PUBLIC_*` bisa dibaca siapa saja yang mengunduh app-nya, dan
 * kunci yang bocor akan dipakai orang lain atas tagihan pemilik app.
 *
 * Yang dijaga di sini, selain kunci:
 *
 * 1. KONTEKS diambil sebagai pengguna itu sendiri. Klien Supabase dibuat dengan
 *    JWT dari header permintaan, jadi RLS tetap berlaku penuh: tidak ada jalan
 *    bagi endpoint ini untuk membaca data pengguna lain, bahkan kalau
 *    `percakapan_id` yang dikirim milik orang lain.
 * 2. BATAS MEDIS diperiksa di KEDUA ARAH. Pertanyaan diperiksa di klien (lihat
 *    `src/data/coach.ts`) dan lagi di sini dengan aturan yang SAMA dari
 *    `@recomp/logika`: klien menjaga agar pertanyaan sensitif tidak perlu
 *    meninggalkan perangkat, server menjaga agar klien lama atau yang
 *    dimodifikasi tidak bisa melewatinya. JAWABAN model juga diperiksa sebelum
 *    disimpan dan dikirim (`periksaJawabanMedis`): pertanyaan yang sepenuhnya
 *    wajar bisa saja dijawab dengan takaran obat, dan pemeriksaan pertanyaan
 *    tidak akan pernah menangkapnya. Jawaban seperti itu diganti kartu
 *    penolakan; teksnya tidak disimpan dan tidak dikirim.
 * 3. KUOTA harian ditegakkan baris `pesan_coach` (pemicu di database), dan
 *    pertanyaan disimpan SEBELUM model dipanggil — jadi pertanyaan di atas
 *    batas ditolak sebelum satu token pun dibayar.
 * 4. ANGKA tidak pernah dihitung model. Model memanggil delapan fungsi; semuanya
 *    dijawab dari konteks yang sudah dihitung app dan diturunkan dengan fungsi
 *    dari `@recomp/logika` (lihat `_shared/promptCoach.ts`) — termasuk bentuk
 *    tampilnya, jadi model tidak pernah memformat angka sendiri. Asal tiap angka
 *    dicatat ke `pesan_coach.rujukan` sebagai DATA.
 * 5. HASIL LAB dibaca lewat `muat_hasil_lab` dengan klien yang sama (RLS), dan
 *    hanya tanggal & nama panelnya yang ikut di setiap pertanyaan. Nilainya
 *    sampai ke model hanya bila model memanggil `ambil_hasil_lab`, dan isinya
 *    tidak pernah dicatat ke log.
 *
 * Aturan "protein tidak pernah dipotong", "wajib rata-rata 7 hari", dan
 * seterusnya tidak dititipkan ke prompt saja — bentuk datanyalah yang
 * menegakkannya. Prompt di sini menjelaskan aturan itu kepada model; yang
 * membuatnya benar adalah `konteks_coach` di SQL yang tidak pernah menyodorkan
 * timbangan harian sebagai angka berlabel.
 *
 * Penyebaran:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase functions deploy coach-chat
 * `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sudah disediakan runtime-nya. Versi SDK
 * dipatok di impor di bawah dan SAMA dengan devDependency proyek: `npm run
 * cek:edge` memeriksa berkas ini terhadap tipe SDK yang terpasang, jadi
 * keduanya harus versi yang sama agar pemeriksaannya berarti.
 *
 * Bagian yang bisa diuji tanpa kunci API hidup di `_shared/promptCoach.ts` dan
 * diperiksa `npm run cek:prompt`; sifat-sifat berkas ini yang tidak bisa diuji
 * tanpa kunci (kunci tidak di bundel, JWT diteruskan, batas medis diperiksa
 * ulang) dibaca dari sumbernya oleh skrip yang sama.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.127.0';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { periksaBatasMedis, periksaJawabanMedis } from '../_shared/logika/batasMedis.ts';
import { hasilLabDariServer, type BarisHasilLabServer } from '../_shared/logika/hasilLab.ts';
import {
  BETA_FALLBACK,
  jalankanTool,
  MAKS_TOKEN_COACH,
  MODEL_COACH,
  susunSystem,
  TOOLS_COACH,
  UPAYA_COACH,
  type KonteksCoach,
} from '../_shared/promptCoach.ts';

const KEPALA_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Batas panjang pertanyaan; sama dengan CHECK `pesan_teks_wajar` di database. */
const MAKS_PERTANYAAN = 8000;

/** Berapa kali putaran pemanggilan fungsi dibolehkan sebelum dihentikan. */
const MAKS_PUTARAN_TOOL = 6;

function jawab(isi: unknown, status = 200): Response {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...KEPALA_CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: KEPALA_CORS });
  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  const otorisasi = req.headers.get('Authorization');
  if (!otorisasi) return jawab({ galat: 'Tidak ada sesi login' }, 401);

  const kunciAi = Deno.env.get('ANTHROPIC_API_KEY');
  if (!kunciAi) {
    // Sengaja tidak menyebut nama variabelnya ke klien; pesan operasional
    // seperti itu hanya berguna bagi penyerang.
    console.error('ANTHROPIC_API_KEY belum diset pada Edge Function');
    return jawab({ galat: 'Coach belum siap. Coba lagi nanti.' }, 503);
  }

  let badan: { pertanyaan?: unknown; percakapan_id?: unknown; persen_lemak?: unknown };
  try {
    badan = await req.json();
  } catch {
    return jawab({ galat: 'Badan permintaan bukan JSON' }, 400);
  }

  const pertanyaan = typeof badan.pertanyaan === 'string' ? badan.pertanyaan.trim() : '';
  if (pertanyaan.length === 0) return jawab({ galat: 'Pertanyaan kosong' }, 400);
  if (pertanyaan.length > MAKS_PERTANYAAN) {
    return jawab({ galat: 'Pertanyaan terlalu panjang' }, 400);
  }

  // --- Batas medis, lapis kedua -------------------------------------------
  // Aturannya sama persis dengan yang dipakai klien. Yang ditolak di sini tidak
  // pernah dikirim ke model, dan tidak ada satu pun token yang dibayarkan
  // untuknya.
  const penolakan = periksaBatasMedis(pertanyaan);
  if (penolakan) {
    return jawab({ ditolak: true, penolakan }, 200);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    // JWT pengguna diteruskan apa adanya: seluruh pembacaan di bawah tetap
    // dibatasi RLS, sama seperti kalau app yang memanggilnya langsung.
    { global: { headers: { Authorization: otorisasi } } },
  );

  // Hasil lab dibaca terpisah dari `konteks_coach`, sama-sama sebagai pengguna.
  // Gagal membacanya TIDAK menggagalkan chat: pertanyaan soal berat atau budget
  // tetap terjawab, dan `ambil_hasil_lab` berkata datanya belum terbaca —
  // bukan "belum ada".
  const [{ data: konteksMentah, error: galatKonteks }, { data: labMentah, error: galatLab }] =
    await Promise.all([
      supabase.rpc('konteks_coach', {
        p_tanggal: null,
        p_persen_lemak: typeof badan.persen_lemak === 'number' ? badan.persen_lemak : null,
      }),
      supabase.rpc('muat_hasil_lab'),
    ]);
  if (galatKonteks || !konteksMentah) {
    console.error('gagal mengambil konteks', galatKonteks);
    return jawab({ galat: 'Gagal membaca data Anda' }, 502);
  }
  // Yang dicatat hanya kodenya; isi hasil lab tidak pernah masuk log.
  if (galatLab) console.error('gagal mengambil hasil lab', galatLab.code);
  const konteks: KonteksCoach = {
    ...(konteksMentah as Omit<KonteksCoach, 'hasil_lab'>),
    hasil_lab:
      galatLab || !Array.isArray(labMentah)
        ? null
        : (labMentah as BarisHasilLabServer[]).map(hasilLabDariServer),
  };

  // --- Percakapan & pesan pengguna ----------------------------------------
  const { data: pengguna } = await supabase.auth.getUser();
  const userId = pengguna?.user?.id;
  if (!userId) return jawab({ galat: 'Sesi tidak sah' }, 401);

  let percakapanId = typeof badan.percakapan_id === 'string' ? badan.percakapan_id : null;
  const utasBaru = !percakapanId;
  if (!percakapanId) {
    // Judulnya diturunkan dari pertanyaan pertama, dipotong sesuai batas kolom.
    const judul = pertanyaan.replace(/\s+/g, ' ').slice(0, 48);
    const { data: baru, error: galatBuat } = await supabase
      .from('percakapan')
      .insert({ user_id: userId, judul })
      .select('id')
      .single();
    if (galatBuat || !baru) {
      console.error('gagal membuat percakapan', galatBuat);
      return jawab({ galat: 'Gagal membuka percakapan' }, 502);
    }
    percakapanId = baru.id as string;
  }

  const { error: galatPesan } = await supabase.from('pesan_coach').insert({
    percakapan_id: percakapanId,
    user_id: userId,
    peran: 'pengguna',
    teks: pertanyaan,
  });
  if (galatPesan) {
    // 54000: kuota harian habis (pemicu `pesan_coach_kuota_harian`). Bukan
    // galat server; model tidak dipanggil dan tidak ada yang dibayar.
    if (galatPesan.code === '54000') {
      // Utas yang baru dibuat untuk pertanyaan ini jangan ditinggal kosong di
      // daftar riwayat.
      if (utasBaru) await supabase.from('percakapan').delete().eq('id', percakapanId);
      return jawab(
        { galat: 'Batas pertanyaan hari ini sudah tercapai. Coach bisa ditanya lagi besok.', kuota_habis: true },
        429,
      );
    }
    console.error('gagal menyimpan pertanyaan', galatPesan);
    return jawab({ galat: 'Gagal menyimpan pertanyaan' }, 502);
  }

  // Riwayat percakapan diurutkan dengan `urutan`, bukan `waktu`: dua pesan yang
  // disimpan dalam satu transaksi punya waktu yang sama persis.
  const { data: riwayat } = await supabase
    .from('pesan_coach')
    .select('peran, teks, urutan, ditulis_server')
    .eq('percakapan_id', percakapanId)
    .order('urutan', { ascending: true })
    .limit(40);

  // Riwayat dari percakapan SEBELUMNYA dikirim sebagai teks saja, tanpa blok
  // thinking. Itu disengaja: blok thinking terikat pada model dan pada prefiks
  // percakapan tempat ia dibuat, sementara blok system di sini memuat konteks
  // data yang berubah tiap permintaan. Memutar ulang blok lama di atas prefiks
  // yang sudah berubah akan ditolak (akun baru) atau dibuang diam-diam (akun
  // lama). Di DALAM satu permintaan, putaran fungsi hanya MENAMBAH pesan dan
  // system/tools tidak berubah, jadi blok thinking-nya tetap sah.
  //
  // Hanya jawaban coach yang ditulis SERVER yang diputar ulang (`ditulis_server`,
  // diisi pemicu database). Baris 'coach' yang dikarang atau disunting lewat
  // PostgREST tidak pernah menjadi giliran `assistant`.
  const pesan: Anthropic.Beta.BetaMessageParam[] = (riwayat ?? [])
    .filter((p) => (p.teks as string).trim().length > 0)
    .filter((p) => (p.peran as string) !== 'coach' || p.ditulis_server === true)
    .map((p) => ({
      role: (p.peran as string) === 'coach' ? 'assistant' : 'user',
      content: p.teks as string,
    }));

  // --- Panggil model ------------------------------------------------------
  const anthropic = new Anthropic({ apiKey: kunciAi });
  const system = susunSystem(konteks);

  // Asal tiap angka yang benar-benar dipakai jawaban ini, untuk disimpan
  // sebagai DATA di samping teksnya — bukan dititipkan ke prosa model.
  //
  // Hanya hasil `ambil_angka` yang jadi widget. Bentuk `WidgetCoach` dirender
  // app, jadi menyimpan bentuk yang tidak bisa dibacanya akan menampilkan kartu
  // rusak — lebih buruk daripada tidak menampilkan kartu sama sekali. Hasil
  // fungsi lain memang sudah masuk ke teks jawabannya.
  const rujukan: { label: string; nilai: string; jenis: string; dasar?: string }[] = [];
  const widget: {
    jenis: 'angka';
    fungsi: string;
    label: string;
    nilai: string;
    unit: string;
    sumber: string;
  }[] = [];
  let teksJawaban = '';

  try {
    for (let putaran = 0; putaran < MAKS_PUTARAN_TOOL; putaran += 1) {
      // Streaming dipakai supaya permintaan panjang tidak menabrak timeout HTTP;
      // `finalMessage()` menunggu sampai balasannya utuh.
      const aliran = anthropic.beta.messages.stream({
        model: MODEL_COACH,
        max_tokens: MAKS_TOKEN_COACH,
        // Effort disetel eksplisit; lihat UPAYA_COACH. `thinking` sengaja tidak
        // dikirim: pada model ini ia selalu menyala dan hanya effort yang
        // mengaturnya.
        output_config: { effort: UPAYA_COACH },
        // Penolakan salah dari pengaman dialihkan ke model pengganti di sisi
        // server, bukan jadi layar kosong. Model pengganti berjalan tanpa blok
        // thinking model utama — itu bisa diterima untuk jawaban sependek ini.
        betas: [BETA_FALLBACK],
        fallbacks: 'default',
        system,
        messages: pesan,
        tools: TOOLS_COACH,
        // `eager_input_streaming` sengaja TIDAK dinyalakan: argumen fungsi di
        // sini semuanya pendek (satu nama kunci), jadi tidak ada yang perlu
        // distreaming — sementara menyalakannya mematikan validasi server
        // terhadap skema dan memindahkan bebannya ke kode ini tanpa imbalan.
      });
      const balasan = await aliran.finalMessage();

      // Penolakan keamanan datang sebagai HTTP 200; memeriksanya lebih dulu
      // adalah satu-satunya cara membedakannya dari jawaban kosong. Sampai di
      // sini berarti SELURUH rantai fallback ikut menolak.
      if (balasan.stop_reason === 'refusal') {
        return jawab(
          { galat: 'Model menolak menjawab pertanyaan ini.', kategori: balasan.stop_details },
          200,
        );
      }

      // Dibaca menurut `type`, bukan posisi: balasan bisa diawali blok
      // thinking (teksnya kosong pada tampilan bawaan), dan catatan di antara
      // pemanggilan fungsi juga datang sebagai blok thinking, bukan teks. Yang
      // dikumpulkan hanya teks jawaban sebenarnya.
      for (const blok of balasan.content) {
        if (blok.type === 'text') teksJawaban += blok.text;
      }

      if (balasan.stop_reason !== 'tool_use') {
        pesan.push({ role: 'assistant', content: balasan.content });
        break;
      }

      // Semua hasil fungsi dikembalikan dalam SATU pesan user. Memecahnya ke
      // beberapa pesan membuat model berhenti memanggil fungsi secara paralel.
      const hasil: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const blok of balasan.content) {
        if (blok.type !== 'tool_use') continue;
        const keluaran = jalankanTool(
          blok.name,
          (blok.input ?? {}) as Record<string, unknown>,
          konteks,
        );
        if (keluaran.ok && blok.name === 'ambil_angka') {
          const d = keluaran.data as {
            kunci: string;
            nilai: number;
            unit: string;
            sumber: string;
            nilai_format: string;
            dasar?: unknown;
          };
          widget.push({
            jenis: 'angka',
            fungsi: blok.name,
            label: d.kunci,
            // Bentuk tampil dari pemformat BERSAMA; app tidak memformat ulang,
            // dan model tidak pernah diminta memformat sendiri.
            nilai: d.nilai_format,
            unit: d.unit,
            sumber: d.sumber,
          });
          rujukan.push({
            label: d.kunci,
            nilai: `${d.nilai_format} ${d.unit}`,
            jenis: d.sumber,
            dasar: JSON.stringify(d.dasar ?? {}),
          });
        }
        hasil.push({
          type: 'tool_result',
          tool_use_id: blok.id,
          is_error: !keluaran.ok,
          content: JSON.stringify(keluaran.ok ? keluaran.data : { alasan: keluaran.alasan }),
        });
      }

      pesan.push({ role: 'assistant', content: balasan.content });
      pesan.push({ role: 'user', content: hasil });
    }
  } catch (galat) {
    console.error('gagal memanggil model', galat);
    return jawab({ galat: 'Coach sedang tidak bisa dihubungi. Coba lagi.' }, 502);
  }

  if (teksJawaban.trim().length === 0) {
    return jawab({ galat: 'Coach tidak mengembalikan jawaban.' }, 502);
  }

  // --- Batas medis, sisi jawaban -------------------------------------------
  // Jawaban yang memuat takaran obat, diagnosis, atau anjuran obat TIDAK
  // disimpan dan tidak dikirim. Yang disimpan hanya kartu penolakannya, supaya
  // riwayat utas tetap utuh dan jujur: ada pertanyaan, dan jawabannya adalah
  // batas — bukan gelembung yang hilang tanpa jejak. Isi jawabannya tidak ikut
  // dicatat ke log; yang dicatat hanya kategorinya.
  // Jawaban (dan kartu penolakannya) ditulis service role supaya database
  // menandainya `ditulis_server`; pengguna sudah terverifikasi di atas.
  const server = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const penolakanJawaban = periksaJawabanMedis(teksJawaban);
  if (penolakanJawaban) {
    console.warn('jawaban diganti penolakan', penolakanJawaban.kategori);
    const { data: kartu, error: galatKartu } = await server
      .from('pesan_coach')
      .insert({
        percakapan_id: percakapanId,
        user_id: userId,
        peran: 'coach',
        teks: '',
        penolakan: penolakanJawaban,
      })
      .select('id')
      .single();
    if (galatKartu) console.error('gagal menyimpan kartu penolakan', galatKartu);
    return jawab({
      ditolak: true,
      sumber_penolakan: 'jawaban',
      penolakan: penolakanJawaban,
      percakapan_id: percakapanId,
      pesan_id: kartu?.id ?? null,
    });
  }

  const { data: pesanCoach, error: galatSimpan } = await server
    .from('pesan_coach')
    .insert({
      percakapan_id: percakapanId,
      user_id: userId,
      peran: 'coach',
      teks: teksJawaban,
      rujukan: rujukan.length > 0 ? rujukan : null,
      widget: widget.length > 0 ? widget : null,
    })
    .select('id, urutan, waktu')
    .single();
  if (galatSimpan) {
    // Jawabannya tetap dikembalikan: gagal menyimpan bukan alasan membuang
    // jawaban yang sudah dibayar dan sudah benar.
    console.error('gagal menyimpan jawaban', galatSimpan);
  }

  return jawab({
    ditolak: false,
    percakapan_id: percakapanId,
    pesan_id: pesanCoach?.id ?? null,
    teks: teksJawaban,
    rujukan,
    widget,
  });
});
