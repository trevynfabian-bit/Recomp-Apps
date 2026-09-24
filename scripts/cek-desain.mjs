/**
 * Penjaga bab Desain PRD (docs/desain/bab-desain-prd.md, acuan resmi).
 * Memeriksa PRINSIP desain yang mudah rusak diam-diam. Nilai yang ditulis
 * langsung di layar (warna, jarak, radius, huruf, ikon) diperiksa terpisah
 * oleh `cek:hardcode` (scripts/cek-hardcode.mjs).
 *
 * 1. SATU ANGKA UTAMA PER LAYAR. Angka raksasa (`HeroNumber`) paling banyak
 *    satu per layar, dan layar data wajib punya satu. Komponen tidak boleh
 *    membawa angka utamanya sendiri — kalau boleh, layar yang memakainya bisa
 *    berakhir dengan dua tanpa ada yang menyadarinya.
 * 2. DUA MODE DARI SATU PALET. Skema mengikuti sistem
 *    (`userInterfaceStyle: automatic`); gelap tetap mode utama, jadi splash
 *    dan latar asli app tetap gelap. `colors` ditukar isinya saat skema
 *    berganti, sehingga nilainya tidak boleh dibekukan di konstanta tingkat
 *    modul, dan token yang sedang dipensiunkan tidak boleh dipakai.
 * 3. TIPOGRAFI DARI SATU SKALA (bab 8.4). Ketebalan tidak ditimpa manual
 *    setelah `...typography.x` (pakai varian bernama); setiap gaya membawa
 *    tinggi baris, tidak ada yang di bawah 11 pt, dan punya padanan iOS.
 * 4. AREA SENTUH 44 PT (bab 8.5). Kontrol yang tampil lebih kecil menggenapkan
 *    area sentuhnya dengan `sisaSentuh()`.
 * 5. ACUAN RESMI. Bab Desain ada, berstatus resmi, dan punya riwayat versi.
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
// `KartuHero` membungkus tepat satu `HeroNumber`, jadi dihitung sebagai satu angka utama.
const hitung = (p) => (readFileSync(p, 'utf8').match(/<(HeroNumber|KartuHero)\b/g) ?? []).length;
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
const komponen = berkasTsx('src/components').filter((p) => !p.endsWith('HeroNumber.tsx') && !p.endsWith('KartuHero.tsx'));
const komponenBerhero = komponen.filter((p) => hitung(p) > 0);
cek('komponen tidak membawa angka utama sendiri', komponenBerhero.length === 0, komponenBerhero.join(', '));

console.log('\nDua mode dari satu palet');
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const bg = /bg: '(#[0-9A-Fa-f]{6})'/.exec(readFileSync('src/theme/colors.ts', 'utf8'))?.[1];
cek('app.json: userInterfaceStyle mengikuti sistem', app.userInterfaceStyle === 'automatic');
cek(`app.json: latar asli = colors.latar mode gelap (${bg})`, Boolean(bg) && app.backgroundColor === bg && app.splash?.backgroundColor === bg);
const tataLetak = readFileSync('app/_layout.tsx', 'utf8');
cek(
  'status bar mengikuti skema (terang di atas gelap, gelap di atas terang)',
  /<StatusBar style=\{skema === 'gelap' \? 'light' : 'dark'\} \/>/.test(tataLetak),
);
cek('akar dibungkus PenyediaSkema (paling luar)', /return \(\s*<PenyediaSkema>/.test(tataLetak));
cek('PenyediaSkema mewarnai latar akar', /backgroundColor: colors\.latar/.test(readFileSync('src/theme/skema.tsx', 'utf8')));
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
// Saat tidak ada token yang sedang dipensiunkan, pola ini tidak cocok apa pun.
const NAMA_LAMA = USANG.size ? new RegExp(`colors\\.(${[...USANG.keys()].join('|')})\\b`) : /(?!)/;
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

// Berkas UI: layar + komponen, kecuali PratinjauWidget yang meniru layar kunci iOS.
const semuaUi = [...layar, ...berkasTsx('src/components')].filter((p) => !p.endsWith('PratinjauWidget.tsx'));

console.log('\nTipografi dari satu skala');
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
