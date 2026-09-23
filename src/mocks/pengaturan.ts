import type { PeriodeFase } from '@recomp/logika';

/**
 * Data tiruan halaman Pengaturan (Fase 4, sisi frontend).
 *
 * Profil, fase, dan target sudah punya tiruannya sendiri (`@/mocks/dailyLog`,
 * `useProfil`); di sini hanya yang belum punya tempat: akun dan
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
