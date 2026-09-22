/**
 * Titik masuk paket logika bersama Recomp Coach.
 *
 * Dipakai app iOS (Expo/Metro) dan web dashboard (Next.js). Mengekspor
 * TypeScript sumber, jadi tidak ada langkah build dan tidak ada artefak
 * yang bisa basi.
 */
export type {
  BarisKumulatif,
  BudgetMingguan,
  DayType,
  HariBudget,
  HariRedistribusi,
  HasilRedistribusi,
  HasilTdee,
  InputTdee,
  LajuBudget,
  EntriBeratRingkas,
  Fase,
  HitunganMakro,
  JenisOlahraga,
  KecocokanFase,
  KecukupanTren,
  KoridorTarget,
  MacroProgress,
  MetodeTdee,
  ModeMakro,
  OpsiRedistribusi,
  ProteksiProtein,
  RataRata7Hari,
  RingkasanHariBudget,
  SinyalArah,
  StatusKoridor,
  TitikKoridor,
  TitikTren,
  WorkoutRingkas,
} from './tipe';

export {
  formatAngka,
  formatDesimal,
  formatMakro,
  formatTanggalPanjang,
  rasio,
  tanggalHariIni,
  ZONA_WAKTU,
} from './format';

export { hitungMakro, keteranganMakro } from './makro';

export { alasanDeteksi, deteksiTipeHari, type HasilDeteksi } from './deteksiTipeHari';

export {
  arahSesuaiFase,
  deretTren,
  kecukupanTren,
  JENDELA_HARI,
  majuHari,
  mundurHari,
  rataRata7Hari,
  selisihHari,
  sinyalArah,
} from './tren';

export { koridorTarget, LAJU_PER_MINGGU, statusKoridor } from './koridor';

export { awalMinggu, budgetMingguan, hariDalamMinggu, lajuBudget, rincianKumulatif } from './budget';

export {
  hitungRedistribusi,
  KELIPATAN_KCAL,
  periksaProteksiProtein,
  selisihPerluDipindah,
  terapkanRedistribusi,
} from './redistribusi';

export {
  bandingkanTargetTdee,
  estimasiTdee,
  KCAL_PER_KG,
  pengaliRataRata,
  PENGALI_AKTIVITAS,
} from './tdee';
