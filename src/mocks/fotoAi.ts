/**
 * Stub analisis foto makanan untuk Fase 1 frontend.
 *
 * Fitur aslinya baru dikerjakan di Fase 4 (Edge Function + provider LLM), jadi
 * di sini kontrak API-nya saja yang diasumsikan: satu foto masuk, satu tebakan
 * makro keluar beserta tingkat keyakinan. Mengganti ke backend asli cukup
 * menukar isi `analisisFotoStub` — bentuk `HasilAnalisisFoto` tidak berubah.
 */

export type HasilAnalisisFoto = {
  nama_makanan: string;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  /** Seberapa yakin model; ditampilkan supaya pengguna tahu kapan perlu dikoreksi. */
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
};

const CONTOH_HASIL: HasilAnalisisFoto[] = [
  { nama_makanan: 'Nasi + ayam geprek + lalapan', kalori: 720, protein_g: 42, lemak_g: 28, karbo_g: 76, sat_fat_g: 8, keyakinan: 'sedang' },
  { nama_makanan: 'Salmon panggang + kentang', kalori: 540, protein_g: 38, lemak_g: 24, karbo_g: 42, sat_fat_g: 5, keyakinan: 'tinggi' },
  { nama_makanan: 'Mie ayam + pangsit', kalori: 610, protein_g: 24, lemak_g: 22, karbo_g: 78, sat_fat_g: 7, keyakinan: 'rendah' },
  { nama_makanan: 'Smoothie bowl + granola', kalori: 430, protein_g: 14, lemak_g: 12, karbo_g: 68, sat_fat_g: 3, keyakinan: 'sedang' },
];

let urutan = 0;

/**
 * Tiruan panggilan analisis foto: menunggu sebentar lalu mengembalikan salah
 * satu contoh hasil secara bergiliran, supaya percobaan berturut-turut tidak
 * selalu menampilkan angka yang sama.
 */
export function analisisFotoStub(): Promise<HasilAnalisisFoto> {
  const hasil = CONTOH_HASIL[urutan % CONTOH_HASIL.length];
  urutan += 1;
  return new Promise((resolve) => setTimeout(() => resolve(hasil), 1200));
}
