/**
 * Tipe domain Recomp Coach. Nama field mengikuti skema Supabase di PRD
 * (Bahasa Indonesia) supaya mobile & web memakai bentuk data yang sama.
 * Semua tanggal berupa string `YYYY-MM-DD` yang sudah dinormalisasi ke Asia/Jakarta.
 */

/**
 * Tipe yang dipakai BERSAMA dengan web dashboard tinggal di `@recomp/logika`
 * dan di-re-export dari sini supaya pemanggil di dalam app tidak perlu tahu
 * batas paketnya.
 */
export type {
  DayType,
  Fase,
  HasilBodyFat,
  KekuranganBodyFat,
  KomposisiTubuh,
  HitunganMakro,
  JenisOlahraga,
  MacroProgress,
  ModeMakro,
  WorkoutRingkas,
} from '@recomp/logika';

import type { DayType, Fase, MacroProgress } from '@recomp/logika';

/** Sumber angka berat — dipakai untuk membedakan data mentah vs hasil sync. */
export type SumberBerat = 'manual' | 'healthkit';

/** profiles — profil & preferensi pengguna. */
export type Profile = {
  user_id: string;
  nama: string;
  satuan: 'metrik' | 'imperial';
  fase_aktif: Fase;
  /**
   * Nullable karena kolomnya memang nullable di `profiles`: pengguna baru
   * belum tentu sudah mengisinya, dan estimasi body fat harus bisa berkata
   * "belum bisa dihitung" alih-alih memakai angka karangan.
   */
  tinggi_cm: number | null;
  jenis_kelamin: 'pria' | 'wanita' | null;
  /** Nullable seperti kolomnya: batas ini keputusan pengguna, bukan bawaan. */
  batas_pinggang_cm: number | null;
  /** Dibutuhkan rumus Mifflin-St Jeor pada estimasi TDEE; boleh null. */
  tanggal_lahir: string | null;
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

/** Ringkasan satu hari siap-tampil untuk layar Log Harian. */
export type DailySnapshot = {
  log: DailyLog;
  dayType: DayType;
  target: DayTypeTarget;
  fase: Fase;
  macros: MacroProgress[];
};

/**
 * Asal sebuah angka. Dipakai di seluruh app supaya data mentah dan hasil
 * perkiraan selalu bisa dibedakan — syarat non-fungsional di PRD dan dasar
 * bagi AI coach untuk menandai mana catatan asli, mana tebakan.
 */
export type JenisSumber =
  /** Diketik sendiri oleh pengguna. Data mentah. */
  | 'manual'
  /** Ditarik dari perangkat/layanan (HealthKit, WHOOP, Strava, Hevy). Data mentah. */
  | 'sinkron'
  /** Hasil perkiraan model atau rumus (foto AI, BF Navy, TDEE). Bisa meleset. */
  | 'estimasi';

/**
 * body_measurements — ukuran tubuh mingguan.
 * Lengan dan paha dipisah KIRI/KANAN: asimetri itu nyata dan berguna dilacak,
 * jadi tidak dirata-ratakan diam-diam.
 */
export type UkuranTubuh = {
  id: string;
  tanggal: string;
  pinggang_cm: number;
  dada_cm: number;
  leher_cm: number;
  lengan_kiri_cm: number;
  lengan_kanan_cm: number;
  paha_kiri_cm: number;
  paha_kanan_cm: number;
};

/** Satu bagian tubuh beserta nilai terbaru dan perubahannya. */
export type BarisUkuran = {
  kunci: keyof Omit<UkuranTubuh, 'id' | 'tanggal'>;
  label: string;
  nilai: number;
  /** Selisih terhadap pencatatan sebelumnya; `null` bila belum ada pembanding. */
  selisih: number | null;
  /** Pasangan kiri/kanan agar bisa ditampilkan berdampingan. */
  pasangan?: 'kiri' | 'kanan';
};

/** Satu pesan dalam percakapan AI Coach. */
export type PesanCoach = {
  id: string;
  peran: 'pengguna' | 'coach';
  teks: string;
  /** ISO 8601; dipakai untuk pengelompokan waktu, bukan ditampilkan mentah. */
  waktu: string;
  /**
   * Keadaan pengiriman. Pesan pengguna bisa gagal terkirim dan harus bisa
   * dicoba lagi tanpa mengetik ulang — itu satu-satunya alasan field ini ada.
   */
  status?: 'terkirim' | 'mengirim' | 'gagal';
};
