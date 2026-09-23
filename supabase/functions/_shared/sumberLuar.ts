/**
 * Bagian bersama webhook Strava & WHOOP: tanda tangan, token, dan pengambilan
 * data dari API layanan.
 *
 * Prinsip yang dipegang kedua webhook:
 *
 * • ISI PERISTIWA TIDAK DIPERCAYA SEBAGAI DATA. Peristiwa hanya berkata
 *   "ada yang berubah pada objek X milik akun Y"; angkanya selalu diambil
 *   ulang dari API layanan dengan token pengguna. Webhook Strava tidak
 *   ditandatangani, jadi peristiwa palsu paling jauh membuat kita mengambil
 *   ulang data asli — dan peristiwa "hapus" atau "izin dicabut" dibuktikan
 *   dulu ke API (404 / 401) sebelum dijalankan.
 * • JAWAB CEPAT, KERJAKAN DI LATAR. Strava memberi 2 detik, WHOOP 1 detik.
 *   Mengambil token + data + menulis tidak muat di sana; pekerjaannya
 *   diserahkan ke `EdgeRuntime.waitUntil`.
 * • DUA JENIS GAGAL. Izin yang dicabut (token ditolak) memutus koneksi — dan
 *   pemicu database menghapus tokennya. Gangguan sementara (5xx, 429,
 *   jaringan) hanya dicatat sebagai galat; peristiwa berikutnya mencoba lagi.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type SumberOAuth = 'strava' | 'whoop';

/** Token ditolak layanan: izin dicabut atau refresh token tidak berlaku lagi. */
export class GalatIzin extends Error {}
/** Gangguan yang bisa pulih sendiri: 5xx, 429, jaringan. */
export class GalatSementara extends Error {}

const enc = new TextEncoder();

/** Perbandingan waktu-tetap lewat hash, untuk rahasia dan tanda tangan. */
export async function samaWaktuTetap(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let beda = 0;
  for (let i = 0; i < p.length; i += 1) beda |= p[i] ^ q[i];
  return beda === 0;
}

/** Tanda tangan WHOOP yang lebih tua dari ini ditolak (cegah kiriman ulang). */
export const BATAS_UMUR_TANDA_WHOOP_MS = 5 * 60_000;

/**
 * Verifikasi tanda tangan webhook WHOOP:
 * base64(HMAC-SHA256(cap_waktu + badan_mentah, client_secret)).
 * `badanMentah` HARUS teks badan persis seperti diterima — JSON yang diurai
 * lalu disusun ulang tidak akan cocok.
 */
export async function tandaTanganWhoopSah(
  badanMentah: string,
  capWaktu: string | null,
  tandaTangan: string | null,
  rahasia: string,
  sekarangMs: number = Date.now(),
): Promise<boolean> {
  if (!capWaktu || !tandaTangan || !rahasia) return false;
  const ms = Number(capWaktu);
  if (!Number.isFinite(ms) || Math.abs(sekarangMs - ms) > BATAS_UMUR_TANDA_WHOOP_MS) return false;
  const kunci = await crypto.subtle.importKey('raw', enc.encode(rahasia), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const tanda = new Uint8Array(await crypto.subtle.sign('HMAC', kunci, enc.encode(capWaktu + badanMentah)));
  let biner = '';
  for (const b of tanda) biner += String.fromCharCode(b);
  return samaWaktuTetap(btoa(biner), tandaTangan);
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

const URL_TOKEN: Record<SumberOAuth, string> = {
  strava: 'https://www.strava.com/oauth/token',
  whoop: 'https://api.prod.whoop.com/oauth/oauth2/token',
};

/** Token disegarkan bila sisa umurnya kurang dari ini. */
const JEDA_SEGAR_MS = 2 * 60_000;

type Koneksi = { id: string; user_id: string };

/** Koneksi TERHUBUNG untuk akun luar; `null` bila tidak ada. */
export async function koneksiAkun(db: SupabaseClient, sumber: SumberOAuth, akun: string): Promise<Koneksi | null> {
  const { data, error } = await db
    .from('health_connections')
    .select('id, user_id')
    .eq('sumber', sumber)
    .eq('akun_eksternal', akun)
    .eq('status', 'terhubung')
    .maybeSingle();
  if (error) throw new GalatSementara(`Koneksi tidak terbaca: ${error.message}`);
  return data as Koneksi | null;
}

/**
 * Token akses yang masih berlaku untuk satu koneksi, disegarkan bila perlu.
 *
 * Catatan: dua peristiwa yang tiba bersamaan bisa sama-sama menyegarkan.
 * Strava mengembalikan refresh token yang sama sampai kedaluwarsa, jadi
 * aman; WHOOP memutar refresh token — penyegaran kedua yang kalah balapan
 * mendapat 400 dan peristiwa itu dicatat sebagai galat sementara (token dari
 * pemenang balapan sudah tersimpan), bukan memutus koneksi.
 */
export async function tokenAkses(db: SupabaseClient, sumber: SumberOAuth, koneksi: Koneksi): Promise<string> {
  const { data: rahasia, error } = await db
    .from('health_connection_secrets')
    .select('access_token, refresh_token, kedaluwarsa_pada, updated_at')
    .eq('connection_id', koneksi.id)
    .maybeSingle();
  if (error) throw new GalatSementara(`Token tidak terbaca: ${error.message}`);
  if (!rahasia?.access_token) throw new GalatIzin('Koneksi tanpa token.');

  const kedaluwarsa = rahasia.kedaluwarsa_pada ? Date.parse(rahasia.kedaluwarsa_pada) : 0;
  if (kedaluwarsa - Date.now() > JEDA_SEGAR_MS) return rahasia.access_token;
  if (!rahasia.refresh_token) throw new GalatIzin('Token kedaluwarsa dan tidak bisa disegarkan.');

  const prefiks = sumber.toUpperCase();
  const badan = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: rahasia.refresh_token,
    client_id: Deno.env.get(`${prefiks}_CLIENT_ID`) ?? '',
    client_secret: Deno.env.get(`${prefiks}_CLIENT_SECRET`) ?? '',
  });
  if (sumber === 'whoop') badan.set('scope', 'offline');

  let jawab: Response;
  try {
    jawab = await fetch(URL_TOKEN[sumber], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: badan,
    });
  } catch (e) {
    throw new GalatSementara(`Layanan token tidak terjangkau: ${String(e)}`);
  }

  if (jawab.status === 400 || jawab.status === 401) {
    // Balapan penyegaran (lihat di atas): bila token sudah diganti peristiwa
    // lain sejak kita membacanya, ini bukan pencabutan izin.
    const { data: kini } = await db
      .from('health_connection_secrets')
      .select('updated_at')
      .eq('connection_id', koneksi.id)
      .maybeSingle();
    if (kini && kini.updated_at !== rahasia.updated_at) {
      throw new GalatSementara('Token baru saja disegarkan peristiwa lain.');
    }
    throw new GalatIzin('Izin ditolak saat menyegarkan token.');
  }
  if (!jawab.ok) throw new GalatSementara(`Layanan token menjawab ${jawab.status}.`);

  const t = (await jawab.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  };
  const kedaluwarsaBaru =
    t.expires_at != null
      ? new Date(t.expires_at * 1000).toISOString()
      : new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();

  const { error: galatSimpan } = await db
    .from('health_connection_secrets')
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? rahasia.refresh_token,
      kedaluwarsa_pada: kedaluwarsaBaru,
    })
    .eq('connection_id', koneksi.id);
  if (galatSimpan) throw new GalatSementara(`Token baru tidak tersimpan: ${galatSimpan.message}`);
  return t.access_token;
}

/**
 * GET JSON dari API layanan. `null` untuk 404 (objeknya sudah tidak ada);
 * 401/403 → GalatIzin; 429/5xx/jaringan → GalatSementara.
 */
export async function ambilJson<T>(url: string, token: string): Promise<T | null> {
  let jawab: Response;
  try {
    jawab = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new GalatSementara(`API tidak terjangkau: ${String(e)}`);
  }
  if (jawab.status === 404) return null;
  if (jawab.status === 401 || jawab.status === 403) throw new GalatIzin(`API menolak token (${jawab.status}).`);
  if (!jawab.ok) throw new GalatSementara(`API menjawab ${jawab.status}.`);
  return (await jawab.json()) as T;
}

// ---------------------------------------------------------------------------
// Latar & pencatatan hasil
// ---------------------------------------------------------------------------

declare const EdgeRuntime: { waitUntil(tugas: Promise<unknown>): void } | undefined;

/** Jalankan setelah jawaban dikirim; galat dicatat, tidak pernah dilempar. */
export function jalankanDiLatar(nama: string, tugas: () => Promise<void>): void {
  const janji = tugas().catch((e) => console.error(`[${nama}] gagal di latar:`, e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(janji);
}

/** Pesan galat untuk layar Sumber data — berbahasa Indonesia, tanpa detail teknis. */
export const PESAN_GALAT: Record<SumberOAuth, { izin: string; sementara: string }> = {
  strava: {
    izin: 'Izin Strava dicabut atau kedaluwarsa. Sambungkan ulang untuk melanjutkan.',
    sementara: 'Strava sedang tidak bisa dihubungi. Dicoba lagi saat aktivitas berikutnya masuk.',
  },
  whoop: {
    izin: 'Izin WHOOP dicabut atau kedaluwarsa. Sambungkan ulang untuk melanjutkan.',
    sementara: 'WHOOP sedang tidak bisa dihubungi. Dicoba lagi saat data berikutnya masuk.',
  },
};

/**
 * Tangani galat satu peristiwa: izin → putus koneksi; sementara → catat.
 * Galat lain dilempar ulang (bug, bukan keadaan layanan).
 */
export async function tanganiGalat(db: SupabaseClient, sumber: SumberOAuth, akun: string, e: unknown): Promise<void> {
  if (e instanceof GalatIzin) {
    await db.rpc('putus_koneksi_luar', { p_sumber: sumber, p_akun: akun, p_alasan: PESAN_GALAT[sumber].izin });
    return;
  }
  if (e instanceof GalatSementara) {
    await db.rpc('catat_galat_koneksi_luar', { p_sumber: sumber, p_akun: akun, p_pesan: PESAN_GALAT[sumber].sementara });
    console.warn(`[${sumber}] galat sementara untuk akun ${akun}: ${e.message}`);
    return;
  }
  throw e;
}

/** Kirim kiriman ternormalisasi ke database; galat tulis = galat sementara. */
export async function kirimKeDb(
  db: SupabaseClient,
  sumber: SumberOAuth,
  akun: string,
  kiriman: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await db.rpc('terima_kiriman_luar', { p_sumber: sumber, p_akun: akun, p_kiriman: kiriman });
  if (error) throw new GalatSementara(`Kiriman tidak tersimpan: ${error.message}`);
  const hasil = data as { diabaikan?: string; dilewati?: unknown[] } | null;
  if (hasil?.dilewati && hasil.dilewati.length > 0) {
    console.warn(`[${sumber}] ${hasil.dilewati.length} isi dilewati untuk akun ${akun}`, hasil.dilewati);
  }
}
