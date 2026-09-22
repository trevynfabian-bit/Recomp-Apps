/** Zona waktu kanonis aplikasi — semua tanggal dinormalisasi ke sini. */
export const ZONA_WAKTU = 'Asia/Jakarta';

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Format bilangan bulat gaya Indonesia (titik sebagai pemisah ribuan). */
export function formatAngka(nilai: number): string {
  return Math.round(nilai).toLocaleString('id-ID');
}

/** Format angka desimal dengan jumlah digit tetap, koma sebagai desimal. */
export function formatDesimal(nilai: number, digit = 1): string {
  return nilai.toFixed(digit).replace('.', ',');
}

/**
 * Ubah `YYYY-MM-DD` menjadi "Senin, 22 September".
 * Parsing manual agar tidak tergeser oleh zona waktu perangkat.
 */
export function formatTanggalPanjang(tanggal: string): string {
  const [tahun, bulan, hari] = tanggal.split('-').map(Number);
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return `${NAMA_HARI[d.getUTCDay()]}, ${hari} ${NAMA_BULAN[bulan - 1]}`;
}

/** Tanggal hari ini sebagai `YYYY-MM-DD` menurut Asia/Jakarta. */
export function tanggalHariIni(): string {
  // en-CA menghasilkan format YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_WAKTU });
}

/** Rasio 0..1 untuk progress bar; aman terhadap target 0/negatif. */
export function rasio(terpakai: number, target: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.min(Math.max(terpakai / target, 0), 1);
}
