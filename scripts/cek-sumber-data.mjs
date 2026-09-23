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

const {
  formatWaktuRelatif,
  kesehatanKoneksi,
  pesanGagalHubungkan,
  PROFIL_SUMBER,
  ringkasanKoneksi,
  samarkanKunci,
  statusSinkronApp,
  urutkanKoneksi,
  validasiKunciHevy,
  masukDariAngka,
  selisihMasuk,
} = muat();

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

console.log('\nMenghubungkan & memutuskan');
{
  const KUNCI = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  const ok = validasiKunciHevy(KUNCI);
  cek('kunci Hevy yang sah diterima', ok.ok && ok.kunci === KUNCI);
  const tempel = validasiKunciHevy(`  ${KUNCI.toUpperCase().slice(0, 18)}\n${KUNCI.toUpperCase().slice(18)} `);
  cek('spasi, baris baru, dan huruf besar dari hasil tempel dirapikan', tempel.ok && tempel.kunci === KUNCI,
    JSON.stringify(tempel));
  cek('kunci kosong ditolak dengan alasan', !validasiKunciHevy('   ').ok);
  for (const salah of ['1a2b3c4d5e6f4a7b8c9d0e1f2a3b4c5d', 'bukan-kunci', `${KUNCI}0`, KUNCI.replace('1a', 'zz')]) {
    cek(`bentuk salah ditolak: "${salah}"`, !validasiKunciHevy(salah).ok);
  }
  cek('kunci disamarkan, hanya 4 karakter terakhir terlihat',
    samarkanKunci(KUNCI) === '••••4c5d' && !samarkanKunci(KUNCI).includes('1a2b'));
  cek('kunci pendek tidak bocor utuh lewat penyamaran', samarkanKunci('abc') === '••••');

  const alasan = ['dibatalkan', 'izin-kurang', 'kunci-ditolak', 'jaringan'];
  const pesan = alasan.map((a) => pesanGagalHubungkan('strava', a));
  cek('setiap alasan gagal punya judul & keterangan sendiri',
    new Set(pesan.map((p) => p.judul)).size === alasan.length &&
      pesan.every((p) => p.judul.length > 0 && p.keterangan.length > 20));
  cek('pesan menyebut nama layanannya', pesanGagalHubungkan('whoop', 'jaringan').judul.includes('WHOOP'));
  cek('dibatalkan dinyatakan tanpa menyalahkan: "Tidak ada yang berubah"',
    /Tidak ada yang berubah/.test(pesanGagalHubungkan('strava', 'dibatalkan').keterangan));

  const jenis = Object.values(PROFIL_SUMBER).map((p) => p.otorisasi);
  cek('otorisasi: Apple Health lewat HealthKit, Hevy lewat kunci, sisanya OAuth',
    PROFIL_SUMBER.apple_health.otorisasi === 'healthkit' && PROFIL_SUMBER.hevy.otorisasi === 'kunci_api' &&
      PROFIL_SUMBER.strava.otorisasi === 'oauth' && PROFIL_SUMBER.whoop.otorisasi === 'oauth' && jenis.length === 4);
  cek('Apple Health menyatakan app hanya membaca', /hanya membaca/.test(PROFIL_SUMBER.apple_health.caraHubungkan));
}

console.log('\nIndikator sinkron app');
{
  const dasarK = { realtime: 'terhubung', sedangMenyinkron: false, tertunda: 0, terakhirMasuk: null, sumberPerluPerhatian: 0 };
  const st = (k) => statusSinkronApp({ ...dasarK, ...k }, SEKARANG);
  cek('semua baik → langsung', st({}).tingkat === 'langsung' && st({}).label === 'Langsung');
  cek('langsung menyebut kiriman terakhir', st({ terakhirMasuk: lalu(12) }).label === 'Langsung · 12 menit lalu');
  cek('sumber bermasalah → perhatian', st({ sumberPerluPerhatian: 2 }).label === '2 sumber perlu perhatian');
  cek('menyambung mendahului perhatian', st({ realtime: 'menyambung', sumberPerluPerhatian: 1 }).tingkat === 'menyambung');
  cek('menyinkron mendahului perhatian & menyambung',
    st({ sedangMenyinkron: true, realtime: 'menyambung', sumberPerluPerhatian: 1 }).tingkat === 'menyinkron');
  // Terputus menutupi SEMUANYA, termasuk "langsung · baru saja" yang basi.
  const off = st({ realtime: 'terputus', sedangMenyinkron: true, sumberPerluPerhatian: 1, terakhirMasuk: lalu(1) });
  cek('terputus mendahului semua keadaan lain', off.tingkat === 'terputus' && off.label === 'Offline');
  const offTertunda = st({ realtime: 'terputus', tertunda: 3 });
  cek('offline menyebut perubahan yang menunggu', offTertunda.label === 'Offline · 3 perubahan menunggu'
    && /dikirim saat online/.test(offTertunda.aksesLabel));
  const semua = [{}, { sumberPerluPerhatian: 1 }, { realtime: 'terputus' }, { sedangMenyinkron: true }, { realtime: 'menyambung' }];
  cek('lima keadaan menghasilkan lima tingkat, masing-masing dengan label pembaca layar',
    new Set(semua.map((k) => st(k).tingkat)).size === 5 && semua.every((k) => st(k).aksesLabel.length > 10));
}

console.log('\nData baru masuk (selisih snapshot)');
{
  const snap = (tanggal, per_sumber) => ({ tanggal, dihitung: {}, per_sumber });
  const pagi = snap('2026-09-23', { apple_health: { langkah: 3100, kalori_aktif: 200 } });
  const siang = snap('2026-09-23', { apple_health: { langkah: 4304, kalori_aktif: 200, berat: 1 }, strava: { latihan: 1 } });
  const m = selisihMasuk(pagi, siang, 'apple_health');
  cek(`Apple Health: ${m.map((x) => `${x.jumlah} ${x.label}`).join(' · ')}`,
    JSON.stringify(m) === JSON.stringify([{ label: 'langkah', jumlah: 1204 }, { label: 'berat pagi', jumlah: 1 }]));
  cek('angka yang tidak berubah tidak diumumkan', !m.some((x) => x.label === 'kcal energi aktif'));
  cek('sumber lain dihitung terpisah', JSON.stringify(selisihMasuk(pagi, siang, 'strava')) === '[{"label":"sesi latihan","jumlah":1}]');
  // Lewat tengah malam: pembandingnya nol, bukan angka kemarin.
  const kemarin = snap('2026-09-22', { apple_health: { langkah: 9800 } });
  const subuh = snap('2026-09-23', { apple_health: { langkah: 850 } });
  cek('hari baru: 850 langkah pagi ini masuk (bukan −8.950)',
    JSON.stringify(selisihMasuk(kemarin, subuh, 'apple_health')) === '[{"label":"langkah","jumlah":850}]');
  // Kontrol negatif: snapshot kemarin yang diperlakukan sebagai hari ini
  // (pemeriksaan tanggal dilewati) membuat banner pagi hilang.
  cek('kontrol: tanpa pemeriksaan tanggal, langkah pagi tidak pernah diumumkan',
    selisihMasuk({ ...kemarin, tanggal: subuh.tanggal }, subuh, 'apple_health').length === 0);
  cek('angka turun (sampel dihapus) tidak diumumkan',
    selisihMasuk(siang, snap('2026-09-23', { apple_health: { langkah: 4000 } }), 'apple_health').length === 0);
  cek('snapshot pertama (belum ada pembanding) = semua yang ada',
    selisihMasuk(null, pagi, 'apple_health').length === 2);
  cek('kartu sumber: urutan tetap, nilai bulat, nol & kosong dihilangkan',
    JSON.stringify(masukDariAngka({ tidur: 412.5, langkah: 8800, kalori_aktif: 0 }))
      === '[{"label":"langkah","jumlah":8800},{"label":"menit tidur","jumlah":413}]');
}

console.log(gagal === 0 ? '\n✓ Status sumber data: jeda dibaca per mekanisme, webhook yang diam tidak dianggap macet' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
