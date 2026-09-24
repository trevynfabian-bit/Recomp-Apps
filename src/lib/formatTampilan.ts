import { formatDesimal } from '@recomp/logika';

/**
 * Aturan format angka TAMPILAN (bab Desain 8.4) yang tidak ada di paket logika:
 * paket logika memformat angka (pemisah ribuan ".", desimal ","); di sini
 * aturan tanda dan satuan untuk selisih.
 *
 * - Tanda minus memakai karakter minus "−" (U+2212), bukan tanda hubung "-":
 *   lebarnya sama dengan "+", jadi kolom angka tidak bergeser.
 * - Selisih positif selalu diberi "+", supaya arah terbaca tanpa warna.
 * - Nol ditulis sesuai presisinya ("0,0"), atau diganti kalimat bila diberikan.
 */
export function formatSelisih(
  nilai: number,
  { desimal = 1, unit, nol }: { desimal?: number; unit?: string; nol?: string } = {},
): string {
  const faktor = 10 ** desimal;
  const bulat = Math.round(nilai * faktor) / faktor;
  if (bulat === 0) return nol ?? `${formatDesimal(0, desimal)}${unit ? ` ${unit}` : ''}`;
  const tanda = bulat > 0 ? '+' : '−';
  return `${tanda}${formatDesimal(Math.abs(bulat), desimal)}${unit ? ` ${unit}` : ''}`;
}
