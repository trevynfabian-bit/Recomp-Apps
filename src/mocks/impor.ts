/**
 * Contoh berkas & pengimpor tiruan untuk alur impor riwayat (Fase 3, sisi
 * frontend).
 *
 * Contohnya sengaja memuat baris yang AKAN dilewati (kardio tanpa repetisi,
 * tanggal ganda, salah ketik 850 cm) — pratinjau yang hanya pernah dilihat
 * dengan berkas bersih tidak pernah diuji pada keadaan yang paling butuh
 * penjelasan. Task backend menukar `mockJalankanImpor` dengan `import_jobs`
 * dan pemilih berkas di perangkat; parsernya tetap sama.
 */

export const CONTOH_CSV_HEVY = [
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
  'Push Day A,"8 Sep 2026, 07:05","8 Sep 2026, 08:09",,Bench Press (Barbell),,,0,normal,77.5,8,,,',
  'Push Day A,"8 Sep 2026, 07:05","8 Sep 2026, 08:09",,Bench Press (Barbell),,,1,normal,77.5,8,,,',
  'Push Day A,"8 Sep 2026, 07:05","8 Sep 2026, 08:09",,Overhead Press (Barbell),,,0,normal,47.5,8,,,',
  'Push Day A,"8 Sep 2026, 07:05","8 Sep 2026, 08:09",,Treadmill,,,0,normal,,,2.0,720,',
  'Pull Day A,"10 Sep 2026, 18:10","10 Sep 2026, 19:05",,Deadlift (Barbell),,,0,normal,135,5,,,',
  'Pull Day A,"10 Sep 2026, 18:10","10 Sep 2026, 19:05",,Pull Up,,,0,normal,,8,,,',
  'Leg Day,"12 Sep 2026, 07:30","12 Sep 2026, 08:40",,Squat (Barbell),,,0,normal,95,5,,,',
  'Leg Day,"12 Sep 2026, 07:30","12 Sep 2026, 08:40",,Squat (Barbell),,,1,normal,95,5,,,',
].join('\n');

export const CONTOH_CSV_UKURAN = [
  'Tanggal;Pinggang;Dada;Leher;Lengan kiri;Lengan kanan;Paha kiri;Paha kanan',
  '04/08/2026;86,4;100;38,5;34,5;35;57,5;58',
  '11/08/2026;86,1;;;;;;',
  '18/08/2026;850;100,5;38;;;;',
  '25/08/2026;85,8;101;38,5;35;35,5;58;58',
  '25/08/2026;85,7;;;;;;',
].join('\n');

/** Rentang riwayat Apple Health yang bisa dipilih. */
export const RENTANG_APPLE_HEALTH = [
  { kunci: '90', label: '90 hari', hari: 90 },
  { kunci: '365', label: '1 tahun', hari: 365 },
  { kunci: 'semua', label: 'Semua', hari: null },
] as const;

/** Perkiraan hasil impor Apple Health tiruan untuk satu rentang. */
export function mockHasilAppleHealth(hari: number | null): { label: string; jumlah: number }[] {
  const n = hari ?? 730;
  return [
    { label: 'timbangan', jumlah: Math.round(n * 0.82) },
    { label: 'hari langkah', jumlah: n },
    { label: 'malam tidur', jumlah: Math.round(n * 0.9) },
  ];
}

/**
 * Jalankan impor tiruan: melapor kemajuan beberapa kali lalu selesai. Kemajuan
 * dilaporkan sebagai jumlah baris, bukan persen — "120 dari 312" memberi tahu
 * lebih banyak daripada "38%".
 */
export function mockJalankanImpor(
  total: number,
  onKemajuan: (selesai: number) => void,
): Promise<void> {
  const langkah = 6;
  return new Promise((selesai) => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      onKemajuan(Math.min(total, Math.round((total * i) / langkah)));
      if (i >= langkah) {
        clearInterval(id);
        selesai();
      }
    }, 250);
  });
}
