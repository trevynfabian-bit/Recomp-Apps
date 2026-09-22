/**
 * Tipe tabel & RPC Supabase, ditulis tangan agar cocok dengan berkas di
 * `supabase/migrations/`. Kalau migrasi berubah, berkas ini ikut diperbarui.
 *
 * Nama kolom sengaja sama persis dengan database (Bahasa Indonesia) supaya
 * tidak ada lapisan penerjemahan yang bisa salah diam-diam.
 */

export type FaseProgram = 'Maintenance' | 'Lean Gain' | 'Cut';
export type SumberBeratDb = 'manual' | 'healthkit';
export type SumberMakananDb = 'manual' | 'foto_ai';

export type ProfileRow = {
  user_id: string;
  nama: string | null;
  satuan: string;
  fase_aktif: FaseProgram;
  tinggi_cm: number | null;
  jenis_kelamin: 'pria' | 'wanita' | null;
  batas_pinggang_cm: number | null;
  created_at: string;
  updated_at: string;
};

export type DayTypeRow = {
  id: string;
  user_id: string;
  nama: string;
  auto_detect: boolean;
  is_default: boolean;
  urutan: number;
  created_at: string;
};

export type DayTypeTargetRow = {
  id: string;
  user_id: string;
  day_type_id: string;
  fase: FaseProgram;
  target_kalori: number;
  target_protein_g: number;
  target_lemak_g: number;
  batas_sat_fat_g: number;
  created_at: string;
  updated_at: string;
};

export type DailyLogRow = {
  id: string;
  user_id: string;
  /** `YYYY-MM-DD`, sudah dinormalisasi ke Asia/Jakarta. */
  tanggal: string;
  berat_pagi_kg: number | null;
  day_type_id: string | null;
  day_type_override: boolean;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  target_kalori: number | null;
  catatan: string | null;
  sumber_berat: SumberBeratDb | null;
  created_at: string;
  updated_at: string;
};

export type FoodLogRow = {
  id: string;
  user_id: string;
  daily_log_id: string;
  nama_makanan: string;
  foto_url: string | null;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  sumber: SumberMakananDb;
  created_at: string;
};

/** Bentuk skema yang dipahami supabase-js untuk pengetikan query. */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { user_id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      day_types: {
        Row: DayTypeRow;
        Insert: Partial<DayTypeRow> & { user_id: string; nama: string };
        Update: Partial<DayTypeRow>;
        Relationships: [];
      };
      day_type_targets: {
        Row: DayTypeTargetRow;
        Insert: Omit<DayTypeTargetRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<DayTypeTargetRow>;
        Relationships: [];
      };
      daily_logs: {
        Row: DailyLogRow;
        Insert: Partial<DailyLogRow> & { user_id: string; tanggal: string };
        Update: Partial<DailyLogRow>;
        Relationships: [];
      };
      food_logs: {
        Row: FoodLogRow;
        Insert: Omit<FoodLogRow, 'id' | 'created_at'>;
        Update: Partial<FoodLogRow>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      simpan_berat_pagi: {
        Args: {
          p_tanggal: string;
          p_berat_kg: number;
          p_sumber: SumberBeratDb;
        };
        Returns: DailyLogRow;
      };
    };
    Enums: {
      fase_program: FaseProgram;
      sumber_berat: SumberBeratDb;
      sumber_makanan: SumberMakananDb;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
