/**
 * Memeriksa aturan status sumber data tanpa perangkat dan tanpa backend.
 *
 * Yang paling mudah rusak diam-diam: jeda waktu yang artinya berbeda per
 * mekanisme. HealthKit & cron yang diam terlalu lama memang macet; webhook yang
 * diam bisa berarti pengguna sedang istirahat. Kalau webhook ikut ditandai
 * "terlambat", halaman ini akan selalu kuning dan pengguna belajar
 * mengabaikannya — jadi kontrol negatif itu diuji di sini.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function muat() {
  const kerja = mkdtempSync(join(tmpdir(), 'sumberdata-'));
  for (const berkas of readdirSync('packages/logika/src')) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['sumberData.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'sumberData.js'));
}

const { formatWaktuRelatif, kesehatanKoneksi, ringkasanKoneksi, urutkanKoneksi } = muat();

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

// Rabu 23 September 2026, 09.00 WIB.
const SEKARANG = new Date('2026-09-23T02:00:00Z');
const lalu = (menit, dari = SEKARANG) => new Date(dari.getTime() - menit * 60_000).toISOString();

console.log('Waktu relatif');
{
  const kasus = [
    [lalu(0.5), 'baru saja'],
    [lalu(12), '12 menit lalu'],
    [lalu(200), '3 jam lalu'],
    [lalu(26 * 60), 'kemarin'],
    [lalu(50 * 60), '2 hari lalu'],
    [lalu(8 * 24 * 60), 'Selasa, 15 September'],
  ];
  for (const [iso, harap] of kasus) {
    const hasil = formatWaktuRelatif(iso, SEKARANG);
    cek(`${iso} → "${harap}"`, hasil === harap, `hasil "${hasil}"`);
  }
  // Kalender Asia/Jakarta, bukan kelipatan 24 jam: 00.30 WIB dikurangi 25 jam
  // jatuh pada pukul 23.30 DUA hari kalender sebelumnya.
  const tengahMalam = new Date('2026-09-22T17:30:00Z'); // 23 Sep 00.30 WIB
  const h = formatWaktuRelatif(lalu(25 * 60, tengahMalam), tengahMalam);
  cek('25 jam lewat tengah malam dihitung per kalender Jakarta ("2 hari lalu")', h === '2 hari lalu', h);
}

const dasar = {
  terhubungPada: lalu(60 * 24 * 30),
  galatTerakhir: null,
  masukHariIni: [],
};

console.log('\nKesehatan per mekanisme');
{
  const t = (k) => kesehatanKoneksi({ ...dasar, ...k }, SEKARANG).tingkat;
  cek('belum dihubungkan', t({ sumber: 'strava', status: 'belum', terhubungPada: null, sinkronTerakhir: null }) === 'belum');
  cek('terputus → bermasalah', t({ sumber: 'strava', status: 'terputus', sinkronTerakhir: lalu(60) }) === 'bermasalah');
  cek('galat pada koneksi terhubung → bermasalah',
    t({ sumber: 'hevy', status: 'terhubung', sinkronTerakhir: lalu(10), galatTerakhir: 'Token kedaluwarsa' }) === 'bermasalah');
  cek('baru terhubung tanpa data → menunggu, bukan terlambat',
    t({ sumber: 'apple_health', status: 'terhubung', sinkronTerakhir: null }) === 'menunggu');
  cek('HealthKit 23 jam → sehat', t({ sumber: 'apple_health', status: 'terhubung', sinkronTerakhir: lalu(23 * 60) }) === 'sehat');
  cek('HealthKit 25 jam → terlambat', t({ sumber: 'apple_health', status: 'terhubung', sinkronTerakhir: lalu(25 * 60) }) === 'terlambat');
  cek('Hevy 2 jam 59 menit → sehat', t({ sumber: 'hevy', status: 'terhubung', sinkronTerakhir: lalu(179) }) === 'sehat');
  cek('Hevy 3 jam 1 menit → terlambat', t({ sumber: 'hevy', status: 'terhubung', sinkronTerakhir: lalu(181) }) === 'terlambat');
  // Kontrol negatif utama.
  cek('Strava (webhook) 10 hari tanpa kiriman → TETAP sehat',
    t({ sumber: 'strava', status: 'terhubung', sinkronTerakhir: lalu(10 * 24 * 60) }) === 'sehat');
  cek('WHOOP (webhook) 10 hari tanpa kiriman → TETAP sehat',
    t({ sumber: 'whoop', status: 'terhubung', sinkronTerakhir: lalu(10 * 24 * 60) }) === 'sehat');

  const k = kesehatanKoneksi({ ...dasar, sumber: 'strava', status: 'terputus', sinkronTerakhir: null,
    galatTerakhir: 'Izin dicabut dari akun Strava.' }, SEKARANG);
  cek('galat dari layanan ditampilkan apa adanya', k.keterangan === 'Izin dicabut dari akun Strava.');
  const hk = kesehatanKoneksi({ ...dasar, sumber: 'apple_health', status: 'terhubung',
    sinkronTerakhir: lalu(30 * 60) }, SEKARANG);
  cek('HealthKit terlambat menyarankan tindakan yang bisa dilakukan', /Buka app/.test(hk.keterangan), hk.keterangan);
  const belum = kesehatanKoneksi({ ...dasar, sumber: 'hevy', status: 'belum', terhubungPada: null,
    sinkronTerakhir: null }, SEKARANG);
  cek('belum dihubungkan menyebut apa yang akan dibawa', /latihan/.test(belum.keterangan), belum.keterangan);
}

console.log('\nUrutan & angka utama');
{
  const daftar = [
    { ...dasar, sumber: 'apple_health', status: 'terhubung', sinkronTerakhir: lalu(12) },
    { ...dasar, sumber: 'whoop', status: 'belum', terhubungPada: null, sinkronTerakhir: null },
    { ...dasar, sumber: 'strava', status: 'terputus', sinkronTerakhir: lalu(3000) },
    { ...dasar, sumber: 'hevy', status: 'terhubung', sinkronTerakhir: lalu(300) },
  ];
  const urut = urutkanKoneksi(daftar, SEKARANG).map((k) => k.sumber);
  cek(`yang butuh tindakan di atas, belum dihubungkan paling bawah: ${urut.join(' → ')}`,
    urut.join(',') === 'strava,hevy,apple_health,whoop');
  const semuaSehat = daftar.map((k) => ({ ...k, status: 'terhubung', galatTerakhir: null, sinkronTerakhir: lalu(5) }));
  cek('dalam tingkat yang sama, urutan bawaan dipertahankan',
    urutkanKoneksi([...semuaSehat].reverse(), SEKARANG).map((k) => k.sumber).join(',') ===
      'apple_health,whoop,strava,hevy');
  const r = ringkasanKoneksi(daftar, SEKARANG);
  cek(`ringkasan: ${JSON.stringify(r)}`, r.aktif === 1 && r.perluPerhatian === 2 && r.belum === 1 && r.total === 4);
}

console.log(gagal === 0 ? '\n✓ Status sumber data: jeda dibaca per mekanisme, webhook yang diam tidak dianggap macet' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
