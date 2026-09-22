import type { DayType, WorkoutRingkas } from './tipe';

export type HasilDeteksi = {
  /** Tipe hari yang ditebak; `null` bila tidak ada tipe hari yang cocok. */
  dayTypeId: string | null;
  /** Nama tipe hari hasil deteksi, untuk ditampilkan. */
  nama: string | null;
  /** Workout yang mendasari tebakan — kosong berarti hari istirahat. */
  dasar: WorkoutRingkas[];
};

/**
 * Tebak tipe hari dari workout yang tercatat.
 *
 * Aturannya sengaja sederhana dan eksplisit supaya hasilnya bisa dijelaskan ke
 * pengguna (dan nanti ke AI coach) alih-alih terasa ajaib:
 *   1. ada angkat beban DAN lari  → "Beban+Lari"
 *   2. ada angkat beban saja      → "Angkat Beban"
 *   3. ada padel                  → "Padel"
 *   4. tidak ada apa-apa          → "Rest"
 *
 * Hasilnya SELALU boleh ditimpa manual oleh pengguna; fungsi ini hanya menebak.
 */
export function deteksiTipeHari(
  workouts: WorkoutRingkas[],
  dayTypes: DayType[],
): HasilDeteksi {
  const cari = (nama: string) => dayTypes.find((d) => d.nama === nama) ?? null;
  const hasil = (nama: string, dasar: WorkoutRingkas[]): HasilDeteksi => {
    const dt = cari(nama);
    return { dayTypeId: dt?.id ?? null, nama: dt?.nama ?? null, dasar };
  };

  // Hanya tipe hari yang mengizinkan auto-deteksi yang boleh jadi hasil tebakan.
  const bolehAuto = dayTypes.filter((d) => d.auto_detect);

  const beban = workouts.filter((w) => w.jenis === 'angkat_beban');
  const lari = workouts.filter((w) => w.jenis === 'lari');
  const padel = workouts.filter((w) => w.jenis === 'padel');

  const namaBoleh = new Set(bolehAuto.map((d) => d.nama));

  if (beban.length > 0 && lari.length > 0 && namaBoleh.has('Beban+Lari')) {
    return hasil('Beban+Lari', [...beban, ...lari]);
  }
  if (beban.length > 0 && namaBoleh.has('Angkat Beban')) {
    return hasil('Angkat Beban', beban);
  }
  if (padel.length > 0 && namaBoleh.has('Padel')) {
    return hasil('Padel', padel);
  }
  return hasil('Rest', []);
}

/** Kalimat penjelas hasil deteksi, mis. "Push Day A (Hevy) · Lari sore 5K (Strava)". */
export function alasanDeteksi(
  hasil: HasilDeteksi,
  namaSumber: Record<WorkoutRingkas['sumber'], string>,
): string {
  if (hasil.dasar.length === 0) return 'Belum ada workout tercatat hari ini';
  return hasil.dasar.map((w) => `${w.nama} (${namaSumber[w.sumber]})`).join(' · ');
}
