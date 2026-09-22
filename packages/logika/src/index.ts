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
  MacroProgress,
  ModeMakro,
  RataRata7Hari,
  SinyalArah,
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
  deretTren,
  JENDELA_HARI,
  majuHari,
  mundurHari,
  rataRata7Hari,
  sinyalArah,
} from './tren';
