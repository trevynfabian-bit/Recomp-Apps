/**
 * Workout tiruan untuk hari ini.
 *
 * Fase 2 mengisi ini dari sumber asli (Hevy lewat cron, Strava/WHOOP lewat
 * webhook, HealthKit di perangkat). Bentuk `WorkoutRingkas` sudah diasumsikan
 * sekarang supaya auto-deteksi tipe hari bisa dibangun dan diuji lebih dulu.
 */

// Bentuk workout kini tinggal di paket logika bersama, karena aturan
// auto-deteksi yang memakainya juga dipakai web dashboard.
export type { JenisOlahraga, WorkoutRingkas } from '@recomp/logika';

import type { WorkoutRingkas } from '@recomp/logika';

/** Nama layanan yang enak dibaca, untuk ditampilkan apa adanya di UI. */
export const NAMA_SUMBER: Record<WorkoutRingkas['sumber'], string> = {
  hevy: 'Hevy',
  strava: 'Strava',
  whoop: 'WHOOP',
  healthkit: 'Apple Health',
  manual: 'Dicatat sendiri',
};

/** Workout hari ini: angkat beban + lari, sehingga terdeteksi "Beban+Lari". */
export const mockWorkoutsHariIni: WorkoutRingkas[] = [
  { id: 'w-1', nama: 'Push Day A', jenis: 'angkat_beban', sumber: 'hevy', durasi_menit: 64 },
  { id: 'w-2', nama: 'Lari sore 5K', jenis: 'lari', sumber: 'strava', durasi_menit: 28 },
];
