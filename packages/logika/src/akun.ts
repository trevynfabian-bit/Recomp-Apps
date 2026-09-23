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

// ---------------------------------------------------------------------------
// Sesi tersimpan & masuk otomatis.
//
// Sesi bertahan di perangkat supaya app tidak meminta kata sandi setiap dibuka.
// Masa berlakunya MENGGESER: setiap kali app dibuka dengan sesi yang masih
// berlaku, batasnya diperpanjang — yang rutin membuka app tidak pernah diminta
// masuk ulang, yang lama tidak membukanya diminta sekali.
//
// Apa pun yang tersimpan diperlakukan sebagai masukan yang tidak dipercaya:
// isi rusak, versi lama, atau bentuk yang salah berarti "belum masuk", bukan
// app yang gagal dibuka.
// ---------------------------------------------------------------------------

/** Naikkan bila bentuk sesi tersimpan berubah; versi lain dianggap tidak ada. */
export const VERSI_SESI_TERSIMPAN = 1;

/**
 * Masa berlaku sesi sejak terakhir app dibuka. Untuk sesi Supabase, batas
 * sebenarnya diatur di pengaturan Auth proyek; angka ini batas sisi perangkat.
 */
export const LAMA_SESI_HARI = 30;

export type SesiTersimpan = {
  versi: typeof VERSI_SESI_TERSIMPAN;
  pengguna: { id: string; email: string };
  /** ISO 8601. */
  masukPada: string;
  /** ISO 8601; lewat dari ini sesi berakhir. */
  berlakuSampai: string;
};

export type HasilPulihkanSesi =
  | { sesi: SesiTersimpan }
  /** `email` hanya ada untuk sesi yang berakhir: layar masuk mengisinya lebih dulu. */
  | { sesi: null; alasan: 'kosong' | 'rusak' | 'berakhir'; email?: string };

const HARI_MS = 24 * 60 * 60 * 1000;

/** Sesi baru saat masuk, atau perpanjangan saat app dibuka. */
export function buatSesiTersimpan(
  pengguna: { id: string; email: string },
  sekarang: Date,
  masukPada: string = sekarang.toISOString(),
): SesiTersimpan {
  return {
    versi: VERSI_SESI_TERSIMPAN,
    pengguna: { id: pengguna.id, email: pengguna.email },
    masukPada,
    berlakuSampai: new Date(sekarang.getTime() + LAMA_SESI_HARI * HARI_MS).toISOString(),
  };
}

function waktuSah(s: unknown): s is string {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}

/**
 * Baca sesi tersimpan. Berhasil → sesi yang SUDAH diperpanjang (simpan ulang
 * hasilnya). Gagal → alasan yang bisa ditampilkan dengan tenang.
 */
export function pulihkanSesi(teks: string | null, sekarang: Date): HasilPulihkanSesi {
  if (teks === null || teks === '') return { sesi: null, alasan: 'kosong' };
  let isi: unknown;
  try {
    isi = JSON.parse(teks);
  } catch {
    return { sesi: null, alasan: 'rusak' };
  }
  const s = isi as Partial<SesiTersimpan> | null;
  if (
    !s ||
    typeof s !== 'object' ||
    s.versi !== VERSI_SESI_TERSIMPAN ||
    !s.pengguna ||
    typeof s.pengguna.id !== 'string' ||
    s.pengguna.id === '' ||
    typeof s.pengguna.email !== 'string' ||
    !emailSah(s.pengguna.email) ||
    !waktuSah(s.masukPada) ||
    !waktuSah(s.berlakuSampai)
  ) {
    return { sesi: null, alasan: 'rusak' };
  }
  if (Date.parse(s.berlakuSampai) <= sekarang.getTime()) {
    return { sesi: null, alasan: 'berakhir', email: s.pengguna.email };
  }
  return { sesi: buatSesiTersimpan(s.pengguna, sekarang, s.masukPada) };
}

/** Pesan di layar masuk setelah pemulihan gagal; `null` = tidak perlu berkata apa-apa. */
export function pesanPemulihanSesi(alasan: 'kosong' | 'rusak' | 'berakhir'): string | null {
  if (alasan === 'berakhir') return 'Sesi sebelumnya sudah berakhir. Masuk lagi untuk melanjutkan.';
  // Kosong: pertama kali. Rusak: pengguna tidak bisa berbuat apa-apa soal itu.
  return null;
}
