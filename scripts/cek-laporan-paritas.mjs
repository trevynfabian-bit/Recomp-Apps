/**
 * Memeriksa format laporan paritas dalam bahasa awam (`@recomp/logika`
 * `paritas.ts`): kalimat selisih menyebut kasus, nilai app, nilai server, dan
 * bedanya; angka bergaya Indonesia (koma desimal, minus "−"); tanpa istilah
 * teknis (SQL, TypeScript, null, …); nada netral. Halaman Laporan paritas
 * memakai penyusun kalimat yang sama.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'laporan-paritas-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['paritas.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { kalimatSelisihParitas, kalimatPasanganParitas, ringkasLaporanParitas } = require(join(kerja, 'keluar', 'paritas.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Kalimat selisih');
const KASUS = [
  [{ kasus: 'Kamis, 2 hari tersisa', kolom: 'sisa/hari', ts: 413, sql: 412, satuan: 'kcal' },
    'Saat Kamis, 2 hari tersisa (sisa/hari): app menghitung 413 kcal, server 412 kcal (server 1 kcal lebih kecil).'],
  [{ kasus: 'turun persis 0,2 kg', kolom: 'Δ 7 hari', ts: -0.2, sql: -0.19, satuan: 'kg', desimal: 2 },
    'Saat turun persis 0,2 kg (Δ 7 hari): app menghitung −0,20 kg, server −0,19 kg (server 0,01 kg lebih besar).'],
  [{ kasus: 'Sabtu', kolom: 'sisa/hari', ts: -1238, sql: -1237, satuan: 'kcal' },
    'Saat Sabtu (sisa/hari): app menghitung −1.238 kcal, server −1.237 kcal (server 1 kcal lebih besar).'],
  [{ kasus: 'turun persis 0,2 kg', kolom: 'arah', ts: 'turun', sql: 'stabil' },
    'Saat turun persis 0,2 kg (arah): app membaca “turun”, server “stabil”.'],
  [{ kasus: 'data 4 hari', kolom: 'arah', ts: 'belum cukup', sql: null },
    'Saat data 4 hari (arah): hanya app yang memberi hasil, “belum cukup”.'],
];
for (const [s, harap] of KASUS) {
  const k = kalimatSelisihParitas(s);
  cek(JSON.stringify(harap), k === harap, `dapat ${JSON.stringify(k)}`);
}

console.log('\nKalimat aturan & ringkasan');
const sama = { id: 'a', area: 'Skema data', aturan: 'Target yang berlaku', ts: 'x', sql: 'y', kasus: 1200, keadaan: 'sama' };
const beda = { ...sama, id: 'b', aturan: 'Budget mingguan', kasus: 12, keadaan: 'beda', selisih: [KASUS[0][0], KASUS[2][0]] };
cek('aturan sama', kalimatPasanganParitas(sama) === 'Target yang berlaku: app dan server menghitung sama pada 1.200 kasus.', kalimatPasanganParitas(sama));
cek('aturan berbeda', kalimatPasanganParitas(beda) === 'Budget mingguan: 2 nilai berbeda dari 12 kasus.', kalimatPasanganParitas(beda));
const belum = ringkasLaporanParitas({ dijalankanPada: null, commit: null, pasangan: [] });
cek('belum dijalankan: menyebut perintahnya', belum.judul === 'Belum ada laporan' && belum.kalimat.includes('npm run cek:paritas-semua'));
const semuaSama = ringkasLaporanParitas({ dijalankanPada: '2026-09-24T06:40:00Z', commit: 'a', pasangan: [sama, { ...sama, id: 'c', kasus: 34 }] });
cek('semua sama', semuaSama.kalimat === '2 aturan dihitung sama di app dan server pada 1.234 kasus uji.', semuaSama.kalimat);
const adaBeda = ringkasLaporanParitas({ dijalankanPada: '2026-09-24T06:40:00Z', commit: 'a', pasangan: [sama, beda] });
cek('ada yang berbeda: jumlah & akibatnya bagi pengguna', adaBeda.judul === '1 aturan berbeda' && /widget atau jawaban coach/.test(adaBeda.kalimat), adaBeda.kalimat);

console.log('\nBahasa awam & nada');
const semuaKalimat = [
  ...KASUS.map(([s]) => kalimatSelisihParitas(s)),
  kalimatPasanganParitas(sama), kalimatPasanganParitas(beda),
  ...[semuaSama, adaBeda].flatMap((r) => [r.judul, r.kalimat]),
];
const ISTILAH = /\b(sql|ts|typescript|javascript|null|undefined|numeric|rpc|query|fungsi)\b/i;
for (const k of semuaKalimat) {
  cek(`tanpa istilah teknis: ${k.slice(0, 60)}`, !ISTILAH.test(k), k.match(ISTILAH)?.[0]);
  const nada = pelanggaranNada(k);
  cek(`nada netral: ${k.slice(0, 60)}`, nada.length === 0, nada.join(', '));
}

console.log('\nHalaman memakai penyusun kalimat yang sama');
const halaman = readFileSync('app/paritas.tsx', 'utf8');
cek('Laporan paritas memakai ringkasLaporanParitas & kalimatSelisihParitas',
  halaman.includes('ringkasLaporanParitas(') && halaman.includes('kalimatSelisihParitas('));

console.log('\nParitas tersambung ke alur rilis');
{
  const rilis = readFileSync('scripts/cek-rilis.mjs', 'utf8');
  const alur = readFileSync('.github/workflows/cek-rilis.yml', 'utf8');
  const paket = JSON.parse(readFileSync('package.json', 'utf8'));
  cek('cek:rilis menjalankan cek:paritas-semua (tanpa --cepat)',
    /'cek:paritas-semua'/.test(rilis) && !/--cepat/.test(rilis.replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));
  cek('cek:rilis menolak pohon kerja yang belum di-commit', /status', '--porcelain'/.test(rilis) && /pohon kerja bersih/.test(rilis));
  cek('npm run cek:rilis terdaftar', paket.scripts['cek:rilis'] === 'node scripts/cek-rilis.mjs');
  cek('workflow menjalankan cek:rilis di pull request & tag rilis, dengan Postgres 16 & Deno',
    /pull_request:/.test(alur) && /tags: \['v\*'\]/.test(alur) && /npm run cek:rilis/.test(alur) &&
    /postgresql-16/.test(alur) && /setup-deno/.test(alur));
}

console.log(gagal === 0 ? '\n✓ Laporan paritas terbaca dalam bahasa awam' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
