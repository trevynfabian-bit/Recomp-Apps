/**
 * Keadaan privasi yang belum punya sumber di app (Fase 4, sisi frontend).
 *
 * Foto makanan saat ini TIDAK disimpan: entri makanan dari foto menyimpan
 * `foto_url: null`. Bila task backend mulai menyimpannya ke Supabase Storage,
 * nilai ini ikut berubah — dan halaman Privasi mengatakannya, karena kalimatnya
 * disusun dari nilai ini, bukan ditulis tetap.
 */
export const mockFotoMakananDisimpan = false;
