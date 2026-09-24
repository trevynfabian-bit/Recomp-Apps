/**
 * Memeriksa normalisasi Strava, WHOOP & Hevy dan tanda tangan WHOOP.
 *
 * Yang paling mudah salah diam-diam di sini bukan kodenya, melainkan
 * SATUAN dan WAKTU: energi WHOOP dalam kilojoule, recovery yang harus jatuh
 * di hari bangun, dan waktu Strava yang harus tetap UTC (tanggal WIB-nya
 * diturunkan database — konversi ganda di sini akan menggeser hari). Setiap
 * aturan diuji dengan angka hitungan tangan dan kontrol negatif.
 *
 * Tanda tangan WHOOP diuji terhadap HMAC yang dihitung node:crypto secara
 * terpisah, bukan terhadap dirinya sendiri.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'webhook-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
// Modul Edge dengan penentu impor Deno ditulis ulang ke paket yang terpasang.
writeFileSync(
  join(kerja, 'sumberLuar.ts'),
  readFileSync('supabase/functions/_shared/sumberLuar.ts', 'utf8').replace(/npm:@supabase\/supabase-js@\d+/, '@supabase/supabase-js'),
);
writeFileSync(join(kerja, 'deno.d.ts'), 'declare namespace Deno { const env: { get(n: string): string | undefined }; }\n');
symlinkSync(join(process.cwd(), 'node_modules'), join(kerja, 'node_modules'));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['sinkronLuar.ts', 'sumberLuar.ts', 'impor.ts', 'deno.d.ts', '--module', 'commonjs', '--target', 'es2022',
   '--lib', 'es2022,dom', '--outDir', join(kerja, 'keluar'), '--skipLibCheck', '--strict'],
  { cwd: kerja, stdio: 'pipe' });
const L = require(join(kerja, 'keluar', 'sinkronLuar.js'));
const S = require(join(kerja, 'keluar', 'sumberLuar.js'));
const I = require(join(kerja, 'keluar', 'impor.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Strava');
{
  const lari = L.kirimanAktivitasStrava({
    id: 1360128428, name: 'Morning Run', sport_type: 'Run',
    start_date: '2026-09-15T22:30:00Z', elapsed_time: 3000, moving_time: 2880, calories: 411.6,
  });
  const w = lari.latihan[0];
  cek('lari → jenis "lari", id sebagai teks', w.jenis === 'lari' && w.id === '1360128428');
  cek('waktu mulai tetap UTC apa adanya (tanggal WIB diturunkan database)', w.mulai === '2026-09-15T22:30:00Z');
  cek(`durasi dari waktu bergerak: ${w.durasi_menit} menit`, w.durasi_menit === 48);
  const e = lari.data[0];
  cek(`energi ${e.nilai} kcal, selesai = mulai + waktu total`,
    e.jenis === 'kalori_aktif' && e.nilai === 412 && e.selesai === '2026-09-15T23:20:00.000Z');
  cek('aktivitas tanpa kalori → tanpa data energi',
    L.kirimanAktivitasStrava({ id: 1, name: 'x', sport_type: 'Run', start_date: '2026-09-15T00:00:00Z', elapsed_time: 60 }).data.length === 0);
  cek('sport_type → jenis olahraga',
    L.jenisOlahragaStrava('TrailRun') === 'lari' && L.jenisOlahragaStrava('WeightTraining') === 'angkat_beban'
      && L.jenisOlahragaStrava('Padel') === 'padel' && L.jenisOlahragaStrava('Ride') === 'lainnya'
      && L.jenisOlahragaStrava(undefined) === 'lainnya');
  cek('`type` lama dipakai bila `sport_type` tidak ada',
    L.kirimanAktivitasStrava({ id: 2, name: 'x', type: 'Run', start_date: '2026-09-15T00:00:00Z', elapsed_time: 60 }).latihan[0].jenis === 'lari');
  const h = L.kirimanHapusStrava(1360128428);
  cek('hapus aktivitas: latihan + energinya', h.hapus_latihan[0] === '1360128428' && h.hapus_data[0].jenis === 'kalori_aktif');
}

console.log('\nWHOOP');
{
  // 2.092 kJ = 500 kcal. Kontrol negatif: menyimpan kJ apa adanya = 4,184× lipat.
  const w = L.kirimanWorkoutWhoop({
    id: 'wk-1', start: '2026-09-16T10:00:00Z', end: '2026-09-16T11:30:00Z', sport_name: 'Weightlifting',
    score_state: 'SCORED', score: { kilojoule: 2092, strain: 12.1 },
  });
  cek(`energi workout: 2.092 kJ → ${w.data[0].nilai} kcal`, w.data[0].nilai === 500);
  cek('kontrol: kJ yang tidak dikonversi berbeda jauh dari kcal', 2092 / w.data[0].nilai > 4);
  cek('latihan angkat beban 90 menit', w.latihan[0].jenis === 'angkat_beban' && w.latihan[0].durasi_menit === 90);
  const belum = L.kirimanWorkoutWhoop({ id: 'wk-2', start: '2026-09-16T10:00:00Z', end: '2026-09-16T10:30:00Z',
    sport_name: 'running', score_state: 'PENDING_SCORE', score: null });
  cek('workout belum dinilai: latihannya masuk, energinya menunggu', belum.latihan.length === 1 && belum.data.length === 0);
  cek('nama olahraga WHOOP dinormalisasi', L.jenisOlahragaWhoop('Functional-Fitness') === 'lainnya'
    && L.jenisOlahragaWhoop('running') === 'lari' && L.jenisOlahragaWhoop('Padel') === 'padel');

  const tidur = {
    id: 'sl-1', cycle_id: 93845, start: '2026-09-15T15:40:00Z', end: '2026-09-15T23:05:00Z', nap: false,
    score_state: 'SCORED', score: { stage_summary: {
      total_in_bed_time_milli: 26_700_000, total_awake_time_milli: 1_980_000,
      total_light_sleep_time_milli: 12_600_000, total_slow_wave_sleep_time_milli: 5_400_000,
      total_rem_sleep_time_milli: 6_720_000,
    } },
  };
  const t = L.kirimanTidurWhoop(tidur);
  // (12.600.000 + 5.400.000 + 6.720.000) ms = 24.720.000 ms = 412 menit; di ranjang 445 menit.
  cek(`tidur = ringan + dalam + REM = ${t.data[0].nilai} menit, bukan waktu di ranjang (445)`, t.data[0].nilai === 412);
  cek('tidur belum dinilai → tanpa data', Object.keys(L.kirimanTidurWhoop({ ...tidur, score_state: 'PENDING_SCORE' })).length === 0);

  const r = L.kirimanRecoveryWhoop(
    { cycle_id: 93845, sleep_id: 'sl-1', score_state: 'SCORED',
      score: { recovery_score: 68, resting_heart_rate: 51, hrv_rmssd_milli: 72.44 } },
    tidur,
  );
  cek('recovery: tiga angka dengan id tidur', r.data.length === 3 && r.data.every((d) => d.id === 'sl-1'));
  cek('waktu recovery = waktu BANGUN (hari recovery-nya)', r.data.every((d) => d.mulai === tidur.end));
  cek('kontrol: waktu mulai tidur ada di hari sebelumnya (WIB 22.40 tgl 15)', tidur.start < tidur.end && tidur.start.startsWith('2026-09-15T15'));
  cek('HRV satu desimal', r.data.find((d) => d.jenis === 'hrv').nilai === 72.4);
  const hr = L.kirimanHapusRecoveryWhoop('sl-1');
  cek('hapus recovery TIDAK menyebut tidur', hr.hapus_data.every((d) => d.jenis !== 'tidur') && hr.hapus_data.length === 3);
}

console.log('\nHevy (API)');
{
  const w = {
    id: 'hv-1', title: 'Push Day A', start_time: '2026-09-15T23:10:00Z', end_time: '2026-09-16T00:12:00Z',
    updated_at: '2026-09-16T00:15:00Z',
    exercises: [
      // Sengaja tidak berurutan: urutan dari `index`, bukan dari posisi di array.
      { index: 1, title: 'Pull Up', sets: [{ index: 0, type: 'normal', weight_kg: 0, reps: 8 }] },
      { index: 0, title: 'Bench Press (Barbell)', sets: [
        { index: 1, type: 'normal', weight_kg: 80, reps: 6 },
        { index: 0, type: 'warmup', weight_kg: 40, reps: 10 },
        { index: 2, type: 'failure', weight_kg: 80, reps: 5 },
      ] },
      { index: 2, title: 'Treadmill', sets: [{ index: 0, type: 'normal', weight_kg: null, reps: null, distance_meters: 1000, duration_seconds: 360 }] },
    ],
  };
  const s = L.sesiDariWorkoutHevy(w);
  cek('urutan latihan & set dari index', s.latihan.map((l) => l.latihan).join('|') === 'Bench Press (Barbell)|Pull Up'
    && s.latihan[0].sets.map((x) => x.set_ke).join(',') === '1,2,3');
  cek('beban 0 kg = berat badan (null)', s.latihan[1].sets[0].beban_kg === null);
  cek('set tanpa repetisi (treadmill) tidak masuk set', !s.latihan.some((l) => l.latihan === 'Treadmill'));
  cek('jenis set dibawa (pemanasan dikenali)', s.latihan[0].sets[0].jenis === 'warmup' && s.latihan[0].sets[2].jenis === 'failure');
  cek(`durasi ${s.durasi_menit} menit, jenis ${s.jenis}`, s.durasi_menit === 62 && s.jenis === 'angkat_beban');
  cek('waktu mulai tetap UTC (tanggal WIB diturunkan database)', s.mulai === '2026-09-15T23:10:00Z');
  const kardio = L.sesiDariWorkoutHevy({ ...w, id: 'hv-k', exercises: [w.exercises[2]] });
  cek('sesi Hevy hanya kardio → bukan hari angkat beban', kardio.jenis === 'lainnya' && kardio.latihan.length === 0);

  // Batas database per set: set di luar batas dilewati SENDIRIAN, sesinya tetap masuk.
  const luar = L.sesiDariWorkoutHevy({ ...w, id: 'hv-luar', exercises: [{ ...w.exercises[0], sets: [
    { index: 0, type: 'normal', weight_kg: 80, reps: 8 },
    { index: 1, type: 'normal', weight_kg: 700, reps: 1 },
    { index: 2, type: 'normal', weight_kg: 20, reps: 250 },
  ] }] });
  cek('set > 600 kg & > 200 repetisi dilewati, set sah tetap', luar.latihan[0]?.sets.map((x) => x.set_ke).join(',') === '1', JSON.stringify(luar.latihan));
  cek('sesi dengan set di luar batas tetap hari angkat beban', luar.jenis === 'angkat_beban');

  // Aturan SAMA dengan impor CSV: sesi yang sama lewat dua jalur → set yang sama.
  const csv = [
    'title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps',
    'Push Day A,2026-09-16 06:10,2026-09-16 07:12,Bench Press (Barbell),0,warmup,40,10',
    'Push Day A,2026-09-16 06:10,2026-09-16 07:12,Bench Press (Barbell),1,normal,80,6',
    'Push Day A,2026-09-16 06:10,2026-09-16 07:12,Bench Press (Barbell),2,failure,80,5',
    'Push Day A,2026-09-16 06:10,2026-09-16 07:12,Pull Up,0,normal,0,8',
  ].join('\n');
  const dariCsv = I.uraiCsvHevy(csv).sesi[0];
  const tanpaJenis = (x) => x.latihan.map((l) => ({ latihan: l.latihan, sets: l.sets.map(({ set_ke, beban_kg, reps }) => ({ set_ke, beban_kg, reps })) }));
  cek('API & impor CSV menghasilkan set yang sama untuk sesi yang sama',
    JSON.stringify(tanpaJenis(s)) === JSON.stringify(tanpaJenis(dariCsv)) && dariCsv.mulai === new Date(s.mulai).toISOString()
      && dariCsv.durasi_menit === s.durasi_menit,
    `${JSON.stringify(tanpaJenis(s))} vs ${JSON.stringify(tanpaJenis(dariCsv))}`);

  // Peristiwa ganda untuk satu workout: yang TERAKHIR menang, apa pun urutannya.
  const ubah = { type: 'updated', workout: w };
  const hapus = { type: 'deleted', id: 'hv-1', deleted_at: '2026-09-16T08:00:00Z' };
  const a = L.kirimanHevy([hapus, ubah]);
  cek('diubah lalu dihapus (urutan terbalik di halaman) → dihapus', a.hapus.join() === 'hv-1' && a.sesi.length === 0);
  const b = L.kirimanHevy([{ ...hapus, deleted_at: '2026-09-15T20:00:00Z' }, ubah]);
  cek('dihapus lalu dibuat ulang → ada', b.sesi.length === 1 && b.hapus.length === 0);
  cek(`kursor berikutnya = mulai tarik − ${L.JEDA_KURSOR_HEVY_MS / 60_000} menit`,
    L.kursorHevyBerikut(new Date('2026-09-16T10:00:00Z')) === '2026-09-16T09:55:00.000Z');
}

console.log('\nTanda tangan WHOOP');
{
  const rahasia = 'uji-rahasia-klien';
  const badan = '{"user_id":10129,"id":"wk-1","type":"workout.updated","trace_id":"t"}';
  const sekarang = 1_790_000_000_000;
  const cap = String(sekarang - 10_000);
  // Dihitung TERPISAH lewat node:crypto — bukan lewat fungsi yang diuji.
  const tanda = createHmac('sha256', rahasia).update(cap + badan).digest('base64');

  cek('tanda tangan asli diterima', await S.tandaTanganWhoopSah(badan, cap, tanda, rahasia, sekarang));
  cek('badan diubah satu karakter → ditolak',
    !(await S.tandaTanganWhoopSah(badan.replace('10129', '10128'), cap, tanda, rahasia, sekarang)));
  cek('rahasia lain → ditolak', !(await S.tandaTanganWhoopSah(badan, cap, tanda, 'rahasia-lain', sekarang)));
  cek('cap waktu diganti (tanda lama dipakai ulang) → ditolak',
    !(await S.tandaTanganWhoopSah(badan, String(sekarang - 5_000), tanda, rahasia, sekarang)));
  const capTua = String(sekarang - S.BATAS_UMUR_TANDA_WHOOP_MS - 1);
  const tandaTua = createHmac('sha256', rahasia).update(capTua + badan).digest('base64');
  cek('tanda tangan sah tapi lebih tua dari 5 menit → ditolak',
    !(await S.tandaTanganWhoopSah(badan, capTua, tandaTua, rahasia, sekarang)));
  cek('tanpa header → ditolak', !(await S.tandaTanganWhoopSah(badan, null, null, rahasia, sekarang)));
  cek('rahasia kosong di server → selalu ditolak', !(await S.tandaTanganWhoopSah(badan, cap, tanda, '', sekarang)));
  cek('perbandingan waktu-tetap: sama/beda', (await S.samaWaktuTetap('abc', 'abc')) && !(await S.samaWaktuTetap('abc', 'abd')));
}

console.log('\nWebhook & cron memakai normalisasi & pembuktian yang sama');
{
  const hevy = readFileSync('supabase/functions/sinkron-hevy/index.ts', 'utf8');
  cek('Hevy: kursor hanya maju lewat terima_sesi_hevy (satu transaksi dengan sesinya)',
    hevy.includes('p_kursor: kursorHevyBerikut(mulai)') && !/update\(\{[^}]*kursor_sinkron/.test(hevy));
  cek('Hevy: semua halaman ditarik sebelum apa pun ditulis',
    hevy.indexOf('await tarikPeristiwa(') < hevy.indexOf("db.rpc('terima_sesi_hevy'"));
  cek('Hevy: pintu cron dijaga rahasia jadwal', hevy.includes("req.headers.get('x-jadwal-rahasia')"));
  const strava = readFileSync('supabase/functions/webhook-strava/index.ts', 'utf8');
  const whoop = readFileSync('supabase/functions/webhook-whoop/index.ts', 'utf8');
  cek('Strava: hapus hanya setelah API menjawab 404 (aktivitas === null)',
    /aktivitas === null\)[\s\S]*kirimanHapusStrava/.test(strava) && /aspect_type === 'delete'[\s\S]*diabaikan/.test(strava));
  cek('Strava: id langganan diperiksa sebelum peristiwa diproses',
    strava.indexOf('STRAVA_SUBSCRIPTION_ID') < strava.indexOf('jalankanDiLatar('));
  cek('WHOOP: tanda tangan diperiksa atas badan MENTAH sebelum JSON diurai',
    whoop.indexOf('tandaTanganWhoopSah(') < whoop.indexOf('JSON.parse(badanMentah)') && whoop.includes('await req.text()'));
  cek('kedua webhook menjawab dulu, bekerja di latar',
    [strava, whoop].every((f) => /jalankanDiLatar\([^;]*;\s*return jawab\(\{ diterima: true \}\)/.test(f)));
  cek('tidak ada konversi tanggal di webhook (database yang menurunkan WIB)',
    ![strava, whoop].some((f) => /Asia\/Jakarta|toLocaleDateString|en-CA/.test(f)));
}

console.log(gagal === 0 ? '\n✓ Webhook: satuan, waktu, dan tanda tangan benar' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
