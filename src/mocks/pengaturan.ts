import type { PeriodeFase } from '@recomp/logika';

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

/**
 * Riwayat fase (`fase_periode`), lama → baru. Periode terakhir yang berjalan;
 * fasenya sama dengan `mockProfile.fase_aktif`, seperti yang dijaga `ganti_fase`.
 */
export const mockRiwayatFase: PeriodeFase[] = [
  { fase: 'Maintenance', mulai: '2026-08-02', selesai: '2026-09-08', beratAwalKg: 74.2 },
  { fase: 'Lean Gain', mulai: '2026-09-09', selesai: null, beratAwalKg: 74.0 },
];

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
