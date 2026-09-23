/**
 * Memeriksa ekspor data: CSV yang benar menurut RFC 4180, formula spreadsheet
 * yang tidak ikut tereksekusi, JSON yang utuh, ZIP yang bisa dibuka lagi, dan
 * kalimat pemberitahuan yang netral tanpa angka.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { zipSync, unzipSync, strToU8 } = require('fflate');
const kerja = mkdtempSync(join(tmpdir(), 'ekspor-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['ekspor.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { selCsv, csvDariTabel, susunBerkasEkspor, namaBerkasEkspor, ringkasIsiEkspor, formatUkuranBerkas, NOTIF_EKSPOR_SIAP } =
  require(join(kerja, 'keluar', 'ekspor.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

/** Pengurai CSV RFC 4180 minimal, untuk membuktikan keluaran bisa dibaca kembali. */
function uraiCsv(teks) {
  const t = teks.replace(/^﻿/, '');
  const baris = [];
  let sel = '', b = [], kutip = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (kutip) {
      if (c === '"' && t[i + 1] === '"') { sel += '"'; i += 1; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ',') { b.push(sel); sel = ''; }
    else if (c === '\r' && t[i + 1] === '\n') { b.push(sel); baris.push(b); b = []; sel = ''; i += 1; }
    else sel += c;
  }
  return baris;
}

console.log('Sel CSV');
const kasus = [
  [null, ''], [72.5, '72.5'], [-0.5, '-0.5'], [0, '0'], [true, 'true'], [Number.NaN, ''],
  ['Oat + whey', 'Oat + whey'],
  ['Ayam, nasi', '"Ayam, nasi"'],
  ['Kata "enak"', '"Kata ""enak"""'],
  ['baris\nbaru', '"baris\nbaru"'],
  [' spasi', '" spasi"'],
  ['=HYPERLINK("http://x","klik")', `"'=HYPERLINK(""http://x"",""klik"")"`],
  ['+62812', "'+62812"],
  ['-5 kg', "'-5 kg"],
  ['@SUM(A1)', "'@SUM(A1)"],
  ['\t=1', "'\t=1"],
];
for (const [masuk, harap] of kasus) cek(`${JSON.stringify(masuk)} → ${JSON.stringify(harap)}`, selCsv(masuk) === harap, `dapat ${JSON.stringify(selCsv(masuk))}`);

console.log('\nTabel & berkas');
const tabel = [
  { nama: 'makanan', label: 'entri makanan', kolom: ['tanggal', 'nama_makanan', 'kalori_kcal'],
    baris: [['2026-09-22', 'Ayam bakar, nasi "merah"', 760], ['2026-09-22', '=1+1', 120], ['2026-09-22', 'Telur\n3 butir', null]] },
  { nama: 'hasil_lab', label: 'hasil lab', kolom: ['tanggal', 'nama', 'jumlah_penanda'], baris: [['2026-09-03', 'Profil lipid', 4]] },
];
const csv = csvDariTabel(tabel[0]);
cek('diawali BOM, baris CRLF', csv.startsWith('﻿tanggal,nama_makanan,kalori_kcal\r\n') && csv.endsWith('\r\n'));
const terurai = uraiCsv(csv);
cek('terbaca kembali: 1 kepala + 3 baris', terurai.length === 4, `dapat ${terurai.length}`);
cek('koma & kutip utuh', terurai[1][1] === 'Ayam bakar, nasi "merah"');
cek('baris baru di dalam sel utuh', terurai[3][1] === 'Telur\n3 butir');
cek('formula jadi teks (awalan apostrof)', terurai[2][1] === "'=1+1");
cek('null → sel kosong', terurai[3][2] === '');

const dibuatPada = '2026-09-23T06:00:00.000Z';
const berkas = susunBerkasEkspor(tabel, { dibuatPada, email: 'trevyn@contoh.id' });
cek('satu CSV per tabel + semua.json + BACA-SAYA.txt',
  JSON.stringify(berkas.map((b) => b.nama)) === JSON.stringify(['makanan.csv', 'hasil_lab.csv', 'semua.json', 'BACA-SAYA.txt']));
const json = JSON.parse(berkas.find((b) => b.nama === 'semua.json').isi);
cek('JSON: versi, waktu, akun', json.versi_format === 1 && json.dibuat_pada === dibuatPada && json.akun === 'trevyn@contoh.id');
cek('JSON: baris sebagai objek berkunci kolom', json.tabel.makanan.length === 3 && json.tabel.makanan[0].kalori_kcal === 760
  && json.tabel.makanan[2].kalori_kcal === null && json.tabel.makanan[1].nama_makanan === '=1+1');
const baca = berkas.find((b) => b.nama === 'BACA-SAYA.txt').isi;
cek('BACA-SAYA menyebut tiap berkas & jumlah barisnya', baca.includes('makanan.csv: entri makanan (3 baris)') && baca.includes('hasil_lab.csv: hasil lab (1 baris)'));
cek('BACA-SAYA menjelaskan awalan apostrof', baca.includes("diberi awalan '"));
cek('ringkasan isi = jumlah baris', JSON.stringify(ringkasIsiEkspor(tabel)) === JSON.stringify([{ label: 'entri makanan', jumlah: 3 }, { label: 'hasil lab', jumlah: 1 }]));
cek('nama berkas bertanggal', namaBerkasEkspor('2026-09-23') === 'recomp-ekspor-2026-09-23.zip');

console.log('\nZIP');
const zip = zipSync(Object.fromEntries(berkas.map((b) => [b.nama, strToU8(b.isi)])), { level: 6 });
const buka = unzipSync(zip);
// Dibandingkan per BYTE: pengurai teks fflate membuang BOM saat mengubah balik ke string.
cek('ZIP terbuka lagi dengan isi yang sama (per byte, BOM ikut)',
  berkas.every((b) => buka[b.nama] && Buffer.from(buka[b.nama]).equals(Buffer.from(strToU8(b.isi)))));
cek('BOM benar-benar ada di CSV dalam ZIP', Buffer.from(buka['makanan.csv']).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])));
const lib = readFileSync('src/lib/berkas.ts', 'utf8');
cek('lib/berkas memakai pemanggilan zip yang sama', /zipSync\(Object\.fromEntries\(berkas\.map\(\(b\) => \[b\.nama, strToU8\(b\.isi\)\]\)\), \{ level: 6 \}\)/.test(lib));
cek('salinan sementara dihapus setelah dibagikan (finally)', /finally \{\s*if \(berkas\.exists\) berkas\.delete\(\);/.test(lib));

console.log('\nUkuran berkas');
for (const [b, harap] of [[0, '1 KB'], [1500, '2 KB'], [1024 * 1024, '1 MB'], [2.4 * 1024 * 1024, '2,4 MB']])
  cek(`${b} byte → ${harap}`, formatUkuranBerkas(b) === harap, `dapat ${formatUkuranBerkas(b)}`);

console.log('\nPemberitahuan');
cek('notifikasi netral', pelanggaranNada(`${NOTIF_EKSPOR_SIAP.judul} ${NOTIF_EKSPOR_SIAP.isi}`).length === 0);
cek('notifikasi tanpa angka (layar kunci)', !/\d/.test(NOTIF_EKSPOR_SIAP.judul + NOTIF_EKSPOR_SIAP.isi));
cek('panjang muat banner (judul ≤ 40, isi ≤ 150)', NOTIF_EKSPOR_SIAP.judul.length <= 40 && NOTIF_EKSPOR_SIAP.isi.length <= 150);
const kalimat = [];
for (const berkasSumber of ['src/components/SheetEksporData.tsx', 'src/components/BannerEksporSiap.tsx']) {
  const src = ts.createSourceFile('x.tsx', readFileSync(berkasSumber, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  (function jelajah(n) {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
    }
    ts.forEachChild(n, jelajah);
  })(src);
}
const bermasalah = kalimat.filter((t) => pelanggaranNada(t).length > 0);
cek(`${kalimat.length} kalimat sheet & banner netral`, kalimat.length >= 10 && bermasalah.length === 0, bermasalah.join(' | '));
const notif = readFileSync('src/lib/notifikasi.ts', 'utf8');
const fnKirim = notif.slice(notif.indexOf('export async function kirimNotifikasiSekarang'));
cek('notifikasi seketika hanya bila izin sudah diberikan (tidak meminta izin)',
  fnKirim.includes("(await izinNotifikasi()) !== 'diizinkan'") && !fnKirim.includes('mintaIzinNotifikasi'));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan ekspor lulus');
process.exit(gagal ? 1 : 0);
