/**
 * Memeriksa halaman Privasi: kalimat yang mengikuti keadaan, nada, dan —
 * yang terpenting — bahwa PERNYATAANNYA masih benar tentang kode.
 *
 * Halaman privasi yang kalimatnya tidak lagi sesuai kenyataan lebih buruk
 * daripada tidak ada halaman. Jadi setiap klaim yang bisa diperiksa dari
 * repositori diperiksa di sini, dan pemeriksaan ini gagal saat kodenya
 * berubah tanpa kalimatnya ikut berubah:
 *   • "tanpa iklan atau pelacak analitik" → tidak ada SDK semacam itu;
 *   • "hanya membaca Apple Health" → tidak ada izin tulis HealthKit;
 *   • "kunci akses tidak terbaca app" → tabel rahasia dicabut dari klien;
 *   • "obat/dosis dijawab di perangkat tanpa dikirim" → pemeriksaan batas
 *     medis terjadi SEBELUM panggilan jaringan;
 *   • "foto tidak disimpan" → entri dari foto menyimpan foto_url null.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const kerja = mkdtempSync(join(tmpdir(), 'privasi-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['privasi.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { susunStatusPrivasi, DATA_TERSIMPAN } = require(join(kerja, 'keluar', 'privasi.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
const butir = (m, k) => susunStatusPrivasi(m).find((b) => b.kunci === k);
const dasar = { email: 'trevyn@contoh.id', sumberTerhubung: ['Apple Health', 'Strava', 'Hevy'], widgetTampilkanAngka: true, fotoMakananDisimpan: false };

console.log('Kalimat mengikuti keadaan');
const semua = susunStatusPrivasi(dasar);
cek('delapan butir, kunci unik', semua.length === 8 && new Set(semua.map((b) => b.kunci)).size === 8);
cek('setiap butir punya status berupa kata', semua.every((b) => b.status.trim().length > 0 && b.judul && b.penjelasan));
cek('email akun yang masuk disebut', butir(dasar, 'sesi').status === 'trevyn@contoh.id');
cek('tidak masuk → "Tidak masuk"', butir({ ...dasar, email: null }, 'sesi').status === 'Tidak masuk');
cek('tiga sumber: jumlah & daftar', butir(dasar, 'sumber').status === '3 tersambung, hanya membaca'
  && butir(dasar, 'sumber').penjelasan.startsWith('Apple Health, Strava dan Hevy.'));
cek('satu sumber: "sumber ini"', /dari sumber ini/.test(butir({ ...dasar, sumberTerhubung: ['WHOOP'] }, 'sumber').penjelasan));
cek('tanpa sumber: belum ada', butir({ ...dasar, sumberTerhubung: [] }, 'sumber').status === 'Belum ada yang tersambung');
const widgetAngka = butir(dasar, 'layar-kunci');
cek('widget berangka → disebut terlihat tanpa membuka kunci', widgetAngka.nada === 'terlihat' && /tanpa membuka kunci/.test(widgetAngka.penjelasan));
const widgetPolos = butir({ ...dasar, widgetTampilkanAngka: false }, 'layar-kunci');
cek('widget tanpa angka → Tanpa angka', widgetPolos.status === 'Tanpa angka' && widgetPolos.nada === 'terjaga');
cek('foto tidak disimpan → dikatakan', butir(dasar, 'foto').status === 'Tidak disimpan');
cek('foto disimpan → dikatakan', butir({ ...dasar, fotoMakananDisimpan: true }, 'foto').status === 'Disimpan di akun Anda');

console.log('\nNada');
const kalimat = [
  ...[dasar, { ...dasar, email: null, sumberTerhubung: [], widgetTampilkanAngka: false, fotoMakananDisimpan: true }]
    .flatMap((m) => susunStatusPrivasi(m).flatMap((b) => [b.judul, b.status, b.penjelasan])),
  ...DATA_TERSIMPAN.flatMap((d) => [d.judul, d.isi]),
];
const sumber = ts.createSourceFile('p.tsx', readFileSync('app/privasi.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
(function jelajah(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) {
    const t = n.text.replace(/\s+/g, ' ').trim();
    if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
  }
  ts.forEachChild(n, jelajah);
})(sumber);
const bermasalah = [...new Set(kalimat)].filter((t) => pelanggaranNada(t).length > 0);
cek(`${new Set(kalimat).size} kalimat netral`, bermasalah.length === 0, bermasalah.join(' | '));

console.log('\nPernyataan masih benar tentang kode');
const paket = JSON.parse(readFileSync('package.json', 'utf8'));
const dep = Object.keys({ ...paket.dependencies, ...paket.devDependencies });
const pelacak = dep.filter((d) => /analytic|segment|sentry|firebase|amplitude|mixpanel|admob|ads\b|tracking|posthog|bugsnag|datadog|appsflyer|branch/i.test(d));
cek('tanpa SDK iklan/pelacak analitik', pelacak.length === 0, pelacak.join(', '));
const appJson = readFileSync('app.json', 'utf8');
cek('tanpa izin TULIS Apple Health (NSHealthUpdateUsageDescription)', !/NSHealthUpdateUsageDescription|healthkit.*write/i.test(appJson));
const migrasiKoneksi = readFileSync('supabase/migrations/20260922003400_koneksi_sumber_data.sql', 'utf8');
cek('rahasia sumber dicabut dari authenticated & anon',
  /revoke all on public\.health_connection_secrets from authenticated/.test(migrasiKoneksi)
  && /revoke all on public\.health_connection_secrets from anon/.test(migrasiKoneksi)
  && !/grant [a-z, ]+ on public\.health_connection_secrets to (authenticated|anon)/.test(migrasiKoneksi));
const coach = readFileSync('src/data/coach.ts', 'utf8');
const fnTanya = coach.slice(coach.indexOf('export async function tanyakanKeCoach'));
cek('batas medis diperiksa sebelum panggilan jaringan',
  fnTanya.indexOf('periksaPertanyaan(') >= 0 && fnTanya.indexOf('periksaPertanyaan(') < fnTanya.indexOf("functions.invoke('coach-chat'"));
const fotoDisimpan = /mockFotoMakananDisimpan = (true|false)/.exec(readFileSync('src/mocks/privasi.ts', 'utf8'))?.[1];
const catatFoto = readFileSync('src/components/SheetCatatFoto.tsx', 'utf8');
cek(`foto disimpan = ${fotoDisimpan} sejalan dengan entri dari foto`,
  fotoDisimpan === 'false' ? /foto_url: null/.test(catatFoto) : !/foto_url: null/.test(catatFoto));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan privasi lulus');
process.exit(gagal ? 1 : 0);
