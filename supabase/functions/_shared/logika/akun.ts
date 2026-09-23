// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
/**
 * Masuk akun: validasi & pesan gagal.
 *
 * App memakai akun Supabase yang SAMA dengan web (PRD) — tidak ada pendaftaran
 * di app. Pesan gagal dipetakan dari kode galat Supabase Auth ke kalimat yang
 * tenang dan bisa ditindaklanjuti. Satu hal disengaja: "email tidak terdaftar"
 * dan "kata sandi salah" dijawab SAMA, supaya layar masuk tidak bisa dipakai
 * menebak email siapa yang punya akun.
 */

/** Bentuk email yang masuk akal; server tetap penentu akhirnya. */
export function emailSah(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export type KodeGagalMasuk = 'kredensial' | 'belum-dikonfirmasi' | 'dibatasi' | 'jaringan' | 'lain';

export const PESAN_GAGAL_MASUK: Record<KodeGagalMasuk, string> = {
  kredensial: 'Email atau kata sandi tidak cocok.',
  'belum-dikonfirmasi': 'Email ini belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk Anda.',
  dibatasi: 'Percobaan masuk sedang dibatasi. Coba lagi beberapa menit lagi.',
  jaringan: 'Tidak bisa terhubung. Periksa koneksi, lalu coba lagi.',
  lain: 'Belum bisa masuk. Coba lagi sebentar lagi.',
};

/** Kode galat Supabase Auth (atau galat jaringan) → jenis kegagalan. */
export function kodeGagalMasuk(e: { code?: string | null; status?: number | null; message?: string | null } | null): KodeGagalMasuk {
  if (!e) return 'lain';
  if (e.code === 'invalid_credentials' || e.code === 'user_not_found') return 'kredensial';
  if (e.code === 'email_not_confirmed') return 'belum-dikonfirmasi';
  if (e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit' || e.status === 429) return 'dibatasi';
  if (e.status === 0 || /fetch|network|jaringan/i.test(e.message ?? '')) return 'jaringan';
  return 'lain';
}
