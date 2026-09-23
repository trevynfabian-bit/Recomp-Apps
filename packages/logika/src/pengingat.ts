import { formatAngka, formatMakro } from './format';

/**
 * Pengingat & widget layar kunci.
 *
 * PRD meminta dua hal yang gampang dilanggar tanpa sengaja:
 *   • nada NETRAL — tidak ada "melebihi target", tidak ada peringatan. Satu
 *     kalimat bernada menegur di layar kunci setiap pagi cukup untuk membuat
 *     orang mematikan semua notifikasi, termasuk yang berguna;
 *   • pengingat timbang hanya bila TERLEWAT — yang sudah timbang tidak perlu
 *     diingatkan.
 * Keduanya dipegang di sini, bukan di teks yang tersebar di layar, dan nada
 * setiap kalimat diperiksa mesin lewat `pelanggaranNada`.
 */

/** Jam pengingat bawaan, dalam menit sejak tengah malam (06.30). */
export const JAM_TIMBANG_BAWAAN = 6 * 60 + 30;

/**
 * Rentang jam pengingat timbang: pagi saja. Timbang pagi dibandingkan dari hari
 * ke hari justru karena kondisinya sama (bangun tidur, sebelum makan);
 * pengingat pukul 14.00 menghasilkan angka yang tidak sebanding.
 */
export const RENTANG_JAM_TIMBANG = { min: 4 * 60, maks: 11 * 60 } as const;

/** Langkah stepper jam, dalam menit. */
export const LANGKAH_JAM_MENIT = 15;

/** "06.30" — gaya jam Indonesia, titik sebagai pemisah. */
export function formatJamMenit(menit: number): string {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return `${String(j).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/** Geser jam pengingat, tertahan di rentang pagi. */
export function geserJamTimbang(menit: number, delta: number): number {
  return Math.min(RENTANG_JAM_TIMBANG.maks, Math.max(RENTANG_JAM_TIMBANG.min, menit + delta));
}

/**
 * Apakah pengingat timbang hari ini perlu dikirim. Berat dari SUMBER MANA PUN
 * (ketik sendiri atau Apple Health) dihitung sudah timbang — pengingat yang
 * datang setelah timbangan pintar sudah mengirim angkanya terasa seperti app
 * yang tidak memperhatikan.
 */
export function perluPengingatTimbang(aktif: boolean, beratHariIniTercatat: boolean): boolean {
  return aktif && !beratHariIniTercatat;
}

/** Isi notifikasi timbang pagi. */
export const NOTIF_TIMBANG = {
  judul: 'Timbang pagi',
  isi: 'Setelah bangun, sebelum sarapan — kalau sempat. Satu ketukan untuk mencatat.',
} as const;

/** Isi notifikasi ringkasan mingguan. */
export const NOTIF_RINGKASAN = {
  judul: 'Ringkasan pekan lalu',
  isi: 'Angka pekan kemarin sudah dirangkum. Buka untuk membacanya.',
} as const;

/**
 * Kata & tanda yang membuat notifikasi terbaca menegur. Daftarnya sengaja
 * ketat: "jangan" dan tanda seru pun tidak, karena notifikasi dibaca sekilas
 * di layar kunci dan nada lebih cepat tertangkap daripada isi.
 */
const TERLARANG = ['melebihi', 'kelebihan', 'berlebih', 'gagal', 'awas', 'jangan', 'peringatan', 'terlalu'];

/** Pelanggaran nada dalam sebuah teks; daftar kosong berarti netral. */
export function pelanggaranNada(teks: string): string[] {
  const kecil = teks.toLowerCase();
  const hasil = TERLARANG.filter((k) => new RegExp(`(?<![\\p{L}])${k}`, 'u').test(kecil));
  if (teks.includes('!')) hasil.push('!');
  return hasil;
}

/** Ringkasan hari yang dibaca widget, seperti `daily_summaries` di PRD. */
export type RingkasanWidget = {
  sisaKalori: number | null;
  sisaProteinG: number | null;
  /** ISO 8601 saat server menghitungnya; `null` bila belum pernah. */
  dihitungPada: string | null;
};

/**
 * Teks widget layar kunci.
 *
 * Kalori di atas target ditulis sebagai FAKTA ("120 kcal di atas target"),
 * bukan teguran, dan tanpa warna peringatan. `tampilkanAngka: false` untuk
 * layar kunci yang dilihat orang lain: data kesehatan tampil tanpa kunci
 * dibuka, jadi pengguna berhak menyembunyikannya.
 *
 * WidgetKit ditulis Swift dan tidak bisa menjalankan fungsi ini; bentuk
 * kalimatnya karena itu dijaga `npm run cek:widget` dan harus diikuti apa
 * adanya oleh widget native (atau dikirim server bersama `daily_summaries`).
 */
export function teksWidget(
  r: RingkasanWidget,
  tampilkanAngka: boolean,
): { judul: string; baris1: string; baris2: string; aksesLabel: string } {
  if (!tampilkanAngka) {
    return {
      judul: 'Recomp',
      baris1: 'Buka app untuk',
      baris2: 'melihat sisa hari ini',
      aksesLabel: 'Recomp. Buka app untuk melihat sisa hari ini.',
    };
  }
  if (r.sisaKalori === null) {
    return {
      judul: 'Sisa hari ini',
      baris1: 'Belum ada ringkasan',
      baris2: 'Buka app untuk mulai',
      aksesLabel: 'Belum ada ringkasan hari ini.',
    };
  }
  const kalori =
    r.sisaKalori >= 0
      ? `${formatAngka(r.sisaKalori)} kcal tersisa`
      : `${formatAngka(-r.sisaKalori)} kcal di atas target`;
  const protein =
    r.sisaProteinG === null
      ? 'Protein belum ditargetkan'
      : r.sisaProteinG > 0
        ? `${formatMakro(r.sisaProteinG)} g protein lagi`
        : 'Protein tercapai';
  return { judul: 'Sisa hari ini', baris1: kalori, baris2: protein, aksesLabel: `${kalori}. ${protein}.` };
}
