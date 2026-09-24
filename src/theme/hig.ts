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
