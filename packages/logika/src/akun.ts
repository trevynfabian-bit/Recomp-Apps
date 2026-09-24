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

export type KodeGagalMasuk =
  | 'kredensial'
  | 'belum-dikonfirmasi'
  | 'dibatasi'
  | 'dinonaktifkan'
  | 'jaringan'
  | 'server'
  | 'lain';

export const PESAN_GAGAL_MASUK: Record<KodeGagalMasuk, string> = {
  kredensial: 'Email atau kata sandi tidak cocok.',
  'belum-dikonfirmasi': 'Email ini belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk Anda.',
  dibatasi: 'Percobaan masuk sedang dibatasi. Coba lagi beberapa menit lagi.',
  dinonaktifkan: 'Akun ini sedang dinonaktifkan, jadi belum bisa dipakai untuk masuk.',
  jaringan: 'Tidak bisa terhubung. Periksa koneksi, lalu coba lagi.',
  server: 'Server akun sedang tidak menjawab. Coba lagi beberapa menit lagi.',
  lain: 'Belum bisa masuk. Coba lagi sebentar lagi.',
};

/**
 * Kode galat Supabase Auth (atau galat jaringan) → jenis kegagalan.
 *
 * Supabase Auth versi baru mengirim `code`; versi lama (proyek yang belum
 * diperbarui) hanya mengirim kalimat seperti "Invalid login credentials".
 * Keduanya dikenali, karena proyek Supabase-nya dipakai bersama web dan
 * versinya tidak diatur dari app.
 */
export function kodeGagalMasuk(e: { code?: string | null; status?: number | null; message?: string | null } | null): KodeGagalMasuk {
  if (!e) return 'lain';
  const kode = e.code ?? '';
  const pesan = e.message ?? '';
  if (kode === 'invalid_credentials' || kode === 'user_not_found' || /invalid login credentials/i.test(pesan)) return 'kredensial';
  if (kode === 'email_not_confirmed' || /email not confirmed/i.test(pesan)) return 'belum-dikonfirmasi';
  if (kode === 'user_banned' || /user is banned/i.test(pesan)) return 'dinonaktifkan';
  if (/^over_\w+_rate_limit$/.test(kode) || e.status === 429 || /rate limit|you can only request this after/i.test(pesan)) return 'dibatasi';
  if (e.status === 0 || /fetch|network|jaringan/i.test(pesan)) return 'jaringan';
  if (typeof e.status === 'number' && e.status >= 500) return 'server';
  return 'lain';
}

/**
 * Pesan saat tautan atur ulang kata sandi tidak terkirim; `null` = tampilkan
 * seolah terkirim.
 *
 * `kredensial` (email tidak dikenal) sengaja dijawab SAMA dengan berhasil:
 * "Bila email ini punya akun, tautan sudah dikirim". Menjawab "tidak
 * terkirim" untuk email yang tidak terdaftar membocorkan email mana yang
 * punya akun — hal yang juga dijaga layar masuk.
 */
export function pesanGagalAturUlang(kode: KodeGagalMasuk): string | null {
  switch (kode) {
    case 'kredensial':
      return null;
    case 'dibatasi':
      return 'Tautan baru saja diminta. Tunggu beberapa menit sebelum meminta lagi.';
    case 'jaringan':
      return 'Tautan belum terkirim. Periksa koneksi, lalu coba lagi.';
    case 'server':
      return 'Tautan belum terkirim; server akun sedang tidak menjawab. Coba lagi beberapa menit lagi.';
    default:
      return 'Tautan belum terkirim. Coba lagi sebentar lagi.';
  }
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

/**
 * Label status akun di Setelan: akun web sungguhan atau akun contoh (app
 * tanpa kredensial Supabase). Tanpa label ini, orang yang mencoba app dalam
 * mode contoh tidak tahu bahwa isiannya tidak pernah sampai ke server.
 */
export function labelStatusAkun(tersambungServer: boolean): { label: string; keterangan: string; nada: 'sukses' | 'peringatan' } {
  return tersambungServer
    ? { label: 'Akun web', keterangan: 'Data tersimpan di akun yang sama dengan web.', nada: 'sukses' }
    : { label: 'Akun contoh', keterangan: 'Mode contoh: isian hanya di perangkat ini, tidak dikirim ke server.', nada: 'peringatan' };
}

// ---------------------------------------------------------------------------
// Sesi perangkat × sesi Supabase.
//
// Ada dua catatan di perangkat: sesi tersimpan milik app (batas 30 hari yang
// menggeser, di atas) dan sesi Supabase Auth (token akses & token pembaru).
// Catatan app adalah GERBANG: tanpa catatan yang berlaku, app tidak masuk,
// meski token Supabase masih tertinggal (mis. keluar yang terputus sebelum
// server menjawab). Sebaliknya catatan app saja tidak cukup: bila Supabase
// sudah mencabut sesinya (kata sandi diganti di web, "keluar dari semua
// perangkat"), app ikut keluar.
// ---------------------------------------------------------------------------

/** Keadaan sesi Supabase Auth di perangkat ini. */
export type SesiServer =
  | { ada: true; pengguna: { id: string; email: string } }
  | { ada: false }
  /**
   * Tidak bisa dipastikan: token perlu diperbarui tetapi server tidak
   * terjangkau (luring, server bermasalah), atau memang tidak diperiksa.
   */
  | { ada: 'tidak-pasti' };

export type KeputusanSesi =
  | { masuk: SesiTersimpan }
  | {
      masuk: null;
      alasan: 'kosong' | 'rusak' | 'berakhir';
      email?: string;
      /** Hapus sisa sesi Supabase di perangkat supaya tidak bisa dipakai lagi. */
      bersihkanServer: boolean;
    };

/**
 * Gabungkan hasil `pulihkanSesi` dengan keadaan sesi Supabase.
 *
 *   • catatan app tidak berlaku → keluar; sisa sesi Supabase dibersihkan;
 *   • sesi Supabase milik akun LAIN → keluar tanpa pesan (dianggap rusak):
 *     data satu akun tidak pernah tampil di bawah catatan akun lain;
 *   • sesi Supabase sudah dicabut → keluar dengan pesan "berakhir";
 *   • server tidak terjangkau → tetap masuk dengan catatan app. App yang
 *     dibuka tanpa sinyal tidak boleh melempar orang ke layar masuk; bila
 *     token ternyata memang dicabut, Supabase memberi tahu saat terhubung.
 *
 * Email diambil dari server bila ada, karena email bisa diganti di web.
 */
export function putuskanSesi(lokal: HasilPulihkanSesi, server: SesiServer, sekarang: Date): KeputusanSesi {
  if (!lokal.sesi) {
    return {
      masuk: null,
      alasan: lokal.alasan,
      ...(lokal.email ? { email: lokal.email } : {}),
      bersihkanServer: server.ada !== false,
    };
  }
  if (server.ada === 'tidak-pasti') return { masuk: lokal.sesi };
  if (server.ada === false) {
    return { masuk: null, alasan: 'berakhir', email: lokal.sesi.pengguna.email, bersihkanServer: false };
  }
  if (server.pengguna.id !== lokal.sesi.pengguna.id) {
    return { masuk: null, alasan: 'rusak', bersihkanServer: true };
  }
  const email = emailSah(server.pengguna.email) ? server.pengguna.email : lokal.sesi.pengguna.email;
  return { masuk: buatSesiTersimpan({ id: server.pengguna.id, email }, sekarang, lokal.sesi.masukPada) };
}
