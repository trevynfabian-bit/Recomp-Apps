// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
/**
 * Peringatan sebelum menyimpan target yang MENURUNKAN protein.
 *
 * Saat rekomposisi, protein yang menjaga massa otot selama kalori ditekan;
 * redistribusi mingguan tidak pernah memotongnya (lihat proteksi protein),
 * jadi menurunkannya lewat form target juga tidak boleh terjadi diam-diam.
 * Bukan larangan: pengguna tetap boleh menyimpan setelah membaca alasannya.
 *
 * Dua pemicu, masing-masing dengan kalimatnya sendiri:
 *   1. Protein baru lebih rendah dari target tersimpan untuk tipe hari x fase itu.
 *   2. Protein baru di bawah 1,6 g per kg berat (batas bawah kisaran yang umum
 *      dipakai untuk menjaga massa otot saat defisit), bila berat diketahui.
 */
import { formatDesimal } from './format.ts';

/** Batas bawah protein per kg berat badan yang dijaga saat rekomposisi. */
export const PROTEIN_MIN_G_PER_KG = 1.6;

export type PeringatanProtein = {
  /** Gram yang turun dibanding target tersimpan; `null` bila tidak turun atau belum ada. */
  turunG: number | null;
  /** Gram per kg berat dari protein baru; `null` bila berat tidak diketahui. */
  gPerKg: number | null;
  /** Protein baru di bawah `PROTEIN_MIN_G_PER_KG`. */
  rendah: boolean;
  /** Satu-dua kalimat layak tampil. */
  kalimat: string;
};

export function peringatanProtein(
  baruG: number,
  lamaG: number | null,
  beratKg: number | null,
): PeringatanProtein | null {
  const turunG = lamaG !== null && baruG < lamaG ? lamaG - baruG : null;
  const gPerKg = beratKg !== null && beratKg > 0 ? baruG / beratKg : null;
  const rendah = gPerKg !== null && gPerKg < PROTEIN_MIN_G_PER_KG;
  if (turunG === null && !rendah) return null;

  const bagian: string[] = [];
  if (turunG !== null) bagian.push(`Protein turun ${formatDesimal(turunG, 0)} g dari target tersimpan (${formatDesimal(lamaG!, 0)} → ${formatDesimal(baruG, 0)} g).`);
  if (rendah) {
    bagian.push(
      `${formatDesimal(baruG, 0)} g setara ${formatDesimal(gPerKg!, 1)} g per kg berat, di bawah ${formatDesimal(PROTEIN_MIN_G_PER_KG, 1)} g/kg yang dijaga saat rekomposisi.`,
    );
  }
  bagian.push('Protein yang menjaga otot selama kalori ditekan; kurangi karbo atau lemak dulu bila bisa.');
  return { turunG, gPerKg, rendah, kalimat: bagian.join(' ') };
}
