/**
 * Titik masuk paket logika bersama Recomp Coach.
 *
 * Dipakai app iOS (Expo/Metro) dan web dashboard (Next.js). Mengekspor
 * TypeScript sumber, jadi tidak ada langkah build dan tidak ada artefak
 * yang bisa basi.
 */
export type {
  DayType,
  EntriBeratRingkas,
  Fase,
  HitunganMakro,
  JenisOlahraga,
  KecocokanFase,
  KecukupanTren,
  KoridorTarget,
  MacroProgress,
  ModeMakro,
  RataRata7Hari,
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
  sinyalArah,
} from './tren';

export { koridorTarget, LAJU_PER_MINGGU, statusKoridor } from './koridor';
