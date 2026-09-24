/**
 * Konstanta yang menjaga app tetap sejalan dengan Apple Human Interface
 * Guidelines. Dikumpulkan di satu tempat supaya tidak ditebak ulang per komponen.
 */

/**
 * Ukuran minimum area sentuh, 44×44 pt (HIG: Controls).
 * Dipakai sebagai `minHeight`/`minWidth` pada setiap kontrol kecil.
 */
export const TAP_MIN = 44;

/**
 * Tinggi VISUAL kontrol rapat (chip templat, chip tampilan, tautan "Hari ini",
 * tombol tutup kecil). Area sentuhnya tetap digenapkan ke `TAP_MIN` lewat
 * `hitSlop={sisaSentuh(KONTROL_RAPAT)}`: kecil di mata, 44 pt di jari.
 */
export const KONTROL_RAPAT = 36;

/** Tinggi visual segmen di dalam kontrol segmen (di dalam `ukuran.sisipanSegmen`). */
export const KONTROL_SEGMEN = 40;

/**
 * `hitSlop` yang menggenapkan kontrol setinggi `visual` menjadi `TAP_MIN`.
 * Dipakai untuk setiap kontrol yang sengaja tampil lebih kecil dari 44 pt.
 */
export function sisaSentuh(visual: number): number {
  return Math.max(0, Math.ceil((TAP_MIN - visual) / 2));
}

/**
 * Ukuran teks terkecil yang boleh ada di UI (HIG: Typography, "minimum 11 pt").
 * `typography.caption` tepat di batas ini; tidak ada gaya yang lebih kecil.
 */
export const TEKS_MIN = 11;

/**
 * Padanan tangga `typography` dengan gaya teks bawaan iOS (HIG: Typography,
 * ukuran default "Large"). Dipakai sebagai acuan saat menambah gaya baru:
 * ukuran app sengaja satu langkah lebih rapat dari iOS untuk dashboard padat,
 * dan Dynamic Type tetap berlaku lewat `allowFontScaling` bawaan `Text`.
 */
export const PADANAN_IOS = {
  hero: 'tidak ada padanan: angka dasbor, dibatasi MAKS_SKALA_HERO',
  display: 'Large Title (34)',
  title: 'Title 3 (20)',
  body: 'Callout (16)',
  label: 'Footnote (13)',
  caption: 'Caption 2 (11)',
} as const;

/**
 * Batas pembesaran Dynamic Type untuk angka raksasa.
 * Teks isi dibiarkan menskala penuh; hanya angka hero yang dibatasi agar
 * tata letak satu-angka-per-layar tidak pecah pada ukuran aksesibilitas ekstrem.
 */
export const MAKS_SKALA_HERO = 1.3;
