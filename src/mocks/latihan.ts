import type { SesiLatihan, SetLatihan } from '@recomp/logika';

/**
 * Sesi latihan tiruan dari Hevy (Fase 3, sisi frontend).
 *
 * Waktunya RELATIF terhadap `sekarang` supaya pengelompokan "Hari ini" /
 * "Kemarin" dan hitungan "pekan ini" tetap masuk akal kapan pun dibuka.
 * Isinya sengaja memuat kasus tepi yang harus terlihat benar:
 *   • set > 12 repetisi (lateral raise, calf raise) — tanpa e1RM;
 *   • latihan berat badan (pull-up, dip) — tertulis "BB", tanpa e1RM & volume;
 *   • set satu repetisi (deadlift 160 × 1) — e1RM = bebannya sendiri;
 *   • set yang tidak seragam dan yang seragam ("3 × 8 · 50 kg").
 * Task backend menukar ini dengan `workouts` + `workout_sets`.
 */
export function mockSesiLatihan(sekarang: Date = new Date()): SesiLatihan[] {
  const lalu = (jam: number) => new Date(sekarang.getTime() - jam * 3_600_000).toISOString();
  const sama = (n: number, beban: number | null, reps: number): SetLatihan[] =>
    Array.from({ length: n }, (_, i) => ({ set_ke: i + 1, beban_kg: beban, reps }));
  const daftar = (...s: [number | null, number][]): SetLatihan[] =>
    s.map(([beban_kg, reps], i) => ({ set_ke: i + 1, beban_kg, reps }));

  return [
    {
      id: 'hevy-5',
      mulai: lalu(3),
      nama: 'Push Day A',
      durasi_menit: 64,
      latihan: [
        { latihan: 'Bench Press (Barbell)', sets: daftar([60, 10], [80, 8], [82.5, 7], [82.5, 6]) },
        { latihan: 'Overhead Press (Barbell)', sets: sama(3, 50, 8) },
        { latihan: 'Incline Bench Press (Dumbbell)', sets: sama(3, 28, 10) },
        { latihan: 'Lateral Raise (Dumbbell)', sets: sama(3, 10, 15) },
        { latihan: 'Triceps Pushdown (Cable)', sets: daftar([30, 12], [32.5, 10], [32.5, 9]) },
        { latihan: 'Chest Dip', sets: daftar([null, 12], [null, 10]) },
      ],
    },
    {
      id: 'hevy-4',
      mulai: lalu(2 * 24 + 1),
      nama: 'Pull Day A',
      durasi_menit: 58,
      latihan: [
        { latihan: 'Deadlift (Barbell)', sets: daftar([140, 5], [150, 3], [160, 1]) },
        { latihan: 'Pull Up', sets: sama(3, null, 8) },
        { latihan: 'Bent Over Row (Barbell)', sets: sama(3, 70, 8) },
        { latihan: 'Face Pull (Cable)', sets: sama(3, 20, 15) },
        { latihan: 'Bicep Curl (Dumbbell)', sets: daftar([14, 10], [14, 9], [12, 11]) },
      ],
    },
    {
      id: 'hevy-3',
      mulai: lalu(4 * 24 + 2),
      nama: 'Leg Day',
      durasi_menit: 71,
      latihan: [
        { latihan: 'Squat (Barbell)', sets: sama(5, 100, 5) },
        { latihan: 'Romanian Deadlift (Barbell)', sets: sama(3, 90, 8) },
        { latihan: 'Leg Press', sets: daftar([160, 12], [180, 10], [180, 10]) },
        { latihan: 'Standing Calf Raise', sets: sama(4, 60, 15) },
      ],
    },
    {
      id: 'hevy-2',
      mulai: lalu(7 * 24 + 1),
      nama: 'Push Day B',
      durasi_menit: 55,
      latihan: [
        { latihan: 'Overhead Press (Barbell)', sets: daftar([45, 10], [50, 8], [52.5, 6]) },
        { latihan: 'Bench Press (Dumbbell)', sets: sama(3, 32, 10) },
        { latihan: 'Lateral Raise (Cable)', sets: sama(3, 7.5, 15) },
        { latihan: 'Skull Crusher (Barbell)', sets: sama(3, 30, 10) },
        // Diulang di Push Day A dengan beban lebih berat: bahan "arah kekuatan".
        { latihan: 'Triceps Pushdown (Cable)', sets: sama(3, 30, 10) },
      ],
    },
    {
      id: 'hevy-1',
      mulai: lalu(9 * 24 + 3),
      nama: 'Pull Day B',
      durasi_menit: 50,
      latihan: [
        { latihan: 'Lat Pulldown (Cable)', sets: sama(3, 65, 10) },
        { latihan: 'Seated Cable Row', sets: sama(3, 60, 10) },
        { latihan: 'Hammer Curl (Dumbbell)', sets: sama(3, 16, 10) },
      ],
    },
  ];
}
