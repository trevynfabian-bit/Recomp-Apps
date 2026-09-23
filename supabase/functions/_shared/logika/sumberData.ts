// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import { formatTanggalPanjang, ZONA_WAKTU } from './format.ts';

/**
 * Status sumber data kesehatan: Apple Health, WHOOP, Strava, Hevy.
 *
 * Satu hal yang membuat halaman ini mudah salah: "sudah lama tidak ada data"
 * berarti hal yang BERBEDA untuk tiap mekanisme sinkron.
 *
 *   • HealthKit disinkron saat app dibuka dan lewat background delivery. Tidak
 *     ada data sehari penuh berarti sinkronnya macet — timbangan pagi tetap
 *     terjadi setiap hari.
 *   • Hevy ditarik cron tiap jam. Penarikan yang terakhir berhasil lima jam lalu
 *     berarti beberapa putaran gagal berturut-turut.
 *   • Strava & WHOOP datang lewat WEBHOOK, yaitu hanya saat ada aktivitas baru.
 *     Tiga hari tanpa kiriman bisa berarti tiga hari istirahat. Menandainya
 *     "terlambat" akan mengajari pengguna mengabaikan peringatan di halaman
 *     ini — padahal peringatan yang sungguhan (izin dicabut, token kedaluwarsa)
 *     datang sebagai status `terputus` atau galat, bukan sebagai jeda waktu.
 */

export type SumberData = 'apple_health' | 'whoop' | 'strava' | 'hevy';
export type MekanismeSync = 'healthkit' | 'webhook' | 'cron';

/**
 * Cara izin diberikan — BUKAN sama dengan cara data mengalir. Hevy ditarik
 * cron seperti layanan lain yang memakai OAuth, tapi aksesnya lewat kunci API
 * yang disalin pengguna sendiri; alur menghubungkannya karena itu berbeda.
 */
export type JenisOtorisasi = 'healthkit' | 'oauth' | 'kunci_api';
export type StatusKoneksi = 'terhubung' | 'terputus' | 'belum';

/** Satu koneksi sumber data, seperti yang akan dikirim `health_connections`. */
export type KoneksiSumber = {
  sumber: SumberData;
  status: StatusKoneksi;
  /** ISO 8601; `null` bila belum pernah dihubungkan. */
  terhubungPada: string | null;
  /** ISO 8601 data terakhir yang BERHASIL masuk; `null` bila belum pernah. */
  sinkronTerakhir: string | null;
  /** Galat terakhir dari layanan, sudah berbahasa Indonesia; `null` bila tidak ada. */
  galatTerakhir: string | null;
  /** Yang masuk hari ini, mis. `{ label: 'langkah', jumlah: 8412 }`. */
  masukHariIni: { label: string; jumlah: number }[];
};

export const PROFIL_SUMBER: Record<
  SumberData,
  {
    nama: string;
    mekanisme: MekanismeSync;
    otorisasi: JenisOtorisasi;
    /** Satu kalimat tentang apa yang terjadi saat menghubungkan. */
    caraHubungkan: string;
    /** Cara data masuk, dalam bahasa pengguna. */
    jalur: string;
    /** Apa yang dibawa sumber ini ke app. */
    membawa: string[];
    /**
     * Setelah berapa jam tanpa data sumber ini dianggap terlambat. `null` untuk
     * webhook: jeda di sana berarti tidak ada aktivitas, bukan kerusakan.
     */
    batasTerlambatJam: number | null;
  }
> = {
  apple_health: {
    nama: 'Apple Health',
    mekanisme: 'healthkit',
    otorisasi: 'healthkit',
    caraHubungkan:
      'Pilihan data diatur di dialog izin Apple Health. App ini hanya membaca — tidak menulis apa pun ke Apple Health.',
    jalur: 'Disinkron saat app dibuka dan di latar belakang',
    membawa: ['berat pagi', 'langkah', 'energi aktif', 'tidur'],
    batasTerlambatJam: 24,
  },
  whoop: {
    nama: 'WHOOP',
    mekanisme: 'webhook',
    otorisasi: 'oauth',
    caraHubungkan:
      'Anda akan masuk di halaman WHOOP, menyetujui akses, lalu kembali ke sini.',
    jalur: 'Masuk otomatis setiap ada data baru',
    membawa: ['recovery', 'tidur', 'strain'],
    batasTerlambatJam: null,
  },
  strava: {
    nama: 'Strava',
    mekanisme: 'webhook',
    otorisasi: 'oauth',
    caraHubungkan:
      'Anda akan masuk di halaman Strava, menyetujui akses, lalu kembali ke sini. Biarkan izin aktivitas tetap dicentang.',
    jalur: 'Masuk otomatis setiap aktivitas selesai',
    membawa: ['lari', 'padel', 'aktivitas lain'],
    batasTerlambatJam: null,
  },
  hevy: {
    nama: 'Hevy',
    mekanisme: 'cron',
    otorisasi: 'kunci_api',
    caraHubungkan:
      'Tempel kunci API dari hevy.com › Settings › Developer. Kunci ini hanya tersedia untuk akun Hevy Pro.',
    jalur: 'Ditarik otomatis setiap jam',
    membawa: ['latihan', 'set, beban & repetisi'],
    batasTerlambatJam: 3,
  },
};

/** Urutan tampil bawaan; halaman mengurutkan ulang menurut kesehatannya. */
export const URUTAN_SUMBER: SumberData[] = ['apple_health', 'whoop', 'strava', 'hevy'];

export type TingkatKesehatan = 'bermasalah' | 'terlambat' | 'menunggu' | 'sehat' | 'belum';

export type KesehatanKoneksi = {
  tingkat: TingkatKesehatan;
  /** Label pendek untuk pill status. */
  ringkas: string;
  /** Satu kalimat: apa yang terjadi dan, bila perlu, apa yang bisa dilakukan. */
  keterangan: string;
};

const MENIT = 60_000;
const JAM = 60 * MENIT;

/**
 * Waktu relatif gaya Indonesia: "baru saja", "12 menit lalu", "3 jam lalu",
 * "kemarin", "4 hari lalu", lalu tanggal ("Jumat, 12 September") setelah
 * sepekan — "23 hari lalu" memaksa pembaca menghitung mundur sendiri.
 */
export function formatWaktuRelatif(iso: string, sekarang: Date): string {
  const selisih = sekarang.getTime() - new Date(iso).getTime();
  if (selisih < MENIT) return 'baru saja';
  if (selisih < JAM) return `${Math.floor(selisih / MENIT)} menit lalu`;
  if (selisih < 24 * JAM) return `${Math.floor(selisih / JAM)} jam lalu`;

  // Lewat 24 jam, jeda dihitung per hari KALENDER Asia/Jakarta, bukan per 24
  // jam: 30 jam lalu bisa "kemarin" atau "2 hari lalu" tergantung jamnya, dan
  // pembaca mengartikannya menurut kalender.
  const hariIni = tanggalJakarta(sekarang);
  const hariItu = tanggalJakarta(new Date(iso));
  const jedaHari = Math.round(
    (Date.parse(`${hariIni}T00:00:00Z`) - Date.parse(`${hariItu}T00:00:00Z`)) / (24 * JAM),
  );
  if (jedaHari <= 1) return 'kemarin';
  if (jedaHari < 7) return `${jedaHari} hari lalu`;
  return formatTanggalPanjang(hariItu);
}

function tanggalJakarta(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: ZONA_WAKTU });
}

/** Nilai kesehatan satu koneksi pada saat `sekarang`. */
export function kesehatanKoneksi(k: KoneksiSumber, sekarang: Date): KesehatanKoneksi {
  const profil = PROFIL_SUMBER[k.sumber];

  if (k.status === 'belum') {
    return {
      tingkat: 'belum',
      ringkas: 'Belum dihubungkan',
      keterangan: `Hubungkan untuk membawa ${gabungDaftar(profil.membawa)}.`,
    };
  }

  if (k.status === 'terputus') {
    return {
      tingkat: 'bermasalah',
      ringkas: 'Terputus',
      keterangan: k.galatTerakhir ?? `Akses ke ${profil.nama} berakhir. Sambungkan ulang untuk melanjutkan.`,
    };
  }

  if (k.galatTerakhir) {
    return { tingkat: 'bermasalah', ringkas: 'Gagal sinkron', keterangan: k.galatTerakhir };
  }

  if (k.sinkronTerakhir === null) {
    return {
      tingkat: 'menunggu',
      ringkas: 'Menunggu data',
      keterangan:
        profil.mekanisme === 'webhook'
          ? `Terhubung. Data pertama masuk saat ada aktivitas baru di ${profil.nama}.`
          : 'Terhubung. Data pertama sedang ditarik.',
    };
  }

  const relatif = formatWaktuRelatif(k.sinkronTerakhir, sekarang);
  const umurJam = (sekarang.getTime() - new Date(k.sinkronTerakhir).getTime()) / JAM;

  if (profil.batasTerlambatJam !== null && umurJam > profil.batasTerlambatJam) {
    return {
      tingkat: 'terlambat',
      ringkas: 'Terlambat',
      keterangan:
        profil.mekanisme === 'healthkit'
          ? `Sinkron terakhir ${relatif}. Buka app ini, atau izinkan pembaruan di latar belakang.`
          : `Penarikan terakhir berhasil ${relatif}. App akan mencoba lagi otomatis.`,
    };
  }

  return {
    tingkat: 'sehat',
    ringkas: 'Terhubung',
    keterangan:
      profil.mekanisme === 'webhook'
        ? `Kiriman terakhir ${relatif}.`
        : `Sinkron terakhir ${relatif}.`,
  };
}

/** Urutan tingkat: yang perlu tindakan di atas, yang belum dihubungkan paling bawah. */
const PERINGKAT_TINGKAT: Record<TingkatKesehatan, number> = {
  bermasalah: 0,
  terlambat: 1,
  menunggu: 2,
  sehat: 3,
  belum: 4,
};

/**
 * Urutkan koneksi untuk ditampilkan: yang butuh tindakan lebih dulu. Dalam
 * tingkat yang sama, urutan bawaan `URUTAN_SUMBER` dipertahankan supaya kartu
 * tidak berpindah-pindah tempat setiap kali halaman dibuka.
 */
export function urutkanKoneksi(daftar: KoneksiSumber[], sekarang: Date): KoneksiSumber[] {
  return [...daftar].sort((a, b) => {
    const t =
      PERINGKAT_TINGKAT[kesehatanKoneksi(a, sekarang).tingkat] -
      PERINGKAT_TINGKAT[kesehatanKoneksi(b, sekarang).tingkat];
    return t !== 0 ? t : URUTAN_SUMBER.indexOf(a.sumber) - URUTAN_SUMBER.indexOf(b.sumber);
  });
}

/** Angka utama halaman: berapa sumber yang datanya mengalir. */
export function ringkasanKoneksi(
  daftar: KoneksiSumber[],
  sekarang: Date,
): { aktif: number; total: number; perluPerhatian: number; belum: number } {
  let aktif = 0;
  let perluPerhatian = 0;
  let belum = 0;
  for (const k of daftar) {
    const t = kesehatanKoneksi(k, sekarang).tingkat;
    if (t === 'sehat' || t === 'menunggu') aktif += 1;
    else if (t === 'belum') belum += 1;
    else perluPerhatian += 1;
  }
  return { aktif, total: daftar.length, perluPerhatian, belum };
}

/** "a, b, dan c" — daftar gaya Indonesia. */
function gabungDaftar(daftar: string[]): string {
  if (daftar.length <= 1) return daftar.join('');
  if (daftar.length === 2) return `${daftar[0]} dan ${daftar[1]}`;
  return `${daftar.slice(0, -1).join(', ')}, dan ${daftar[daftar.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Menghubungkan
// ---------------------------------------------------------------------------

/** Hasil satu upaya menghubungkan, dari alur izin mana pun. */
export type HasilHubungkan =
  | { ok: true }
  | { ok: false; alasan: 'dibatalkan' | 'izin-kurang' | 'kunci-ditolak' | 'jaringan' };

/**
 * Kalimat untuk upaya yang gagal. Tiap alasan punya jalan keluarnya sendiri,
 * dan pesan umum "gagal menghubungkan" tidak memberi tahu satu pun di antaranya.
 */
export function pesanGagalHubungkan(
  sumber: SumberData,
  alasan: Extract<HasilHubungkan, { ok: false }>['alasan'],
): { judul: string; keterangan: string } {
  const { nama } = PROFIL_SUMBER[sumber];
  switch (alasan) {
    case 'dibatalkan':
      return {
        judul: 'Belum terhubung',
        keterangan: `Halaman ${nama} ditutup sebelum akses disetujui. Tidak ada yang berubah.`,
      };
    case 'izin-kurang':
      return {
        judul: 'Izin aktivitas tidak diberikan',
        keterangan: `${nama} menyetujui akses tanpa izin membaca aktivitas, jadi tidak ada yang bisa diambil. Coba lagi dan biarkan izin aktivitas tetap dicentang.`,
      };
    case 'kunci-ditolak':
      return {
        judul: `Kunci tidak diterima ${nama}`,
        keterangan:
          'Pastikan kunci disalin utuh dari hevy.com › Settings › Developer, dan akun Anda masih Hevy Pro.',
      };
    case 'jaringan':
      return {
        judul: `Tidak bisa menghubungi ${nama}`,
        keterangan: 'Periksa koneksi internet, lalu coba lagi.',
      };
  }
}

/** Kunci API Hevy berbentuk UUID: 8-4-4-4-12 karakter heksadesimal. */
const POLA_KUNCI_HEVY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Periksa kunci API Hevy SEBELUM dikirim ke mana pun.
 *
 * Spasi dan baris baru dibuang lebih dulu: kunci yang disalin dari browser di
 * ponsel hampir selalu membawa salah satunya, dan menolaknya karena itu hanya
 * membuat orang mengira kuncinya salah.
 */
export function validasiKunciHevy(
  teks: string,
): { ok: true; kunci: string } | { ok: false; alasan: string } {
  const kunci = teks.replace(/\s+/g, '').toLowerCase();
  if (kunci.length === 0) return { ok: false, alasan: 'Kunci masih kosong.' };
  if (!POLA_KUNCI_HEVY.test(kunci)) {
    return {
      ok: false,
      alasan: 'Bentuknya bukan kunci API Hevy — seharusnya 36 karakter seperti 1a2b3c4d-…-9f8e7d6c5b4a.',
    };
  }
  return { ok: true, kunci };
}

/**
 * Kunci yang disamarkan untuk ditampilkan kembali: hanya empat karakter
 * terakhir yang terlihat, cukup untuk mencocokkan dengan yang ada di Hevy.
 */
export function samarkanKunci(kunci: string): string {
  return kunci.length <= 4 ? '••••' : `••••${kunci.slice(-4)}`;
}
