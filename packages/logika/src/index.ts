/**
 * Titik masuk paket logika bersama Recomp Coach.
 *
 * Dipakai app iOS (Expo/Metro) dan web dashboard (Next.js). Mengekspor
 * TypeScript sumber, jadi tidak ada langkah build dan tidak ada artefak
 * yang bisa basi.
 */
export type {
  DayType,
  Fase,
  HitunganMakro,
  JenisOlahraga,
  MacroProgress,
  ModeMakro,
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
