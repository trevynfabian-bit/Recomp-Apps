import { formatTanggalPanjang, ZONA_WAKTU } from './format';
import type { KelompokPesan, PesanRingkas } from './tipe';

/**
 * Penataan riwayat percakapan AI Coach.
 *
 * Deretan gelembung tanpa penanda waktu terbaca seolah semuanya terjadi
 * barusan. Padahal justru sebaliknya yang penting di app ini: jawaban coach
 * berisi angka yang BERLAKU PADA SAAT ITU — "rata-rata 7 hari Anda 74,5 kg"
 * dari dua pekan lalu bukan informasi yang sama dengan kalimat serupa hari ini.
 *
 * Pengelompokan dilakukan per TANGGAL, bukan per jam: dalam satu hari,
 * datanya sama, jadi memisahkan pagi dan sore cuma menambah garis tanpa
 * menambah arti.
 */

/** Judul percakapan dipotong di sini supaya muat satu baris di daftar. */
export const MAKS_JUDUL = 48;

/** Format jam gaya Indonesia: "07.14", bukan "07:14". */
export function formatJam(waktuIso: string): string {
  const d = new Date(waktuIso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleTimeString('id-ID', {
      timeZone: ZONA_WAKTU,
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(':', '.');
}

/** Tanggal `YYYY-MM-DD` dari sebuah waktu ISO, menurut Asia/Jakarta. */
export function tanggalDariWaktu(waktuIso: string): string {
  const d = new Date(waktuIso);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA menghasilkan format YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: ZONA_WAKTU });
}

/**
 * Label tanggal untuk pemisah di daftar pesan.
 * "Hari ini" dan "Kemarin" dipakai karena itu yang orang pikirkan; sisanya
 * memakai tanggal panjang supaya tidak ada tebakan.
 */
export function labelTanggalRelatif(tanggal: string, hariIni: string): string {
  if (tanggal === hariIni) return 'Hari ini';
  if (tanggal === mundurSehari(hariIni)) return 'Kemarin';
  return formatTanggalPanjang(tanggal);
}

/** Kelompokkan pesan per tanggal, urut lama → baru, beserta labelnya. */
export function kelompokkanPerTanggal(
  pesan: PesanRingkas[],
  hariIni: string,
): KelompokPesan[] {
  const kelompok: KelompokPesan[] = [];
  for (const p of pesan) {
    const tanggal = tanggalDariWaktu(p.waktu);
    const terakhir = kelompok[kelompok.length - 1];
    if (terakhir && terakhir.tanggal === tanggal) {
      terakhir.idPesan.push(p.id);
    } else {
      kelompok.push({
        tanggal,
        label: labelTanggalRelatif(tanggal, hariIni),
        idPesan: [p.id],
      });
    }
  }
  return kelompok;
}

/**
 * Judul percakapan diturunkan dari PERTANYAAN PERTAMA pengguna, bukan dari
 * jawaban coach: yang diingat orang saat mencari percakapan lama adalah apa
 * yang ia tanyakan, bukan bagaimana dijawabnya.
 */
export function judulPercakapan(pesan: PesanRingkas[], cadangan = 'Percakapan baru'): string {
  const pertama = pesan.find((p) => p.peran === 'pengguna');
  if (!pertama) return cadangan;

  const bersih = pertama.teks.replace(/\s+/g, ' ').trim();
  if (bersih.length === 0) return cadangan;
  if (bersih.length <= MAKS_JUDUL) return bersih;
  // Potong di batas kata terdekat supaya tidak memotong kata di tengah.
  const potong = bersih.slice(0, MAKS_JUDUL);
  const spasi = potong.lastIndexOf(' ');
  return `${(spasi > MAKS_JUDUL * 0.6 ? potong.slice(0, spasi) : potong).trimEnd()}…`;
}

function mundurSehari(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/**
 * Panjang pertanyaan coach paling banyak (karakter). SAMA dengan CHECK
 * `pesan_teks_wajar` di `pesan_coach`; dipakai klien (menolak sebelum
 * mengirim) dan Edge Function coach-chat. Dijaga `cek:prompt`.
 */
export const MAKS_PERTANYAAN_COACH = 8000;
