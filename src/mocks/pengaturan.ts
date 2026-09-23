/**
 * Data tiruan halaman Pengaturan (Fase 4, sisi frontend).
 *
 * Profil, fase, dan target sudah punya tiruannya sendiri (`@/mocks/dailyLog`,
 * `useProfil`); di sini hanya yang belum punya tempat: akun, isi ekspor,
 * hasil lab, dan sejak kapan fase berjalan.
 */

export const mockAkun = {
  email: 'trevyn@contoh.id',
  /** YYYY-MM-DD */
  bergabung: '2026-08-02',
};

/** Fase aktif berjalan sejak tanggal ini (dari `fase_periode`). */
export const mockFaseMulai = '2026-09-09';

/**
 * Isi ekspor, sebagai hitungan per jenis data. Ditampilkan SEBELUM ekspor
 * disiapkan, supaya pengguna tahu apa yang akan ada di berkasnya.
 */
export const mockIsiEkspor: { label: string; jumlah: number }[] = [
  { label: 'hari tercatat', jumlah: 52 },
  { label: 'entri makanan', jumlah: 214 },
  { label: 'pengukuran tubuh', jumlah: 8 },
  { label: 'sesi latihan', jumlah: 31 },
  { label: 'data dari perangkat', jumlah: 4812 },
  { label: 'percakapan coach', jumlah: 6 },
  { label: 'hasil lab', jumlah: 2 },
];

export type HasilLabTiruan = { id: string; tanggal: string; nama: string; penanda: number };

export const mockHasilLab: HasilLabTiruan[] = [
  { id: 'lab-2', tanggal: '2026-09-03', nama: 'Profil lipid', penanda: 4 },
  { id: 'lab-1', tanggal: '2026-06-14', nama: 'Panel darah lengkap', penanda: 18 },
];

/** Tiruan menyiapkan berkas ekspor: beberapa detik, lalu ukuran berkasnya. */
export function mockSiapkanEkspor(): Promise<{ namaBerkas: string; ukuranMb: number }> {
  return new Promise((selesai) =>
    setTimeout(() => selesai({ namaBerkas: 'recomp-ekspor-2026-09-23.zip', ukuranMb: 2.4 }), 1600),
  );
}
