/**
 * Memeriksa pemilih fase: aturan riwayat (`terapkanGantiFase`) untuk kasus
 * yang tidak dijangkau uji paritas SQL, dan nada kalimat sheet konfirmasi.
 * Paritas penuh dengan `ganti_fase` dijaga `npm run cek:paritas`.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const kerja = mkdtempSync(join(tmpdir(), 'fase-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['periodeFase.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { terapkanGantiFase, periodeBerjalan, jangkarKoridor } = require(join(kerja, 'keluar', 'periodeFase.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Aturan riwayat');
const awal = [
  { fase: 'Maintenance', mulai: '2026-08-02', selesai: '2026-09-08', beratAwalKg: 74.2 },
  { fase: 'Lean Gain', mulai: '2026-09-09', selesai: null, beratAwalKg: 74.0 },
];
const salinan = JSON.stringify(awal);

const tutup = terapkanGantiFase(awal, 'Cut', '2026-09-23', 74.4);
cek('fase lain hari ini → periode berjalan ditutup kemarin', tutup.jenis === 'ditutup' && tutup.ditutup.selesai === '2026-09-22');
cek('periode baru mulai hari ini dengan jangkar rata-rata 7 hari',
  tutup.jenis === 'ditutup' && tutup.baru.mulai === '2026-09-23' && tutup.baru.beratAwalKg === 74.4 && tutup.baru.selesai === null);
cek('tepat satu periode berjalan setelahnya', tutup.riwayat.filter((p) => p.selesai === null).length === 1);
cek('riwayat asal tidak diubah (tanpa mutasi)', JSON.stringify(awal) === salinan);
cek('periode yang sudah selesai tidak disentuh', JSON.stringify(tutup.riwayat[0]) === JSON.stringify(awal[0]));

const lagi = terapkanGantiFase(tutup.riwayat, 'Maintenance', '2026-09-23', 74.4);
cek('ganti lagi di hari yang sama → diganti, bukan periode nol hari', lagi.jenis === 'diganti' && lagi.riwayat.length === 3 && periodeBerjalan(lagi.riwayat).fase === 'Maintenance');
cek('yang diganti adalah periode hari ini', lagi.jenis === 'diganti' && lagi.diganti.fase === 'Cut');
cek('fase yang sama → tetap', terapkanGantiFase(awal, 'Lean Gain', '2026-09-23', 74).jenis === 'tetap');
const tabrak = terapkanGantiFase(awal, 'Cut', '2026-09-08', 74);
cek('tanggal di periode yang sudah selesai → ditolak', tabrak.jenis === 'ditolak');
cek('pesan penolakan netral', tabrak.jenis === 'ditolak' && pelanggaranNada(tabrak.alasan).length === 0);
const pertama = terapkanGantiFase([], 'Cut', '2026-09-23', null);
cek('tanpa riwayat → periode pertama', pertama.jenis === 'ditutup' && pertama.ditutup === null && pertama.riwayat.length === 1);
cek('tanpa jangkar (belum timbang) tetap bisa', pertama.jenis === 'ditutup' && pertama.baru.beratAwalKg === null);

console.log('\nJangkar koridor');
const timbangan = [
  { tanggal: '2026-09-20', berat_pagi_kg: 74.4 },
  { tanggal: '2026-09-24', berat_pagi_kg: 74.9 },
  { tanggal: '2026-09-25', berat_pagi_kg: 75.1 },
];
const j1 = jangkarKoridor(tutup.riwayat, timbangan);
cek('jangkar = periode berjalan & berat awalnya', j1 && j1.tanggal === '2026-09-23' && j1.beratKg === 74.4);
const tanpaBerat = terapkanGantiFase(awal, 'Cut', '2026-09-23', null);
const j2 = jangkarKoridor(tanpaBerat.riwayat, timbangan);
cek('tanpa berat awal → timbangan pertama SEJAK fase dimulai (bukan sebelumnya)', j2 && j2.beratKg === 74.9);
const j3 = jangkarKoridor(tanpaBerat.riwayat, timbangan.slice(0, 1));
cek('belum ada timbangan di fase ini → berat null, tanggal tetap', j3 && j3.tanggal === '2026-09-23' && j3.beratKg === null);
cek('tanpa periode berjalan → null', jangkarKoridor([], timbangan) === null);

console.log('\nNada sheet konfirmasi');
const sumber = ts.createSourceFile('s.tsx', readFileSync('src/components/SheetGantiFase.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const kalimat = [];
(function jelajah(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
    const t = n.text.replace(/\s+/g, ' ').trim();
    if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
  }
  ts.forEachChild(n, jelajah);
})(sumber);
cek('sheet punya kalimat untuk diperiksa', kalimat.length >= 10, `hanya ${kalimat.length}`);
for (const t of kalimat) cek(`netral: "${t.length > 70 ? `${t.slice(0, 67)}...` : t}"`, pelanggaranNada(t).length === 0, pelanggaranNada(t).join(', '));

console.log('\nTiruan sejalan');
const mock = readFileSync('src/mocks/pengaturan.ts', 'utf8');
const profil = readFileSync('src/mocks/dailyLog.ts', 'utf8');
const berjalan = mock.match(/\{ fase: '([^']+)', mulai: '[^']+', selesai: null/);
const aktif = profil.match(/fase_aktif: '([^']+)'/);
cek('periode berjalan tiruan = fase aktif profil tiruan', berjalan && aktif && berjalan[1] === aktif[1], `${berjalan?.[1]} vs ${aktif?.[1]}`);

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan fase lulus');
process.exit(gagal ? 1 : 0);
