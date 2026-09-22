/**
 * Tipe domain yang dipakai BERSAMA oleh app iOS dan web dashboard.
 *
 * Hanya yang benar-benar dibutuhkan perhitungan yang ada di sini. Tipe khusus
 * layar (mis. snapshot siap-tampil) tetap tinggal di masing-masing aplikasi.
 */

/** Fase program yang menentukan target harian & budget mingguan. */
export type Fase = 'Maintenance' | 'Lean Gain' | 'Cut';

/** Konfigurasi tipe hari. Tidak ada faktor pengali — target hidup terpisah. */
export type DayType = {
  id: string;
  nama: string;
  /** Boleh menjadi hasil auto-deteksi dari workout. */
  auto_detect: boolean;
  is_default: boolean;
};

/** Kategori olahraga yang dipakai aturan auto-deteksi tipe hari. */
export type JenisOlahraga = 'angkat_beban' | 'lari' | 'padel' | 'lainnya';

/** Workout secukupnya untuk menebak tipe hari dan menjelaskan alasannya. */
export type WorkoutRingkas = {
  id: string;
  nama: string;
  jenis: JenisOlahraga;
  sumber: 'hevy' | 'strava' | 'whoop' | 'healthkit' | 'manual';
  durasi_menit: number;
};

/** Pasangan konsumsi vs target untuk satu makro. */
export type MacroProgress = {
  key: 'kalori' | 'protein' | 'lemak' | 'karbo' | 'satFat';
  label: string;
  terpakai: number;
  /** Target absolut; `null` bila makro tersebut tidak ditargetkan (karbo). */
  target: number | null;
  unit: 'kcal' | 'g';
  /** true untuk sat fat: target berperan sebagai BATAS, bukan sasaran. */
  isBatas?: boolean;
};

/** Cara panel ringkasan menampilkan angka utama tiap makro. */
export type ModeMakro = 'sisa' | 'terpakai';

/** Hasil hitung satu makro, siap ditampilkan tanpa logika tambahan. */
export type HitunganMakro = {
  nilaiUtama: number;
  /** true bila target/batas sudah terlampaui (sisa negatif). */
  terlampaui: boolean;
  /** Rasio 0..1 untuk bar progress. */
  progres: number;
};

/** Satu timbangan, secukupnya untuk perhitungan tren. */
export type EntriBeratRingkas = {
  tanggal: string;
  berat_pagi_kg: number | null;
};

/** Hasil rata-rata bergerak 7 hari untuk satu tanggal. */
export type RataRata7Hari = {
  tanggal: string;
  /** `null` bila tidak ada timbangan sama sekali dalam jendelanya. */
  rataRataKg: number | null;
  /** Berapa hari yang benar-benar ditimbang dalam jendela itu. */
  jumlahTimbangan: number;
};

/** Satu titik pada grafik tren. */
export type TitikTren = {
  tanggal: string;
  rataRataKg: number | null;
  beratHarianKg: number | null;
};

/** Arah berat sepekan terakhir. */
export type SinyalArah = {
  arah: 'naik' | 'turun' | 'datar' | 'belum cukup data';
  /** Selisih rata-rata sekarang terhadap sepekan lalu; `null` bila data kurang. */
  perubahanKg: number | null;
  /** Ambang yang dianggap masih "datar". */
  ambangKg: number;
};

/** Batas bawah & atas koridor target untuk satu tanggal. */
export type TitikKoridor = {
  tanggal: string;
  bawahKg: number;
  atasKg: number;
};

/** Koridor target lengkap beserta jangkarnya. */
export type KoridorTarget = {
  fase: Fase;
  /** Berat (rata-rata 7 hari) saat fase dimulai. */
  beratJangkarKg: number;
  tanggalJangkar: string;
  titik: TitikKoridor[];
};

/** Posisi rata-rata sekarang terhadap koridor. */
export type StatusKoridor = {
  posisi: 'di dalam koridor' | 'di atas koridor' | 'di bawah koridor' | 'belum bisa dinilai';
  /** Jarak ke batas terdekat; 0 bila di dalam, `null` bila belum bisa dinilai. */
  selisihKg: number | null;
  bawahKg: number | null;
  atasKg: number | null;
};

/** Kecocokan arah berat terhadap yang diharapkan fase aktif. */
export type KecocokanFase = 'sesuai' | 'belum bergerak' | 'berlawanan' | 'belum bisa dinilai';

/** Seberapa cukup data untuk tiap angka di layar Tren. */
export type KecukupanTren = {
  adaTimbangan: boolean;
  /** Seluruh timbangan yang pernah tercatat. */
  jumlahTotal: number;
  /** Timbangan dalam jendela 7 hari yang berakhir di tanggal tersebut. */
  jumlahDalamJendela: number;
  cukupRataRata: boolean;
  /** true bila ketujuh hari dalam jendela benar-benar ditimbang. */
  jendelaPenuh: boolean;
  /** Sinyal arah butuh DUA jendela berisi, bukan satu. */
  cukupArah: boolean;
  hariLagiUntukArah: number | null;
};
