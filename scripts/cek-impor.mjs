/**
 * Memeriksa parser impor riwayat: CSV, ekspor Hevy, dan log ukuran lama.
 *
 * Kegagalan impor yang paling mahal adalah yang DIAM: satu bulan riwayat yang
 * hilang karena format tanggal, atau berat dalam pound yang tersimpan sebagai
 * kilogram. Keduanya baru ketahuan saat tren terlihat aneh, setelah berkas
 * aslinya lama terhapus. Jadi di sini setiap baris yang dilewati harus
 * menyebut nomor & alasannya, dan konversinya dihitung tangan.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'impor-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['impor.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { uraiCsv, uraiCsvHevy, uraiCsvUkuran, uraiTanggal, uraiWaktuHevy } = require(join(kerja, 'keluar', 'impor.js'));
const { RENTANG_UKURAN_CM } = require(join(kerja, 'keluar', 'ukuran.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('Rentang ukuran SAMA dengan CHECK di database');
{
  const sql = readFileSync('supabase/migrations/20260922002000_body_measurements.sql', 'utf8');
  for (const [bagian, { min, maks }] of Object.entries(RENTANG_UKURAN_CM)) {
    const m = new RegExp(`${bagian} between (\\d+) and (\\d+)`).exec(sql);
    cek(`${bagian}: ${min}–${maks}`, m && Number(m[1]) === min && Number(m[2]) === maks,
      m ? `SQL ${m[1]}–${m[2]}` : 'tidak ada di SQL');
  }
  cek('form catat ukuran memakai rentang yang sama (tidak menyalin angkanya)',
    readFileSync('src/components/SheetCatatUkuran.tsx', 'utf8').includes('= RENTANG_UKURAN_CM'));
}

console.log('\nCSV');
{
  cek('kolom berkutip memuat koma, kutip ganda, dan baris baru',
    sama(uraiCsv('a,b\n"x, y","say ""hi""\nlagi"\n'), [['a', 'b'], ['x, y', 'say "hi"\nlagi']]));
  cek('titik koma ditebak dari baris judul (Excel lokal Indonesia)',
    sama(uraiCsv('tanggal;pinggang\n2026-09-01;85,5\n'), [['tanggal', 'pinggang'], ['2026-09-01', '85,5']]));
  cek('BOM dibuang & CRLF diterima', sama(uraiCsv('﻿a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]));
  cek('baris kosong dibuang', sama(uraiCsv('a\n\n1\n\n'), [['a'], ['1']]));
}

console.log('\nWaktu & tanggal');
{
  cek('"22 Sep 2026, 07:12" = 07.12 WIB', uraiWaktuHevy('22 Sep 2026, 07:12') === '2026-09-22T00:12:00.000Z');
  cek('nama bulan Indonesia diterima ("5 Agu 2026, 18:30")', uraiWaktuHevy('5 Agu 2026, 18:30') === '2026-08-05T11:30:00.000Z');
  cek('ISO tanpa zona = Asia/Jakarta', uraiWaktuHevy('2026-09-22 07:12:00') === '2026-09-22T00:12:00.000Z');
  cek('ISO berzona dipakai apa adanya', uraiWaktuHevy('2026-09-22T07:12:00Z') === '2026-09-22T07:12:00.000Z');
  cek('bulan tak dikenal → null', uraiWaktuHevy('22 Xyz 2026, 07:12') === null);
  cek('tanggal ISO & DD/MM/YYYY', uraiTanggal('2026-09-01') === '2026-09-01' && uraiTanggal('1/9/2026') === '2026-09-01');
  cek('31/02 ditolak, tidak digeser ke Maret', uraiTanggal('31/02/2026') === null);
}

const HEVY = [
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
  'Push Day A,"22 Sep 2026, 07:12","22 Sep 2026, 08:16",,Bench Press (Barbell),,,0,warmup,60,10,,,',
  'Push Day A,"22 Sep 2026, 07:12","22 Sep 2026, 08:16",,Bench Press (Barbell),,,1,normal,80,8,,,',
  'Push Day A,"22 Sep 2026, 07:12","22 Sep 2026, 08:16",,Chest Dip,,,0,normal,,12,,,',
  'Push Day A,"22 Sep 2026, 07:12","22 Sep 2026, 08:16",,Treadmill,,,0,normal,,,2.5,900,',
  'Pull Day A,"20 Sep 2026, 18:00","20 Sep 2026, 18:58",,Deadlift (Barbell),,,0,normal,140,5,,,',
  'Pull Day A,"20 Sep 2026, 18:00","20 Sep 2026, 18:58",,Deadlift (Barbell),,,1,normal,150,0,,,',
  'Rusak,"kemarin sore",,,Squat,,,0,normal,100,5,,,',
].join('\n');

console.log('\nEkspor Hevy');
{
  const h = uraiCsvHevy(HEVY);
  cek('terurai tanpa galat', !h.galat, h.galat);
  cek(`2 sesi, urut dari yang terlama: ${h.sesi?.map((s) => s.nama).join(', ')}`,
    h.sesi?.length === 2 && h.sesi[0].nama === 'Pull Day A' && h.sesi[1].nama === 'Push Day A');
  const push = h.sesi[1];
  cek(`durasi dari start/end: ${push.durasi_menit} menit`, push.durasi_menit === 64);
  cek('set_index Hevy (mulai 0) menjadi set_ke mulai 1',
    sama(push.latihan[0].sets, [{ set_ke: 1, beban_kg: 60, reps: 10 }, { set_ke: 2, beban_kg: 80, reps: 8 }]));
  cek('beban kosong = berat badan (null), bukan 0 kg', push.latihan[1].sets[0].beban_kg === null);
  cek(`jumlah set: ${h.jumlahSet}`, h.jumlahSet === 4);
  cek('setiap baris yang dilewati menyebut nomor & alasannya',
    sama(h.dilewati, [
      { baris: 5, alasan: 'tanpa repetisi (kardio atau berdurasi)' },
      { baris: 7, alasan: 'repetisi tidak sah' },
      { baris: 8, alasan: 'waktu mulai tidak terbaca' },
    ]), JSON.stringify(h.dilewati));

  const lb = uraiCsvHevy(HEVY.replace('weight_kg', 'weight_lbs'));
  cek(`pound dikonversi: 80 lb = ${lb.sesi[1].latihan[0].sets[1].beban_kg} kg`,
    lb.satuanBeban === 'lb' && lb.sesi[1].latihan[0].sets[1].beban_kg === 36.29);
  // Kontrol negatif: tanpa konversi, 80 lb akan tersimpan sebagai 80 kg.
  cek('kontrol: berkas kg tidak dikonversi', h.satuanBeban === 'kg' && h.sesi[1].latihan[0].sets[1].beban_kg === 80);

  const bukan = uraiCsvHevy('tanggal,pinggang\n2026-09-01,85');
  cek('berkas lain ditolak dengan menyebut kolom yang hilang', bukan.galat?.includes('exercise_title'), bukan.galat);
  cek('berkas kosong ditolak', uraiCsvHevy('').galat === 'Berkasnya kosong.');
}

console.log('\nUkuran lama');
{
  const teks = [
    'Tanggal;Pinggang (cm);Dada;Leher;Lengan kiri;Lengan kanan;Paha kiri;Paha kanan',
    '01/08/2026;86,0;101;38,5;35;35,5;58;58',
    '08/08/2026;85,6;;;;;;',
    '15/08/2026;850;101;38;;;;', // salah ketik: seluruh baris ditolak
    '22/08/2026;;;;;;;', // tidak ada ukuran
    'kemarin;85;;;;;;',
    '08/08/2026;85,4;;;;;;', // tanggal ganda: baris ini yang dipakai
    '01/12/2026;84;;;;;;', // masa depan
  ].join('\n');
  const u = uraiCsvUkuran(teks, '2026-09-23');
  cek('terurai tanpa galat', !u.galat, u.galat);
  cek(`2 tanggal terimpor: ${u.baris?.map((b) => b.tanggal).join(', ')}`,
    u.baris?.length === 2 && u.baris[0].tanggal === '2026-08-01' && u.baris[1].tanggal === '2026-08-08');
  cek('desimal koma terbaca & kolom kosong dibiarkan kosong',
    sama(u.baris[0], { tanggal: '2026-08-01', pinggang_cm: 86, dada_cm: 101, leher_cm: 38.5, lengan_kiri_cm: 35,
      lengan_kanan_cm: 35.5, paha_kiri_cm: 58, paha_kanan_cm: 58 }), JSON.stringify(u.baris[0]));
  cek('tanggal ganda: baris terakhir yang dipakai', u.baris[1].pinggang_cm === 85.4);
  cek('setiap baris yang dilewati menyebut nomor & alasannya',
    sama(u.dilewati, [
      { baris: 3, alasan: 'tanggal ganda; baris 7 yang dipakai' },
      { baris: 4, alasan: 'pinggang 850 di luar 50–160 cm' },
      { baris: 5, alasan: 'tidak ada satu pun ukuran' },
      { baris: 6, alasan: 'tanggal tidak terbaca' },
      { baris: 8, alasan: 'tanggal di masa depan' },
    ]), JSON.stringify(u.dilewati));
  cek('berkas tanpa kolom tanggal ditolak', uraiCsvUkuran('pinggang\n85', '2026-09-23').galat === 'Kolom tanggal tidak ada.');
  cek('judul Inggris dikenali (date, waist)',
    uraiCsvUkuran('date,waist\n2026-09-01,85.5', '2026-09-23').baris?.[0]?.pinggang_cm === 85.5);
}

console.log(gagal === 0 ? '\n✓ Impor riwayat: tidak ada baris yang hilang diam-diam, satuan & tanggal dibaca benar' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
