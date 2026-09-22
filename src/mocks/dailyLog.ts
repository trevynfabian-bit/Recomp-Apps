import type {
  DailyLog,
  DailySnapshot,
  DayType,
  DayTypeTarget,
  Fase,
  FoodLog,
  SumberBerat,
  MacroProgress,
  Profile,
} from '@/types/domain';

/**
 * DATA TIRUAN (stub) untuk Fase 1 frontend.
 * Bentuknya sengaja meniru baris Supabase supaya penggantian ke query asli
 * nanti hanya menukar sumber data, bukan mengubah komponen.
 */

export const mockProfile: Profile = {
  user_id: 'stub-user',
  nama: 'Trevyn',
  satuan: 'metrik',
  fase_aktif: 'Lean Gain',
  tinggi_cm: 176,
  jenis_kelamin: 'pria',
  batas_pinggang_cm: 86,
  // Dibutuhkan Mifflin-St Jeor; kolom `profiles.tanggal_lahir` ditambahkan
  // migrasi 20260922000900.
  tanggal_lahir: '1994-03-12',
};

export const mockDayTypes: DayType[] = [
  { id: 'dt-rest', nama: 'Rest', auto_detect: true, is_default: true },
  { id: 'dt-angkat', nama: 'Angkat Beban', auto_detect: true, is_default: false },
  { id: 'dt-beban-lari', nama: 'Beban+Lari', auto_detect: true, is_default: false },
  { id: 'dt-padel', nama: 'Padel', auto_detect: true, is_default: false },
];

/**
 * Target absolut per (tipe hari x fase) — nilai dipakai langsung, tanpa pengali.
 *
 * Isinya SAMA PERSIS dengan yang di-seed migrasi
 * `20260922000200_seed_pengguna_baru_dan_rls.sql`. Keduanya harus cocok:
 * kalau mock hanya memuat sebagian fase, mengganti fase di app akan diam-diam
 * jatuh ke nilai cadangan dan membuat fitur "target menyesuaikan" tampak
 * bekerja padahal angkanya salah.
 */
export const mockDayTypeTargets: DayTypeTarget[] = [
  // Rest
  { id: 'tgt-rest-m', day_type_id: 'dt-rest', fase: 'Maintenance', target_kalori: 2300, target_protein_g: 150, target_lemak_g: 72, batas_sat_fat_g: 21 },
  { id: 'tgt-rest-l', day_type_id: 'dt-rest', fase: 'Lean Gain', target_kalori: 2450, target_protein_g: 165, target_lemak_g: 75, batas_sat_fat_g: 22 },
  { id: 'tgt-rest-c', day_type_id: 'dt-rest', fase: 'Cut', target_kalori: 2000, target_protein_g: 175, target_lemak_g: 60, batas_sat_fat_g: 18 },
  // Angkat Beban
  { id: 'tgt-ab-m', day_type_id: 'dt-angkat', fase: 'Maintenance', target_kalori: 2650, target_protein_g: 165, target_lemak_g: 78, batas_sat_fat_g: 23 },
  { id: 'tgt-ab-l', day_type_id: 'dt-angkat', fase: 'Lean Gain', target_kalori: 2850, target_protein_g: 180, target_lemak_g: 82, batas_sat_fat_g: 25 },
  { id: 'tgt-ab-c', day_type_id: 'dt-angkat', fase: 'Cut', target_kalori: 2350, target_protein_g: 190, target_lemak_g: 65, batas_sat_fat_g: 19 },
  // Beban+Lari
  { id: 'tgt-bl-m', day_type_id: 'dt-beban-lari', fase: 'Maintenance', target_kalori: 2900, target_protein_g: 170, target_lemak_g: 84, batas_sat_fat_g: 25 },
  { id: 'tgt-bl-l', day_type_id: 'dt-beban-lari', fase: 'Lean Gain', target_kalori: 3100, target_protein_g: 185, target_lemak_g: 88, batas_sat_fat_g: 26 },
  { id: 'tgt-bl-c', day_type_id: 'dt-beban-lari', fase: 'Cut', target_kalori: 2600, target_protein_g: 195, target_lemak_g: 70, batas_sat_fat_g: 20 },
  // Padel
  { id: 'tgt-pd-m', day_type_id: 'dt-padel', fase: 'Maintenance', target_kalori: 2750, target_protein_g: 160, target_lemak_g: 80, batas_sat_fat_g: 24 },
  { id: 'tgt-pd-l', day_type_id: 'dt-padel', fase: 'Lean Gain', target_kalori: 2950, target_protein_g: 175, target_lemak_g: 85, batas_sat_fat_g: 25 },
  { id: 'tgt-pd-c', day_type_id: 'dt-padel', fase: 'Cut', target_kalori: 2450, target_protein_g: 185, target_lemak_g: 68, batas_sat_fat_g: 19 },
];

/** Log hari ini — sebagian terisi, supaya progress bar terlihat hidup. */
export const mockDailyLogHariIni: DailyLog = {
  id: 'log-hari-ini',
  tanggal: '2026-09-22',
  berat_pagi_kg: 74.6,
  day_type_id: 'dt-beban-lari',
  day_type_override: false,
  kalori: 1980,
  protein_g: 128,
  lemak_g: 61,
  karbo_g: 198,
  sat_fat_g: 17,
  target_kalori: 3100,
  catatan: 'Tidur 7j20m, energi bagus. Push day terasa ringan.',
  sumber_berat: 'manual',
};

/** Entri makanan hari ini; jumlahnya konsisten dengan total di daily log. */
export const mockFoodLogsHariIni: FoodLog[] = [
  { id: 'food-1', daily_log_id: 'log-hari-ini', nama_makanan: 'Oat + whey + pisang', foto_url: null, kalori: 520, protein_g: 42, lemak_g: 9, karbo_g: 68, sat_fat_g: 3, sumber: 'manual' },
  { id: 'food-2', daily_log_id: 'log-hari-ini', nama_makanan: 'Ayam bakar + nasi merah', foto_url: null, kalori: 760, protein_g: 54, lemak_g: 22, karbo_g: 82, sat_fat_g: 6, sumber: 'manual' },
  { id: 'food-3', daily_log_id: 'log-hari-ini', nama_makanan: 'Telur 3 + roti gandum', foto_url: null, kalori: 430, protein_g: 26, lemak_g: 22, karbo_g: 32, sat_fat_g: 7, sumber: 'manual' },
  { id: 'food-4', daily_log_id: 'log-hari-ini', nama_makanan: 'Greek yogurt + almond', foto_url: null, kalori: 270, protein_g: 6, lemak_g: 8, karbo_g: 16, sat_fat_g: 1, sumber: 'manual' },
];

/** Satu baris riwayat berat, lengkap dengan asal angkanya. */
export type EntriBerat = {
  tanggal: string;
  berat_pagi_kg: number;
  sumber_berat: SumberBerat;
};

/**
 * Riwayat berat 14 hari terakhir (kg, urut lama → baru).
 * Sengaja bercampur manual dan healthkit supaya asal tiap angka bisa
 * ditampilkan dan diuji, bukan hanya diasumsikan seragam.
 */
export const mockRiwayatBerat: EntriBerat[] = [
  { tanggal: '2026-09-09', berat_pagi_kg: 73.9, sumber_berat: 'manual' },
  { tanggal: '2026-09-10', berat_pagi_kg: 74.2, sumber_berat: 'manual' },
  { tanggal: '2026-09-11', berat_pagi_kg: 73.8, sumber_berat: 'healthkit' },
  { tanggal: '2026-09-12', berat_pagi_kg: 74.1, sumber_berat: 'manual' },
  { tanggal: '2026-09-13', berat_pagi_kg: 74.4, sumber_berat: 'manual' },
  { tanggal: '2026-09-14', berat_pagi_kg: 74.0, sumber_berat: 'healthkit' },
  { tanggal: '2026-09-15', berat_pagi_kg: 74.3, sumber_berat: 'manual' },
  { tanggal: '2026-09-16', berat_pagi_kg: 74.1, sumber_berat: 'manual' },
  { tanggal: '2026-09-17', berat_pagi_kg: 74.5, sumber_berat: 'healthkit' },
  { tanggal: '2026-09-18', berat_pagi_kg: 74.2, sumber_berat: 'manual' },
  { tanggal: '2026-09-19', berat_pagi_kg: 74.7, sumber_berat: 'manual' },
  { tanggal: '2026-09-20', berat_pagi_kg: 74.4, sumber_berat: 'healthkit' },
  { tanggal: '2026-09-21', berat_pagi_kg: 74.8, sumber_berat: 'manual' },
  { tanggal: '2026-09-22', berat_pagi_kg: 74.6, sumber_berat: 'manual' },
];

/** Cari target absolut untuk kombinasi tipe hari + fase. */
export function cariTarget(dayTypeId: string, fase: Fase): DayTypeTarget {
  const hit = mockDayTypeTargets.find((t) => t.day_type_id === dayTypeId && t.fase === fase);
  if (hit) return hit;

  // Sampai di sini berarti datanya kurang, bukan keadaan normal. Cadangan tetap
  // dikembalikan supaya layar tidak pecah, tapi jangan sampai lolos diam-diam:
  // sebelumnya justru ini yang membuat fase Cut memakai angka Lean Gain.
  if (__DEV__) {
    console.warn(`[mock] target tidak ada untuk ${dayTypeId} pada fase ${fase}`);
  }
  return mockDayTypeTargets[0];
}

/**
 * Susun MacroProgress dari log + target. Karbo tidak ditargetkan (target `null`)
 * karena PRD hanya menetapkan kalori, protein, lemak, dan batas sat fat.
 */
export function susunMacros(log: DailyLog, target: DayTypeTarget): MacroProgress[] {
  return [
    { key: 'kalori', label: 'Kalori', terpakai: log.kalori, target: target.target_kalori, unit: 'kcal' },
    { key: 'protein', label: 'Protein', terpakai: log.protein_g, target: target.target_protein_g, unit: 'g' },
    { key: 'lemak', label: 'Lemak', terpakai: log.lemak_g, target: target.target_lemak_g, unit: 'g' },
    { key: 'karbo', label: 'Karbo', terpakai: log.karbo_g, target: null, unit: 'g' },
    { key: 'satFat', label: 'Sat Fat', terpakai: log.sat_fat_g, target: target.batas_sat_fat_g, unit: 'g', isBatas: true },
  ];
}

/** Snapshot siap-tampil untuk layar Log Harian, dirakit dari data tiruan. */
export function mockSnapshotHariIni(): DailySnapshot {
  const log = mockDailyLogHariIni;
  const dayType = mockDayTypes.find((d) => d.id === log.day_type_id) ?? mockDayTypes[0];
  const fase = mockProfile.fase_aktif;
  const target = cariTarget(log.day_type_id, fase);
  return { log, dayType, target, fase, macros: susunMacros(log, target) };
}

/**
 * Entri berat terakhir SEBELUM tanggal tertentu, lengkap dengan asalnya.
 * Dipakai kartu Timbang Pagi sebagai nilai awal, supaya menyimpan berat
 * hari ini cukup dua tap (buka kartu → Simpan) tanpa mengetik.
 */
export function entriBeratTerakhirSebelum(tanggal: string): EntriBerat | null {
  const sebelum = mockRiwayatBerat.filter((r) => r.tanggal < tanggal);
  return sebelum.length ? sebelum[sebelum.length - 1] : null;
}

/** Hanya angkanya, untuk pemanggil yang tidak butuh asal data. */
export function beratTerakhirSebelum(tanggal: string): number | null {
  return entriBeratTerakhirSebelum(tanggal)?.berat_pagi_kg ?? null;
}

/**
 * `jumlah` timbangan terakhir sebelum tanggal tertentu, urut baru → lama.
 * Dipakai sheet Timbang Pagi untuk memperlihatkan asal angka dari hari ke hari.
 */
export function riwayatBeratTerakhir(tanggal: string, jumlah = 3): EntriBerat[] {
  return mockRiwayatBerat
    .filter((r) => r.tanggal < tanggal)
    .slice(-jumlah)
    .reverse();
}

/**
 * Tiruan penulisan berat pagi ke server.
 *
 * Fase 1 hanya menunda sebentar supaya status "Menyimpan…" benar-benar terlihat
 * dan bisa diuji. Fase backend menukar isinya dengan penulisan ke Supabase;
 * kontraknya sama — resolve bila berhasil, reject bila gagal.
 */
export function simpanBeratStub(_beratKg: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 700));
}

/**
 * Jangkar fase aktif untuk koridor target.
 * Fase 2 mengisinya dari `program_phases`; di Fase 1 ini tiruan yang masuk akal:
 * fase Lean Gain dimulai di awal rentang riwayat yang ada.
 */
export const mockJangkarFase = {
  // Riwayat bisa kosong untuk pengguna baru; jangkar tetap harus ada nilainya.
  tanggal_mulai: mockRiwayatBerat[0]?.tanggal ?? '2026-09-09',
  berat_awal_kg: mockRiwayatBerat[0]?.berat_pagi_kg ?? 70,
};
