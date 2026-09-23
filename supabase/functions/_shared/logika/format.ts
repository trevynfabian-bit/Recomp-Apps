// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
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

/**
 * Format angka desimal dengan jumlah digit TETAP.
 * Memakai Intl agar pemisah ribuan ikut benar (1.234,5), bukan hanya
 * menukar titik jadi koma.
 */
export function formatDesimal(nilai: number, digit = 1): string {
  return nilai.toLocaleString('id-ID', {
    minimumFractionDigits: digit,
    maximumFractionDigits: digit,
  });
}

/**
 * Format angka makro: satu desimal HANYA bila memang ada pecahannya.
 * 128 tetap "128", 42,5 tampil "42,5" — supaya angka bulat tidak berisik
 * dengan ",0" tapi pecahan tidak diam-diam dibulatkan.
 */
export function formatMakro(nilai: number): string {
  const dibulatkan = Math.round(nilai * 10) / 10;
  return Number.isInteger(dibulatkan) ? formatAngka(dibulatkan) : formatDesimal(dibulatkan, 1);
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

/**
 * Rentang tanggal ringkas untuk judul periode: "15–21 September" bila sebulan,
 * "29 September – 5 Oktober" bila melintasi bulan.
 *
 * Bulan yang sama sengaja tidak diulang dua kali. Judul periode dibaca sekilas,
 * dan "15 September – 21 September" memaksa mata memverifikasi bahwa kedua
 * bulannya memang sama sebelum bisa membaca angkanya.
 */
export function formatRentangTanggal(dari: string, sampai: string): string {
  const [ty, tm, td] = dari.split('-').map(Number);
  const [sy, sm, sd] = sampai.split('-').map(Number);
  const bulanDari = NAMA_BULAN[tm - 1];
  const bulanSampai = NAMA_BULAN[sm - 1];

  if (ty === sy && tm === sm) return `${td}–${sd} ${bulanSampai}`;
  if (ty === sy) return `${td} ${bulanDari} – ${sd} ${bulanSampai}`;
  return `${td} ${bulanDari} ${ty} – ${sd} ${bulanSampai} ${sy}`;
}

/** Usia penuh tahun pada tanggal acuan (`YYYY-MM-DD`); `null` bila tanggal lahir belum diisi. */
export function usiaPada(tanggalLahir: string | null, pada: string): number | null {
  if (!tanggalLahir) return null;
  const [ly, lm, ld] = tanggalLahir.split('-').map(Number);
  const [py, pm, pd] = pada.split('-').map(Number);
  let usia = py - ly;
  // Belum ulang tahun di tahun itu.
  if (pm < lm || (pm === lm && pd < ld)) usia -= 1;
  return usia;
}
