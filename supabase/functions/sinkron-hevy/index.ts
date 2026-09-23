/**
 * Penarikan Hevy terjadwal.
 *
 * Hevy tidak punya webhook, jadi cron memanggil fungsi ini tiap jam (lihat
 * `supabase/jadwal/sinkron_hevy.sql`). Untuk setiap koneksi Hevy yang
 * terhubung — yang paling lama tidak ditarik lebih dulu — fungsi ini menarik
 * `GET /v1/workouts/events?since=<kursor>` sampai halaman terakhir, lalu
 * menyerahkan SEMUANYA ke `terima_sesi_hevy` dalam satu panggilan: sesi,
 * penghapusan, dan kursor berikutnya masuk dalam satu transaksi.
 *
 * Yang dijaga:
 * • KURSOR TIDAK PERNAH MENDAHULUI DATA. Penarikan yang gagal di halaman
 *   ketiga tidak menulis apa pun; putaran berikutnya mengulang dari kursor
 *   yang sama. Kursor berikutnya = saat penarikan DIMULAI dikurangi lima
 *   menit, jadi workout yang disimpan tepat saat kita menarik tidak terlewat
 *   (menariknya dua kali aman: penerimanya idempoten).
 * • Penarikan PERTAMA mengambil 90 hari. Riwayat lebih lama masuk lewat impor
 *   CSV di app — menarik riwayat bertahun-tahun lewat API bersaing dengan
 *   batas waktu fungsi dan batas laju Hevy untuk hasil yang sama.
 * • Kunci yang ditolak (401/403: kunci dicabut, atau langganan Hevy Pro
 *   berakhir) memutus koneksi dengan alasannya; gangguan sementara hanya
 *   dicatat dan dicoba lagi jam berikutnya.
 *
 * Penyebaran (tanpa rahasia di repo):
 *   supabase secrets set HEVY_JADWAL_RAHASIA=<string acak panjang>
 *   supabase functions deploy sinkron-hevy
 * lalu jadwalkan lewat `supabase/jadwal/sinkron_hevy.sql`.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { kirimanHevy, kursorHevyBerikut } from '../_shared/logika/index.ts';
import type { PeristiwaHevy } from '../_shared/logika/index.ts';
import { samaWaktuTetap } from '../_shared/sumberLuar.ts';

const API = 'https://api.hevyapp.com/v1';
/** Maksimum ukuran halaman API peristiwa Hevy. */
const UKURAN_HALAMAN = 10;
/** Lebih dari ini dalam satu putaran = bukan penarikan inkremental; ditunda. */
const MAKS_HALAMAN = 100;
const BATAS_ANTREAN = 50;
/** Berhenti mengambil koneksi BARU setelah selama ini. */
const BATAS_WAKTU_MS = 100_000;
const HARI_PENARIKAN_PERTAMA = 90;

const PESAN = {
  izin: 'Kunci API Hevy ditolak — kunci dicabut atau langganan Hevy Pro berakhir. Sambungkan ulang dengan kunci baru.',
  sementara: 'Hevy sedang tidak bisa dihubungi. Dicoba lagi dalam satu jam.',
};

class GalatKunci extends Error {}
class GalatSementara extends Error {}

type Antrean = { connection_id: string; user_id: string; kursor_sinkron: string | null };

type HasilKoneksi =
  | { status: 'ditarik'; peristiwa: number; sesi: number; dihapus: number; dilewati: number }
  | { status: 'diputus' | 'ditunda'; alasan: string };

function jawab(badan: unknown, status = 200): Response {
  return new Response(JSON.stringify(badan), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Tarik SEMUA halaman peristiwa sejak kursor. Melempar bila ada yang gagal. */
async function tarikPeristiwa(kunci: string, sejak: string): Promise<PeristiwaHevy[]> {
  const semua: PeristiwaHevy[] = [];
  for (let halaman = 1; halaman <= MAKS_HALAMAN; halaman += 1) {
    const url = `${API}/workouts/events?page=${halaman}&pageSize=${UKURAN_HALAMAN}&since=${encodeURIComponent(sejak)}`;
    let r: Response;
    try {
      r = await fetch(url, { headers: { 'api-key': kunci, Accept: 'application/json' } });
    } catch (e) {
      throw new GalatSementara(`Hevy tidak terjangkau: ${String(e)}`);
    }
    if (r.status === 401 || r.status === 403) throw new GalatKunci(`Hevy menolak kunci (${r.status}).`);
    // Halaman di luar jangkauan: tidak ada peristiwa lagi.
    if (r.status === 404) return semua;
    if (!r.ok) throw new GalatSementara(`Hevy menjawab ${r.status}.`);
    const isi = (await r.json()) as { page: number; page_count: number; events: PeristiwaHevy[] };
    semua.push(...(isi.events ?? []));
    if (halaman >= (isi.page_count ?? 0)) return semua;
  }
  throw new GalatSementara(`Lebih dari ${MAKS_HALAMAN} halaman peristiwa; ditunda.`);
}

async function tarikSatu(db: SupabaseClient, k: Antrean): Promise<HasilKoneksi> {
  const { data: rahasia, error } = await db
    .from('health_connection_secrets')
    .select('kunci_api')
    .eq('connection_id', k.connection_id)
    .maybeSingle();
  if (error) return { status: 'ditunda', alasan: `kunci tidak terbaca: ${error.message}` };

  const mulai = new Date();
  const sejak =
    k.kursor_sinkron ?? new Date(mulai.getTime() - HARI_PENARIKAN_PERTAMA * 86_400_000).toISOString();

  try {
    if (!rahasia?.kunci_api) throw new GalatKunci('Koneksi Hevy tanpa kunci API.');
    const peristiwa = await tarikPeristiwa(rahasia.kunci_api, sejak);
    const { sesi, hapus } = kirimanHevy(peristiwa);
    const { data, error: galatTulis } = await db.rpc('terima_sesi_hevy', {
      p_connection_id: k.connection_id,
      p_sesi: sesi,
      p_hapus: hapus,
      p_kursor: kursorHevyBerikut(mulai),
    });
    if (galatTulis) throw new GalatSementara(`Sesi tidak tersimpan: ${galatTulis.message}`);
    const h = data as { sesi?: number; dihapus?: number; dilewati?: unknown[]; diabaikan?: string };
    if (h.diabaikan) return { status: 'ditunda', alasan: h.diabaikan };
    if (h.dilewati && h.dilewati.length > 0) console.warn(`[hevy] ${k.connection_id}: sesi dilewati`, h.dilewati);
    return {
      status: 'ditarik',
      peristiwa: peristiwa.length,
      sesi: h.sesi ?? 0,
      dihapus: h.dihapus ?? 0,
      dilewati: h.dilewati?.length ?? 0,
    };
  } catch (e) {
    const sekarang = new Date().toISOString();
    if (e instanceof GalatKunci) {
      // Pemicu database menghapus kunci saat status menjadi terputus.
      await db
        .from('health_connections')
        .update({ status: 'terputus', galat_terakhir: PESAN.izin, galat_pada: sekarang })
        .eq('id', k.connection_id);
      return { status: 'diputus', alasan: e.message };
    }
    if (e instanceof GalatSementara) {
      await db
        .from('health_connections')
        .update({ galat_terakhir: PESAN.sementara, galat_pada: sekarang })
        .eq('id', k.connection_id);
      return { status: 'ditunda', alasan: e.message };
    }
    throw e;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  const rahasia = Deno.env.get('HEVY_JADWAL_RAHASIA') ?? '';
  const diberikan = req.headers.get('x-jadwal-rahasia') ?? '';
  if (!rahasia || !(await samaWaktuTetap(diberikan, rahasia))) {
    return jawab({ galat: 'Tidak berwenang' }, 401);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: antrean, error } = await db.rpc('koneksi_hevy_perlu_sinkron', { p_batas: BATAS_ANTREAN });
  if (error) return jawab({ galat: `Antrean tidak terbaca: ${error.message}` }, 500);

  const awal = Date.now();
  const hasil: Record<string, HasilKoneksi> = {};
  for (const k of (antrean ?? []) as Antrean[]) {
    if (Date.now() - awal > BATAS_WAKTU_MS) break;
    hasil[k.connection_id] = await tarikSatu(db, k);
  }
  return jawab({ diproses: Object.keys(hasil).length, antrean: (antrean ?? []).length, hasil });
});
