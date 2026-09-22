/**
 * Tipe domain Recomp Coach. Nama field mengikuti skema Supabase di PRD
 * (Bahasa Indonesia) supaya mobile & web memakai bentuk data yang sama.
 * Semua tanggal berupa string `YYYY-MM-DD` yang sudah dinormalisasi ke Asia/Jakarta.
 */

/** Fase program yang menentukan target harian & budget mingguan. */
export type Fase = 'Maintenance' | 'Lean Gain' | 'Cut';

/** Sumber angka berat — dipakai untuk membedakan data mentah vs hasil sync. */
export type SumberBerat = 'manual' | 'healthkit';

/** profiles — profil & preferensi pengguna. */
export type Profile = {
  user_id: string;
  nama: string;
  satuan: 'metrik' | 'imperial';
  fase_aktif: Fase;
  tinggi_cm: number;
  jenis_kelamin: 'pria' | 'wanita';
  batas_pinggang_cm: number;
};

/** day_types — konfigurasi tipe hari. Tidak ada faktor pengali di sini. */
export type DayType = {
  id: string;
  nama: string;
  auto_detect: boolean;
  is_default: boolean;
};

/** day_type_targets — target ABSOLUT per (tipe hari x fase). */
export type DayTypeTarget = {
  id: string;
  day_type_id: string;
  fase: Fase;
  target_kalori: number;
  target_protein_g: number;
  target_lemak_g: number;
  batas_sat_fat_g: number;
};

/** daily_logs — log harian inti (berat pagi, konsumsi manual, catatan). */
export type DailyLog = {
  id: string;
  tanggal: string;
  berat_pagi_kg: number | null;
  day_type_id: string;
  /** true bila pengguna meng-override hasil auto-deteksi tipe hari. */
  day_type_override: boolean;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  /** Snapshot target kalori hari itu, diambil saat log dibuat. */
  target_kalori: number;
  catatan: string | null;
  sumber_berat: SumberBerat | null;
};

/** food_logs — entri makanan di dalam satu hari. */
export type FoodLog = {
  id: string;
  daily_log_id: string;
  nama_makanan: string;
  foto_url: string | null;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  /** `foto_ai` ditandai sebagai estimasi, `manual` sebagai data mentah. */
  sumber: 'manual' | 'foto_ai';
};

/**
 * Bentuk turunan yang dipakai UI: pasangan konsumsi vs target untuk satu makro.
 * Dihitung dari daily_logs + day_type_targets, bukan disimpan di database.
 */
export type MacroProgress = {
  key: 'kalori' | 'protein' | 'lemak' | 'karbo' | 'satFat';
  label: string;
  /** Sudah dikonsumsi hari ini. */
  terpakai: number;
  /** Target absolut hari ini; `null` bila makro tersebut tidak ditargetkan. */
  target: number | null;
  unit: 'kcal' | 'g';
  /** true untuk sat fat: target berperan sebagai BATAS, bukan sasaran. */
  isBatas?: boolean;
};

/** Ringkasan satu hari siap-tampil untuk layar Log Harian. */
export type DailySnapshot = {
  log: DailyLog;
  dayType: DayType;
  target: DayTypeTarget;
  fase: Fase;
  macros: MacroProgress[];
};

/** Cara panel ringkasan menampilkan angka utama tiap makro. */
export type ModeMakro = 'sisa' | 'terpakai';

/** Hasil hitung satu makro, siap ditampilkan tanpa logika tambahan di komponen. */
export type HitunganMakro = {
  /** Angka yang ditonjolkan sesuai `ModeMakro`. */
  nilaiUtama: number;
  /** true bila target/batas sudah terlampaui (sisa negatif). */
  terlampaui: boolean;
  /** Rasio 0..1 untuk bar progress. */
  progres: number;
};
