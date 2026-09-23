/**
 * Memeriksa masuk akun: validasi email, pemetaan galat Supabase Auth ke pesan,
 * nada pesan, dan bahwa SETIAP layar app terlindung sesi.
 *
 * Yang terakhir paling mudah rusak diam-diam: expo-router mendaftarkan layar
 * yang tidak disebut di tata letak secara otomatis, di LUAR `Stack.Protected`.
 * Layar baru yang lupa didaftarkan bisa dibuka lewat tautan dalam oleh orang
 * yang sudah keluar — tanpa ada yang terlihat rusak.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'akun-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['akun.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { emailSah, kodeGagalMasuk, PESAN_GAGAL_MASUK } = require(join(kerja, 'keluar', 'akun.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Validasi email');
for (const e of ['trevyn@contoh.id', ' nama.panjang+tag@sub.domain.co.id ', 'a@b.io']) cek(`sah: "${e}"`, emailSah(e));
for (const e of ['', 'trevyn', 'trevyn@', '@contoh.id', 'tre vyn@contoh.id', 'trevyn@contoh', 'trevyn@contoh.i', 'a@@b.io'])
  cek(`tidak sah: "${e}"`, !emailSah(e));

console.log('\nGalat Supabase Auth → pesan');
const kasus = [
  [{ code: 'invalid_credentials', status: 400 }, 'kredensial'],
  [{ code: 'user_not_found', status: 400 }, 'kredensial'],
  [{ code: 'email_not_confirmed', status: 400 }, 'belum-dikonfirmasi'],
  [{ code: 'over_request_rate_limit', status: 429 }, 'dibatasi'],
  [{ code: 'over_email_send_rate_limit' }, 'dibatasi'],
  [{ status: 429 }, 'dibatasi'],
  [{ status: 0, message: 'Failed to fetch' }, 'jaringan'],
  [{ message: 'Network request failed' }, 'jaringan'],
  [{ code: 'unexpected_failure', status: 500 }, 'lain'],
  [null, 'lain'],
];
for (const [g, harap] of kasus) {
  const hasil = kodeGagalMasuk(g);
  cek(`${JSON.stringify(g)} → ${harap}`, hasil === harap, `dapat ${hasil}`);
}
// Tidak membocorkan keberadaan akun: email tak terdaftar & sandi salah SAMA.
cek('email tak terdaftar dijawab sama dengan kata sandi salah',
  PESAN_GAGAL_MASUK[kodeGagalMasuk({ code: 'user_not_found' })] === PESAN_GAGAL_MASUK[kodeGagalMasuk({ code: 'invalid_credentials' })]);

console.log('\nNada pesan');
for (const [kode, pesan] of Object.entries(PESAN_GAGAL_MASUK)) {
  const p = pelanggaranNada(pesan);
  cek(`${kode} netral`, p.length === 0, `melanggar: ${p.join(', ')}`);
}
// Kalimat yang ditulis langsung di layar masuk (bukan dari katalog): semua
// literal string & teks JSX, dibaca lewat parser TypeScript, bukan regex.
const ts = require('typescript');
const sumber = ts.createSourceFile('masuk.tsx', readFileSync('app/masuk.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const kalimat = [];
(function jelajah(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) {
    const t = n.text.replace(/\s+/g, ' ').trim();
    // Kalimat untuk manusia: ada spasi & huruf (bukan nama ikon, warna, atau kunci).
    if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
  }
  ts.forEachChild(n, jelajah);
})(sumber);
cek('layar masuk punya kalimat untuk diperiksa', kalimat.length >= 8, `hanya ${kalimat.length}`);
for (const t of kalimat) {
  const p = pelanggaranNada(t);
  cek(`netral: "${t.length > 70 ? `${t.slice(0, 67)}...` : t}"`, p.length === 0, `melanggar: ${p.join(', ')}`);
}

console.log('\nPerlindungan sesi');
const tataLetak = readFileSync('app/_layout.tsx', 'utf8');
const blok = (guard) => {
  const m = tataLetak.match(new RegExp(`<Stack\\.Protected guard=\\{${guard}\\}>([\\s\\S]*?)</Stack\\.Protected>`));
  return m ? [...m[1].matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((x) => x[1]) : null;
};
const terlindung = blok('sudahMasuk');
const tamu = blok('!sudahMasuk');
cek('blok layar app ditemukan', terlindung !== null);
cek('blok layar tamu ditemukan', tamu !== null);
const layarApp = readdirSync('app', { withFileTypes: true })
  .map((d) => (d.isDirectory() ? d.name : d.name.replace(/\.tsx$/, '')))
  .filter((n) => !n.startsWith('_') && !n.startsWith('+'));
for (const n of layarApp) {
  if (n === 'masuk') {
    cek('layar masuk hanya untuk yang keluar', (tamu ?? []).includes('masuk') && !(terlindung ?? []).includes('masuk'));
  } else {
    cek(`"${n}" terlindung sesi`, (terlindung ?? []).includes(n), 'tambahkan <Stack.Screen> di blok guard={sudahMasuk}');
  }
}
cek('tamu hanya melihat layar masuk', JSON.stringify(tamu) === '["masuk"]', `tamu = ${JSON.stringify(tamu)}`);
// Kiriman Realtime tidak boleh muncul di atas layar masuk.
cek('banner data masuk hanya saat masuk', /\{sudahMasuk \? <BannerDataMasuk \/> : null\}/.test(tataLetak));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan akun lulus');
process.exit(gagal ? 1 : 0);
