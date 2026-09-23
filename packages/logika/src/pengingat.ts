import { formatAngka, formatMakro } from './format';
import { formatJam } from './percakapan';

/**
 * Pengingat & widget layar kunci.
 *
 * PRD meminta dua hal yang gampang dilanggar tanpa sengaja:
 *   • nada NETRAL — tidak ada "melebihi target", tidak ada peringatan. Satu
 *     kalimat bernada menegur di layar kunci setiap pagi cukup untuk membuat
 *     orang mematikan semua notifikasi, termasuk yang berguna;
 *   • pengingat timbang hanya bila TERLEWAT — yang sudah timbang tidak perlu
 *     diingatkan.
 * Keduanya dipegang di sini, bukan di teks yang tersebar di layar, dan nada
 * setiap kalimat diperiksa mesin lewat `pelanggaranNada`.
 */

/** Jam pengingat bawaan, dalam menit sejak tengah malam (06.30). */
export const JAM_TIMBANG_BAWAAN = 6 * 60 + 30;

/**
 * Rentang jam pengingat timbang: pagi saja. Timbang pagi dibandingkan dari hari
 * ke hari justru karena kondisinya sama (bangun tidur, sebelum makan);
 * pengingat pukul 14.00 menghasilkan angka yang tidak sebanding.
 */
export const RENTANG_JAM_TIMBANG = { min: 4 * 60, maks: 11 * 60 } as const;

/** Langkah stepper jam, dalam menit. */
export const LANGKAH_JAM_MENIT = 15;

/** "06.30" — gaya jam Indonesia, titik sebagai pemisah. */
export function formatJamMenit(menit: number): string {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return `${String(j).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/** Geser jam pengingat, tertahan di rentang pagi. */
export function geserJamTimbang(menit: number, delta: number): number {
  return Math.min(RENTANG_JAM_TIMBANG.maks, Math.max(RENTANG_JAM_TIMBANG.min, menit + delta));
}

/**
 * Apakah pengingat timbang hari ini perlu dikirim. Berat dari SUMBER MANA PUN
 * (ketik sendiri atau Apple Health) dihitung sudah timbang — pengingat yang
 * datang setelah timbangan pintar sudah mengirim angkanya terasa seperti app
 * yang tidak memperhatikan.
 */
export function perluPengingatTimbang(aktif: boolean, beratHariIniTercatat: boolean): boolean {
  return aktif && !beratHariIniTercatat;
}

/** Isi notifikasi timbang pagi. */
export const NOTIF_TIMBANG = {
  judul: 'Timbang pagi',
  isi: 'Setelah bangun, sebelum sarapan — kalau sempat. Satu ketukan untuk mencatat.',
} as const;

/** Isi notifikasi ringkasan mingguan. */
export const NOTIF_RINGKASAN = {
  judul: 'Ringkasan pekan lalu',
  isi: 'Angka pekan kemarin sudah dirangkum. Buka untuk membacanya.',
} as const;

/** Jenis notifikasi yang bisa dinyalakan/dimatikan satu per satu. */
export type JenisNotifikasi = 'timbang' | 'ukuran' | 'ringkasan' | 'evaluasi' | 'sumber';

/** Satu jenis notifikasi: sakelarnya, kapan dikirim, dan isinya apa adanya. */
export type NotifikasiKatalog = {
  jenis: JenisNotifikasi;
  /** Nama sakelar di pengaturan. */
  nama: string;
  /** Kapan dikirim — dan kapan TIDAK. Ditulis di bawah sakelar. */
  kapan: string;
  judul: string;
  isi: string;
  /** Label waktu di pratinjau; `null` = jam pengingat timbang yang berlaku. */
  waktuPratinjau: string | null;
  /** Nyala saat pertama kali dipasang. */
  bawaan: boolean;
};

/**
 * Semua notifikasi yang bisa dikirim app, satu tempat.
 *
 * Dua aturan berlaku untuk SETIAP isi, dan diperiksa `npm run cek:widget`:
 *   • nada netral (`pelanggaranNada`);
 *   • TANPA ANGKA. Notifikasi tampil di layar kunci tanpa kunci dibuka —
 *     berat, kalori, atau lingkar pinggang tidak pernah ikut di dalamnya,
 *     bahkan saat angka widget dinyalakan. Angka dibaca di app.
 * Pengingat kebiasaan hanya dikirim bila TERLEWAT; pemberitahuan hasil hanya
 * saat hasilnya benar-benar siap.
 */
export const KATALOG_NOTIFIKASI: readonly NotifikasiKatalog[] = [
  {
    jenis: 'timbang',
    nama: 'Timbang pagi',
    kapan: 'Hanya dikirim bila berat pagi belum tercatat — dari app atau Apple Health.',
    judul: NOTIF_TIMBANG.judul,
    isi: NOTIF_TIMBANG.isi,
    waktuPratinjau: null,
    bawaan: true,
  },
  {
    jenis: 'ukuran',
    nama: 'Ukur pekanan',
    kapan: 'Minggu pagi, hanya bila pinggang belum diukur pekan ini.',
    judul: 'Ukur pekanan',
    isi: 'Pinggang dan lainnya, dengan meteran yang biasa. Cukup dua menit.',
    waktuPratinjau: 'Min',
    bawaan: true,
  },
  {
    jenis: 'ringkasan',
    nama: 'Ringkasan mingguan siap',
    kapan: 'Senin pagi, saat ringkasan pekan lalu selesai dibuat.',
    judul: NOTIF_RINGKASAN.judul,
    isi: NOTIF_RINGKASAN.isi,
    waktuPratinjau: 'Sen',
    bawaan: true,
  },
  {
    jenis: 'evaluasi',
    nama: 'Evaluasi empat pekan siap',
    kapan: 'Setiap empat pekan, saat arah berat, pinggang, dan kekuatan selesai dibaca.',
    judul: 'Evaluasi empat pekan',
    isi: 'Arah berat, pinggang, dan kekuatan sudah dibaca bersama. Buka untuk melihat rekomendasinya.',
    waktuPratinjau: 'Sen',
    bawaan: true,
  },
  {
    jenis: 'sumber',
    nama: 'Sumber data terputus',
    kapan: 'Bila sebuah sumber berhenti mengirim data lebih dari sehari. Paling sering sekali sehari.',
    judul: 'Sumber data perlu disambungkan',
    isi: 'Satu sumber berhenti mengirim data. Ketuk untuk melihat yang mana.',
    waktuPratinjau: 'kemarin',
    bawaan: true,
  },
];

/** Pengaturan awal: tiap jenis memakai nilai `bawaan`-nya. */
export function jenisNotifikasiBawaan(): Record<JenisNotifikasi, boolean> {
  return Object.fromEntries(KATALOG_NOTIFIKASI.map((n) => [n.jenis, n.bawaan])) as Record<
    JenisNotifikasi,
    boolean
  >;
}

/** "3 dari 5 jenis aktif", "Semua aktif", atau "Semua dimatikan". */
export function ringkasJenisAktif(aktif: Record<JenisNotifikasi, boolean>): string {
  const total = KATALOG_NOTIFIKASI.length;
  const nyala = KATALOG_NOTIFIKASI.filter((n) => aktif[n.jenis]).length;
  if (nyala === 0) return 'Semua dimatikan';
  if (nyala === total) return 'Semua aktif';
  return `${nyala} dari ${total} jenis aktif`;
}

/**
 * Kata & tanda yang membuat notifikasi terbaca menegur. Daftarnya sengaja
 * ketat: "jangan" dan tanda seru pun tidak, karena notifikasi dibaca sekilas
 * di layar kunci dan nada lebih cepat tertangkap daripada isi.
 */
const TERLARANG = ['melebihi', 'kelebihan', 'berlebih', 'gagal', 'awas', 'jangan', 'peringatan', 'terlalu'];

/** Pelanggaran nada dalam sebuah teks; daftar kosong berarti netral. */
export function pelanggaranNada(teks: string): string[] {
  const kecil = teks.toLowerCase();
  const hasil = TERLARANG.filter((k) => new RegExp(`(?<![\\p{L}])${k}`, 'u').test(kecil));
  if (teks.includes('!')) hasil.push('!');
  return hasil;
}

/**
 * Keadaan widget saat TIDAK ADA angka hari ini untuk ditampilkan:
 *   • belum-masuk  — app belum pernah masuk di perangkat ini;
 *   • tanpa-target — belum ada target kalori, jadi "sisa" tidak bermakna;
 *   • hari-baru    — belum ada ringkasan HARI INI (mis. lewat tengah malam,
 *                    server belum menghitung). Ringkasan kemarin TIDAK PERNAH
 *                    ditampilkan sebagai hari ini.
 */
export type KeadaanKosongWidget = 'belum-masuk' | 'tanpa-target' | 'hari-baru';

/** Ringkasan hari yang dibaca widget, seperti `daily_summaries` di PRD. */
export type RingkasanWidget = {
  /** Diisi `siapkanWidget` bila tidak ada angka hari ini. */
  kosong?: KeadaanKosongWidget;
  /** Target protein hari itu; dipakai keadaan hari-baru. */
  targetProteinG?: number | null;
  sisaKalori: number | null;
  sisaProteinG: number | null;
  /**
   * Target kalori hari itu, untuk cincin widget bundar. Opsional: tanpanya
   * widget bundar menampilkan angka saja, tanpa cincin.
   */
  targetKalori?: number | null;
  /** ISO 8601 saat server menghitungnya; `null` bila belum pernah. */
  dihitungPada: string | null;
};

/**
 * Teks widget layar kunci.
 *
 * Kalori di atas target ditulis sebagai FAKTA ("120 kcal di atas target"),
 * bukan teguran, dan tanpa warna peringatan. `tampilkanAngka: false` untuk
 * layar kunci yang dilihat orang lain: data kesehatan tampil tanpa kunci
 * dibuka, jadi pengguna berhak menyembunyikannya.
 *
 * WidgetKit ditulis Swift dan tidak bisa menjalankan fungsi ini; bentuk
 * kalimatnya karena itu dijaga `npm run cek:widget` dan harus diikuti apa
 * adanya oleh widget native (atau dikirim server bersama `daily_summaries`).
 */
export function teksWidget(
  r: RingkasanWidget,
  tampilkanAngka: boolean,
  /** Untuk label "per 07.12" bila angkanya sudah lebih dari sejam; opsional. */
  sekarang?: Date,
): { judul: string; baris1: string; baris2: string; aksesLabel: string } {
  if (!tampilkanAngka) {
    return {
      judul: 'Recomp',
      baris1: 'Buka app untuk',
      baris2: 'melihat sisa hari ini',
      aksesLabel: 'Recomp. Buka app untuk melihat sisa hari ini.',
    };
  }
  if (r.kosong === 'belum-masuk') {
    return {
      judul: 'Recomp',
      baris1: 'Masuk ke app untuk',
      baris2: 'melihat sisa hari ini',
      aksesLabel: 'Recomp. Masuk ke app untuk melihat sisa hari ini.',
    };
  }
  if (r.kosong === 'tanpa-target') {
    return {
      judul: 'Sisa hari ini',
      baris1: 'Target belum diatur',
      baris2: 'Atur di app',
      aksesLabel: 'Target belum diatur. Atur di app.',
    };
  }
  if (r.kosong === 'hari-baru' && r.targetKalori != null) {
    const kalori = `Target ${formatAngka(r.targetKalori)} kcal`;
    const protein =
      r.targetProteinG != null ? `Protein ${formatMakro(r.targetProteinG)} g` : 'Belum ada catatan';
    return { judul: 'Hari baru', baris1: kalori, baris2: protein, aksesLabel: `Hari baru. ${kalori}. ${protein}.` };
  }
  if (r.sisaKalori === null || r.kosong === 'hari-baru') {
    return {
      judul: 'Sisa hari ini',
      baris1: 'Belum ada ringkasan',
      baris2: 'Buka app untuk mulai',
      aksesLabel: 'Belum ada ringkasan hari ini.',
    };
  }
  const kalori =
    r.sisaKalori >= 0
      ? `${formatAngka(r.sisaKalori)} kcal tersisa`
      : `${formatAngka(-r.sisaKalori)} kcal di atas target`;
  const protein =
    r.sisaProteinG === null
      ? 'Protein belum ditargetkan'
      : r.sisaProteinG > 0
        ? `${formatMakro(r.sisaProteinG)} g protein lagi`
        : 'Protein tercapai';
  // Angka yang sudah lebih dari sejam diberi jamnya: siapa pun yang makan
  // siang setelah ringkasan pukul 07.12 berhak tahu angkanya belum ikut.
  const basi =
    sekarang !== undefined &&
    r.dihitungPada !== null &&
    sekarang.getTime() - Date.parse(r.dihitungPada) > BATAS_SEGAR_MS;
  const judul = basi ? `Sisa per ${formatJam(r.dihitungPada as string)}` : 'Sisa hari ini';
  return { judul, baris1: kalori, baris2: protein, aksesLabel: `${judul}: ${kalori}. ${protein}.` };
}

/** Setelah selama ini, angka widget diberi label jamnya. */
export const BATAS_SEGAR_MS = 60 * 60_000;

/**
 * Siapkan masukan widget dari apa yang tersimpan di perangkat.
 *
 * Aturan terpentingnya: ringkasan yang tanggalnya BUKAN hari ini (Asia/Jakarta)
 * dibuang. Widget layar kunci bisa hidup berjam-jam tanpa dimuat ulang, dan
 * "1.120 kcal tersisa" yang sebenarnya milik kemarin adalah angka salah yang
 * terlihat benar — lebih buruk daripada tidak ada angka.
 */
export function siapkanWidget(
  masukan: {
    masuk: boolean;
    ringkasan: (RingkasanWidget & { tanggal: string }) | null;
    target: { kalori: number | null; proteinG: number | null } | null;
  },
  hariIni: string,
): RingkasanWidget {
  const kosong = (k: KeadaanKosongWidget): RingkasanWidget => ({
    kosong: k,
    sisaKalori: null,
    sisaProteinG: null,
    targetKalori: masukan.target?.kalori ?? null,
    targetProteinG: masukan.target?.proteinG ?? null,
    dihitungPada: null,
  });
  if (!masukan.masuk) return kosong('belum-masuk');
  if (masukan.target === null || masukan.target.kalori === null) return kosong('tanpa-target');
  if (masukan.ringkasan === null || masukan.ringkasan.tanggal !== hariIni) return kosong('hari-baru');
  const { tanggal: _t, ...r } = masukan.ringkasan;
  return { ...r, targetKalori: r.targetKalori ?? masukan.target.kalori };
}

/**
 * Widget SEBARIS (di atas jam layar kunci): satu baris pendek. iOS memotong
 * teks yang terlalu panjang tanpa ampun, jadi bentuknya dipadatkan ke angka
 * dan satuan saja.
 */
export function teksWidgetSebaris(r: RingkasanWidget, tampilkanAngka: boolean): string {
  if (tampilkanAngka && r.kosong === 'hari-baru' && r.targetKalori != null) {
    return `Target ${formatAngka(r.targetKalori)} kcal`;
  }
  if (!tampilkanAngka || r.kosong !== undefined || r.sisaKalori === null) return 'Recomp';
  const kalori = r.sisaKalori >= 0 ? `${formatAngka(r.sisaKalori)} kcal` : `+${formatAngka(-r.sisaKalori)} kcal`;
  if (r.sisaProteinG === null) return kalori;
  const protein = r.sisaProteinG > 0 ? `${formatMakro(r.sisaProteinG)} g protein` : 'protein tercapai';
  return `${kalori} · ${protein}`;
}

/**
 * Widget BUNDAR: satu angka di tengah cincin. Cincin = porsi target yang
 * sudah terpakai, berhenti di penuh — cincin yang "meluap" merah adalah
 * peringatan dalam bentuk grafik, dan PRD melarang peringatan.
 */
export function isiWidgetLingkar(
  r: RingkasanWidget,
  tampilkanAngka: boolean,
): { angka: string; satuan: string; terpakai: number | null; aksesLabel: string } {
  if (tampilkanAngka && r.kosong === 'hari-baru' && r.targetKalori != null) {
    // Cincin kosong + target: hari baru dimulai dari nol, bukan dari angka kemarin.
    return {
      angka: formatAngka(r.targetKalori),
      satuan: 'target',
      terpakai: 0,
      aksesLabel: `Hari baru. Target ${formatAngka(r.targetKalori)} kcal.`,
    };
  }
  if (!tampilkanAngka || r.kosong !== undefined || r.sisaKalori === null) {
    return { angka: '–', satuan: 'kcal', terpakai: null, aksesLabel: 'Recomp. Buka app untuk melihat sisa hari ini.' };
  }
  const target = r.targetKalori ?? null;
  const terpakai =
    target !== null && target > 0 ? Math.min(1, Math.max(0, (target - r.sisaKalori) / target)) : null;
  if (r.sisaKalori >= 0) {
    return {
      angka: formatAngka(r.sisaKalori),
      satuan: 'kcal',
      terpakai,
      aksesLabel: `${formatAngka(r.sisaKalori)} kcal tersisa.`,
    };
  }
  return {
    angka: `+${formatAngka(-r.sisaKalori)}`,
    satuan: 'kcal',
    terpakai,
    aksesLabel: `${formatAngka(-r.sisaKalori)} kcal di atas target.`,
  };
}

// ---------------------------------------------------------------------------
// Jam pengingat per hari & saran dari kebiasaan
// ---------------------------------------------------------------------------

/** Jam pengingat: hari kerja, dan (opsional) akhir pekan yang berbeda. */
export type JamPengingat = {
  hariKerjaMenit: number;
  /** `null` berarti akhir pekan memakai jam hari kerja. */
  akhirPekanMenit: number | null;
};

/** Sabtu atau Minggu, untuk tanggal `YYYY-MM-DD`. */
function akhirPekan(tanggal: string): boolean {
  const [y, m, d] = tanggal.split('-').map(Number);
  const hari = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return hari === 0 || hari === 6;
}

/** Jam pengingat yang berlaku untuk satu tanggal, dalam menit sejak tengah malam. */
export function jamPengingatUntuk(tanggal: string, jam: JamPengingat): number {
  return akhirPekan(tanggal) && jam.akhirPekanMenit !== null ? jam.akhirPekanMenit : jam.hariKerjaMenit;
}

/** Ringkasan jadwal sepekan, mis. "Sen–Jum 06.30 · Sab–Min 08.00" atau "Setiap hari 06.30". */
export function ringkasJadwal(jam: JamPengingat): string {
  if (jam.akhirPekanMenit === null || jam.akhirPekanMenit === jam.hariKerjaMenit) {
    return `Setiap hari ${formatJamMenit(jam.hariKerjaMenit)}`;
  }
  return `Sen–Jum ${formatJamMenit(jam.hariKerjaMenit)} · Sab–Min ${formatJamMenit(jam.akhirPekanMenit)}`;
}

/** Berapa timbangan minimal sebelum kebiasaan dianggap terbaca. */
export const MIN_TIMBANGAN_SARAN = 5;

/**
 * Saran jam pengingat dari waktu timbang yang sudah tercatat.
 *
 * Pengingat hanya dikirim bila hari itu BELUM timbang, jadi jam terbaiknya
 * SESUDAH kebiasaan, bukan sebelumnya: median waktu timbang dibulatkan ke atas
 * ke kelipatan 15 menit, lalu ditambah 15 menit. Pengingat sebelum jam
 * kebiasaan akan muncul hampir setiap hari — tepat sebelum orang itu memang
 * akan timbang — dan terasa seperti gangguan, bukan bantuan.
 *
 * Median, bukan rata-rata: satu pagi yang timbang pukul 10.30 tidak boleh
 * menggeser saran sepuluh menit. Timbangan di luar rentang pagi diabaikan.
 * `null` bila datanya kurang dari MIN_TIMBANGAN_SARAN.
 */
export function saranJamTimbang(
  waktuIso: string[],
): { saranMenit: number; kebiasaanMenit: number; dasar: number } | null {
  const menit = waktuIso
    .map((w) => {
      const jamMenit = new Date(w).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const [j, m] = jamMenit.split(':').map(Number);
      return j * 60 + m;
    })
    .filter((m) => Number.isFinite(m) && m >= RENTANG_JAM_TIMBANG.min && m <= RENTANG_JAM_TIMBANG.maks)
    .sort((a, b) => a - b);
  if (menit.length < MIN_TIMBANGAN_SARAN) return null;

  const tengah = Math.floor(menit.length / 2);
  const median = menit.length % 2 === 1 ? menit[tengah] : Math.round((menit[tengah - 1] + menit[tengah]) / 2);
  const saran = Math.ceil(median / LANGKAH_JAM_MENIT) * LANGKAH_JAM_MENIT + LANGKAH_JAM_MENIT;
  return {
    saranMenit: geserJamTimbang(saran, 0),
    kebiasaanMenit: median,
    dasar: menit.length,
  };
}
