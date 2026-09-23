import type { PeriodeFase } from '@recomp/logika';

/**
 * Data tiruan halaman Pengaturan (Fase 4, sisi frontend).
 *
 * Profil, fase, dan target sudah punya tiruannya sendiri (`@/mocks/dailyLog`,
 * `useProfil`); di sini hanya yang belum punya tempat: akun, hasil lab, dan
 * riwayat fase.
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
  { fase: 'Lean Gain', mulai: '2026-09-09', selesai: null, beratAwalKg: 73.9 },
];


export type HasilLabTiruan = { id: string; tanggal: string; nama: string; penanda: number };

export const mockHasilLab: HasilLabTiruan[] = [
  { id: 'lab-2', tanggal: '2026-09-03', nama: 'Profil lipid', penanda: 4 },
  { id: 'lab-1', tanggal: '2026-06-14', nama: 'Panel darah lengkap', penanda: 18 },
];
