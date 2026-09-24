/**
 * Penjaga bab Desain PRD (docs/desain/bab-desain-prd.md, acuan resmi).
 * Memeriksa prinsip desain PRD yang mudah rusak diam-diam:
 *
 * 1. SATU ANGKA UTAMA PER LAYAR. Angka raksasa (`HeroNumber`) paling banyak
 *    satu per layar, dan layar data wajib punya satu. Komponen tidak boleh
 *    membawa angka utamanya sendiri — kalau boleh, layar yang memakainya bisa
 *    berakhir dengan dua tanpa ada yang menyadarinya.
 * 2. DUA MODE DARI SATU PALET. Warna hanya dari `src/theme`; heks mentah di
 *    layar/komponen berarti warna yang lolos dari pemeriksaan kontras
 *    (`cek:kontras`) dan tidak ikut bila palet atau skema berubah.
 *    Pengecualian dicatat di sini dengan alasannya. Skema mengikuti sistem
 *    (`userInterfaceStyle: automatic`); gelap tetap mode utama, jadi splash
 *    dan latar asli app tetap gelap. `colors` ditukar isinya saat skema
 *    berganti, sehingga nilainya tidak boleh dibekukan di konstanta tingkat
 *    modul.
 * 3. TIPOGRAFI DARI SATU SKALA (docs/desain/arah-visual.md bab 2). Ukuran huruf
 *    hanya dari `typography`; ketebalan tidak ditimpa manual setelah
 *    `...typography.x` (pakai varian bernama `labelBiasa`/`bodySedang`/
 *    `bodyTebal`); ketebalan di luar 500–800 dilarang.
 * 4. JARAK DARI SATU SKALA (bab 3). Angka mentah untuk jarak dan tinggi baris
 *    dijaga dengan PLAFON: jumlahnya boleh turun, tidak boleh naik. Plafon
 *    diturunkan setiap kali sisa-sisanya dibereskan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
/** Baris `berkas:n` yang cocok dengan pola. */
function cariBaris(berkas, pola) {
  return readFileSync(berkas, 'utf8')
    .split('\n')
    .flatMap((baris, i) => (pola.test(baris) ? [`${berkas}:${i + 1}`] : []));
}
function berkasTsx(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? berkasTsx(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

console.log('Satu angka utama per layar');
const layar = berkasTsx('app');
const hitung = (p) => (readFileSync(p, 'utf8').match(/<HeroNumber\b/g) ?? []).length;
for (const p of layar) {
  const n = hitung(p);
  if (n > 0) cek(`${p}: ${n} angka utama`, n === 1, 'lebih dari satu');
}
cek('tidak ada layar dengan lebih dari satu angka utama', layar.every((p) => hitung(p) <= 1));
// Layar data: angka yang menjawab "berapa" untuk layar itu.
const LAYAR_DATA = [
  'app/(tabs)/index.tsx', // sisa kalori hari ini
  'app/(tabs)/tren.tsx', // rata-rata 7 hari
  'app/(tabs)/budget.tsx', // sisa jatah minggu ini
  'app/ukuran.tsx', // pinggang
  'app/latihan.tsx',
  'app/sumber-data.tsx',
  'app/target-harian.tsx', // target kalori hari ini
];
for (const p of LAYAR_DATA) cek(`layar data ${p} punya angka utama`, hitung(p) === 1, `${hitung(p)} angka utama`);
const komponen = berkasTsx('src/components').filter((p) => !p.endsWith('HeroNumber.tsx'));
const komponenBerhero = komponen.filter((p) => hitung(p) > 0);
cek('komponen tidak membawa angka utama sendiri', komponenBerhero.length === 0, komponenBerhero.join(', '));

console.log('\nDua mode dari satu palet');
// Pengecualian heks mentah, masing-masing dengan alasan.
const BOLEH = [
  { pola: /'#000000AA'/, alasan: 'selubung gelap di belakang sheet (bukan warna palet, tetapi peredup)' },
  { pola: /shadowColor: '#000'/, alasan: 'warna bayangan iOS' },
  { berkas: 'src/components/PratinjauWidget.tsx', alasan: 'meniru layar kunci iOS, yang warnanya ditentukan sistem' },
];
const pelanggar = [];
for (const p of [...layar, ...berkasTsx('src/components')]) {
  if (BOLEH.some((b) => b.berkas === p)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((baris, i) => {
    const heks = baris.match(/['"]#[0-9A-Fa-f]{3,8}['"]|['"](white|black)['"]/g);
    if (!heks) return;
    if (BOLEH.some((b) => b.pola && b.pola.test(baris))) return;
    pelanggar.push(`${p}:${i + 1} ${heks.join(' ')}`);
  });
}
cek('warna layar & komponen hanya dari src/theme', pelanggar.length === 0, pelanggar.slice(0, 5).join(' | '));
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const bg = /bg: '(#[0-9A-Fa-f]{6})'/.exec(readFileSync('src/theme/colors.ts', 'utf8'))?.[1];
cek('app.json: userInterfaceStyle mengikuti sistem', app.userInterfaceStyle === 'automatic');
cek(`app.json: latar = colors.bg (${bg})`, Boolean(bg) && app.backgroundColor === bg && app.splash?.backgroundColor === bg);
const tataLetak = readFileSync('app/_layout.tsx', 'utf8');
cek(
  'status bar mengikuti skema (terang di atas gelap, gelap di atas terang)',
  /<StatusBar style=\{skema === 'gelap' \? 'light' : 'dark'\} \/>/.test(tataLetak),
);
cek('akar dibungkus PenyediaSkema', /<PenyediaSkema>/.test(tataLetak));
cek('navigator dipasang ulang saat skema berganti', /key=\{skema\}/.test(tataLetak));

// `colors.x` di luar fungsi dibaca SEKALI saat modul dimuat, lalu membeku di
// skema itu. Getter dan fungsi aman karena dibaca ulang setiap kali dipakai.
function tangkapanModul(berkas) {
  const sf = ts.createSourceFile(berkas, readFileSync(berkas, 'utf8'), ts.ScriptTarget.Latest, true);
  const hasil = [];
  (function kunjungi(n) {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'colors') {
      let p = n.parent;
      while (p && !ts.isFunctionLike(p)) p = p.parent;
      if (!p) hasil.push(`${berkas}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    }
    ts.forEachChild(n, kunjungi);
  })(sf);
  return hasil;
}
const berkasTs = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? berkasTs(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
const beku = [...berkasTs('app'), ...berkasTs('src')]
  .filter((p) => !p.startsWith(join('src', 'theme')))
  .flatMap(tangkapanModul);
// Layar & komponen memakai lapis SEMANTIK (bab Desain 8.2); nama warna mentah
// hanya boleh dibaca di src/theme.
// Daftar token usang dibaca dari tanda `@deprecated Pakai …` di colors.ts,
// jadi menandai token baru sebagai usang otomatis ikut dijaga di sini.
const USANG = new Map(
  [...readFileSync('src/theme/colors.ts', 'utf8').matchAll(/\/\*\* @deprecated Pakai (.+?)\. \*\/\n\s*(\w+):/g)].map(
    (m) => [m[2], m[1]],
  ),
);
cek(`token usang tercatat di colors.ts (${USANG.size})`, USANG.size > 0);
const NAMA_LAMA = new RegExp(`colors\\.(${[...USANG.keys()].join('|')})\\b`);
const namaLama = [...berkasTs('app'), ...berkasTs('src')]
  .filter((p) => !p.startsWith(join('src', 'theme')))
  .flatMap((p) =>
    cariBaris(p, NAMA_LAMA).map((lokasi) => {
      const [berkas, baris] = [lokasi.slice(0, lokasi.lastIndexOf(':')), Number(lokasi.slice(lokasi.lastIndexOf(':') + 1))];
      const token = NAMA_LAMA.exec(readFileSync(berkas, 'utf8').split('\n')[baris - 1])[1];
      return `${lokasi} colors.${token} → ${USANG.get(token)}`;
    }),
  );
cek('layar & komponen tidak memakai token usang', namaLama.length === 0, namaLama.slice(0, 5).join(' | '));
cek('colors tidak dibekukan di tingkat modul (pakai getter/fungsi)', beku.length === 0, beku.slice(0, 5).join(' | '));
cek('latar tiap layar dari colors.latar', /contentStyle: \{ backgroundColor: colors\.latar \}/.test(tataLetak));

console.log('\nTipografi dari satu skala');
// Ukuran huruf mentah yang sah, masing-masing dengan alasan.
const UKURAN_BOLEH = [
  { berkas: 'src/components/KartuTimbangPagi.tsx', alasan: 'angka berat yang bisa diketik: input, bukan HeroNumber' },
  { berkas: 'src/components/SheetBatasPinggang.tsx', alasan: 'angka batas yang bisa diketik: input, bukan HeroNumber' },
  { berkas: 'src/components/SheetHubungkanSumber.tsx', alasan: 'glyph centang dekoratif, disembunyikan dari pembaca layar' },
  { berkas: 'src/components/SheetImporRiwayat.tsx', alasan: 'pratinjau CSV mentah dalam Menlo (teks mesin, bukan UI)' },
];
const semuaUi = [...layar, ...berkasTsx('src/components')].filter(
  (p) => !BOLEH.some((b) => b.berkas === p),
);
const ukuranMentah = semuaUi
  .filter((p) => !UKURAN_BOLEH.some((b) => b.berkas === p))
  .flatMap((p) => cariBaris(p, /fontSize:\s*\d/));
cek('ukuran huruf hanya dari typography', ukuranMentah.length === 0, ukuranMentah.slice(0, 5).join(' | '));

// Ketebalan yang ditimpa tepat setelah gaya tipografi (satu baris maupun banyak baris).
const timpaBobot = semuaUi.flatMap((p) => {
  const isi = readFileSync(p, 'utf8');
  const hasil = [];
  const pola = /\.\.\.typography\.(\w+),\s*(?:[a-zA-Z]+: [^,{}]+,\s*)*?fontWeight: '(\d+)'/g;
  for (const m of isi.matchAll(pola)) {
    hasil.push(`${p}:${isi.slice(0, m.index).split('\n').length} ${m[1]}+${m[2]}`);
  }
  return hasil;
});
cek('ketebalan tidak ditimpa setelah typography (pakai varian bernama)', timpaBobot.length === 0, timpaBobot.slice(0, 5).join(' | '));
const bobotMentah = semuaUi.flatMap((p) => cariBaris(p, /fontWeight: '\d+'/));
cek('ketebalan span dari token bobot', bobotMentah.length === 0, bobotMentah.slice(0, 5).join(' | '));
const bobotTerlarang = semuaUi.flatMap((p) => cariBaris(p, /fontWeight: '(100|200|300|400|900)'/));
cek('ketebalan hanya 500, 600, 700, 800', bobotTerlarang.length === 0, bobotTerlarang.slice(0, 5).join(' | '));

// Tangga tipografi sendiri: setiap gaya membawa tinggi baris, tidak ada yang
// di bawah batas HIG, dan setiap gaya punya padanan iOS yang tercatat.
const tokenTeks = readFileSync('src/theme/tokens.ts', 'utf8');
const higTeks = readFileSync('src/theme/hig.ts', 'utf8');
const teksMin = Number(/TEKS_MIN = (\d+)/.exec(higTeks)?.[1]);
const gaya = [...tokenTeks.matchAll(/^  (\w+): \{ fontSize: (\d+),[^}]*\},?$/gm)].map((g) => [
  g[0], g[1], g[2], /lineHeight: (\d+)/.exec(g[0])?.[1],
]);
cek('setiap gaya tipografi membawa lineHeight ≥ fontSize', gaya.length > 0 && gaya.every((g) => g[3] && Number(g[3]) >= Number(g[2])),
  gaya.filter((g) => !g[3] || Number(g[3]) < Number(g[2])).map((g) => g[1]).join(', '));
cek(`tidak ada gaya di bawah ${teksMin}pt (HIG)`, gaya.every((g) => Number(g[2]) >= teksMin),
  gaya.filter((g) => Number(g[2]) < teksMin).map((g) => g[1]).join(', '));
const dasar = ['hero', 'display', 'title', 'body', 'label', 'caption'];
cek('setiap gaya dasar punya padanan iOS di hig.ts', dasar.every((d) => new RegExp(`\\b${d}: '`).test(higTeks)));

console.log('\nJarak dari satu skala (plafon, hanya boleh turun)');
const PLAFON = { lineHeight: 3, jarak: 0 };
const tinggiBaris = semuaUi.flatMap((p) => cariBaris(p, /lineHeight: \d/));
// Nol bukan pelanggaran skala (reset padding bawaan input).
const jarakMentah = semuaUi.flatMap((p) => cariBaris(p, /\b(gap|rowGap|columnGap|margin\w*|padding\w*): -?[1-9]/));
const radiusMentah = semuaUi.flatMap((p) => cariBaris(p, /(borderRadius|Radius): \d/));
cek('radius hanya dari token radius', radiusMentah.length === 0, radiusMentah.slice(0, 5).join(' | '));
cek(
  `lineHeight mentah ${tinggiBaris.length} ≤ ${PLAFON.lineHeight}`,
  tinggiBaris.length <= PLAFON.lineHeight,
  'tinggi baris baru harus ikut gaya tipografi',
);
cek(
  `jarak mentah ${jarakMentah.length} ≤ ${PLAFON.jarak}`,
  jarakMentah.length <= PLAFON.jarak,
  `jarak baru harus dari spacing: ${jarakMentah.slice(-3).join(' | ')}`,
);
const ikonMentah = semuaUi.flatMap((p) => cariBaris(p, /<Ionicons\b[^>]*size=\{\d+\}/));
cek('ukuran ikon dari ukuranIkon', ikonMentah.length === 0, ikonMentah.slice(0, 5).join(' | '));
const aritmetika = semuaUi.flatMap((p) => cariBaris(p, /spacing\.\w+ [+-] \d/));
cek('tidak ada aritmetika spacing (pakai token ukuran)', aritmetika.length === 0, aritmetika.slice(0, 5).join(' | '));
if (tinggiBaris.length < PLAFON.lineHeight || jarakMentah.length < PLAFON.jarak) {
  console.log('  (plafon bisa diturunkan: ubah PLAFON di scripts/cek-desain.mjs)');
}

console.log('\nArea sentuh (HIG 44×44 pt)');
// Kontrol yang tampil lebih kecil dari 44 pt memakai KONTROL_RAPAT/SEGMEN dan
// menggenapkan area sentuhnya dengan sisaSentuh(); mengurangi TAP_MIN berarti
// area sentuhnya ikut mengecil.
const tapDikurangi = semuaUi.flatMap((p) => cariBaris(p, /TAP_MIN\s*-\s*\d/));
cek('TAP_MIN tidak dikurangi (pakai KONTROL_RAPAT + sisaSentuh)', tapDikurangi.length === 0, tapDikurangi.join(' | '));
const kontrolRapat = semuaUi.flatMap((p) => {
  const isi = readFileSync(p, 'utf8');
  const nKontrol = (isi.match(/: KONTROL_(RAPAT|SEGMEN)\b/g) ?? []).length;
  const nSlop = (isi.match(/sisaSentuh\(KONTROL_(RAPAT|SEGMEN)\)/g) ?? []).length;
  return nKontrol > 0 && nSlop === 0 ? [p] : [];
});
cek('setiap kontrol rapat menggenapkan area sentuh', kontrolRapat.length === 0, kontrolRapat.join(' | '));

console.log('\nAcuan resmi');
let bab = '';
try {
  bab = readFileSync('docs/desain/bab-desain-prd.md', 'utf8');
} catch {
  // ditangani cek di bawah
}
cek('bab Desain PRD ada dan berstatus resmi', /\*\*Status\*\* \| \*\*Resmi/.test(bab));
cek('bab Desain punya riwayat versi', /## Riwayat & perubahan/.test(bab));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan desain lulus');
process.exit(gagal ? 1 : 0);
