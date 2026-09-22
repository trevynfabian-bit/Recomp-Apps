import type {
  DailyLog,
  DailySnapshot,
  DayType,
  DayTypeTarget,
  Fase,
  FoodLog,
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
};

export const mockDayTypes: DayType[] = [
  { id: 'dt-rest', nama: 'Rest', auto_detect: true, is_default: true },
  { id: 'dt-angkat', nama: 'Angkat Beban', auto_detect: true, is_default: false },
  { id: 'dt-beban-lari', nama: 'Beban+Lari', auto_detect: true, is_default: false },
  { id: 'dt-padel', nama: 'Padel', auto_detect: true, is_default: false },
];

/** Target absolut per (tipe hari x fase) — nilai dipakai langsung, tanpa pengali. */
export const mockDayTypeTargets: DayTypeTarget[] = [
  { id: 'tgt-1', day_type_id: 'dt-rest', fase: 'Lean Gain', target_kalori: 2450, target_protein_g: 165, target_lemak_g: 75, batas_sat_fat_g: 22 },
  { id: 'tgt-2', day_type_id: 'dt-angkat', fase: 'Lean Gain', target_kalori: 2850, target_protein_g: 180, target_lemak_g: 82, batas_sat_fat_g: 25 },
  { id: 'tgt-3', day_type_id: 'dt-beban-lari', fase: 'Lean Gain', target_kalori: 3100, target_protein_g: 185, target_lemak_g: 88, batas_sat_fat_g: 26 },
  { id: 'tgt-4', day_type_id: 'dt-padel', fase: 'Lean Gain', target_kalori: 2950, target_protein_g: 175, target_lemak_g: 85, batas_sat_fat_g: 25 },
];

/** Log hari ini — sebagian terisi, supaya progress bar terlihat hidup. */
export const mockDailyLogHariIni: DailyLog = {
  id: 'log-hari-ini',
  tanggal: '2026-09-22',
  berat_pagi_kg: 74.6,
  day_type_id: 'dt-angkat',
  day_type_override: false,
  kalori: 1980,
  protein_g: 128,
  lemak_g: 61,
  karbo_g: 198,
  sat_fat_g: 17,
  target_kalori: 2850,
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

/**
 * Riwayat berat 14 hari terakhir (kg, urut lama → baru).
 * Dipakai layar Tren; ditaruh di sini agar satu sumber tiruan untuk Fase 1.
 */
export const mockRiwayatBerat: { tanggal: string; berat_pagi_kg: number }[] = [
  { tanggal: '2026-09-09', berat_pagi_kg: 73.9 },
  { tanggal: '2026-09-10', berat_pagi_kg: 74.2 },
  { tanggal: '2026-09-11', berat_pagi_kg: 73.8 },
  { tanggal: '2026-09-12', berat_pagi_kg: 74.1 },
  { tanggal: '2026-09-13', berat_pagi_kg: 74.4 },
  { tanggal: '2026-09-14', berat_pagi_kg: 74.0 },
  { tanggal: '2026-09-15', berat_pagi_kg: 74.3 },
  { tanggal: '2026-09-16', berat_pagi_kg: 74.1 },
  { tanggal: '2026-09-17', berat_pagi_kg: 74.5 },
  { tanggal: '2026-09-18', berat_pagi_kg: 74.2 },
  { tanggal: '2026-09-19', berat_pagi_kg: 74.7 },
  { tanggal: '2026-09-20', berat_pagi_kg: 74.4 },
  { tanggal: '2026-09-21', berat_pagi_kg: 74.8 },
  { tanggal: '2026-09-22', berat_pagi_kg: 74.6 },
];

/** Cari target absolut untuk kombinasi tipe hari + fase. */
export function cariTarget(dayTypeId: string, fase: Fase): DayTypeTarget {
  const hit = mockDayTypeTargets.find((t) => t.day_type_id === dayTypeId && t.fase === fase);
  if (hit) return hit;
  // Fallback aman: target tipe hari default pada fase yang diminta.
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
