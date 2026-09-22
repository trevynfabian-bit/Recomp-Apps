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
  HasilBodyFat,
  HasilTdee,
  InputBodyFat,
  InputTdee,
  LajuBudget,
  EntriBeratRingkas,
  Fase,
  HitunganMakro,
  JenisOlahraga,
  KecocokanFase,
  KecukupanTren,
  KelompokPesan,
  KekuranganBodyFat,
  KomposisiTubuh,
  KoridorTarget,
  MacroProgress,
  MetodeTdee,
  ModeMakro,
  OpsiRedistribusi,
  PerubahanUkuran,
  PesanRingkas,
  ProteksiProtein,
  RataRata7Hari,
  RingkasanHariBudget,
  RingkasanPerubahan,
  SinyalArah,
  StatusBatasPinggang,
  StatusKoridor,
  TitikKoridor,
  TitikTren,
  TitikUkuran,
  WorkoutRingkas,
} from './tipe';

export {
  formatAngka,
  formatDesimal,
  formatMakro,
  formatRentangTanggal,
  formatTanggalPanjang,
  rasio,
  tanggalHariIni,
  ZONA_WAKTU,
} from './format';

export { hitungMakro, keteranganMakro } from './makro';

export {
  formatJam,
  judulPercakapan,
  kelompokkanPerTanggal,
  labelTanggalRelatif,
  MAKS_JUDUL,
  tanggalDariWaktu,
} from './percakapan';

export { estimasiBodyFatNavy, komposisiTubuh, KETIDAKPASTIAN_BF } from './bodyFat';

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

export {
  HARI_PER_PEKAN,
  lajuTerkini,
  ringkasPerubahan,
  statusBatasPinggang,
} from './ukuran';

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
