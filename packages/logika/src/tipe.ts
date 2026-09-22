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
