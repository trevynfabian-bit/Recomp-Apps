import { skemaBerlaku } from './colors';

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

/**
 * Bayangan halus kartu — memberi kedalaman tanpa mengaburkan latar. Di atas
 * latar gelap bayangan harus pekat supaya terlihat; di atas latar terang
 * kepekatan yang sama membuat kartu tampak kotor, jadi diturunkan. Getter:
 * dibaca saat render, mengikuti skema yang berlaku.
 */
export const BAYANGAN_KARTU = {
  shadowColor: '#000000',
  get shadowOpacity() {
    return skemaBerlaku() === 'gelap' ? 0.35 : 0.08;
  },
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
