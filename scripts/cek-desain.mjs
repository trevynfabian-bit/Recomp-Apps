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
const daftarGagal = [];
/** Paling banyak sekian pelanggaran dicetak per pemeriksaan; sisanya dihitung. */
const MAKS_RINCIAN = 20;

/**
 * Cetak hasil satu pemeriksaan. Saat gagal, setiap pelanggaran dicetak di
 * barisnya sendiri (`berkas:baris  nilai → saran`), supaya bisa langsung
 * dibuka dari terminal; `rincian` boleh daftar atau teks berpemisah ` | `.
 */
function cek(nama, lulus, rincian = '') {
  if (lulus) {
    console.log(`✓ ${nama}`);
    return;
  }
  gagal += 1;
  daftarGagal.push(nama);
  const butir = (Array.isArray(rincian) ? rincian : String(rincian).split(' | ')).filter(Boolean);
  console.log(`✗ ${nama}${butir.length > 1 ? ` (${butir.length})` : ''}`);
  for (const b of butir.slice(0, MAKS_RINCIAN)) console.log(`    · ${b}`);
  if (butir.length > MAKS_RINCIAN) console.log(`    … dan ${butir.length - MAKS_RINCIAN} lagi`);
}
/** Baris `berkas:n` yang cocok dengan pola. */
function cariBaris(berkas, pola) {
  return readFileSync(berkas, 'utf8')
    .split('\n')
    .flatMap((baris, i) => {
      const m = baris.match(pola);
      // `berkas:baris  cuplikan` — cuplikan adalah nilai yang melanggar.
      return m ? [`${berkas}:${i + 1}  ${m[0].trim()}`] : [];
    });
}
function berkasTsx(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? berkasTsx(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

console.log('Satu angka utama per layar');
const layar = berkasTsx('app');

/**
 * Jumlah ELEMEN JSX angka utama di berkas (AST, bukan teks): komentar dan
 * string yang menyebut `<HeroNumber` tidak ikut terhitung. Cabang alternatif
 * yang tidak menampilkan angka memakai `KartuHero pengganti`, bukan hero kedua.
 */
function hitungElemen(berkas, nama) {
  const sf = ts.createSourceFile(berkas, readFileSync(berkas, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let n = 0;
  (function kunjungi(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && nama.includes(node.tagName.getText(sf))) n += 1;
    ts.forEachChild(node, kunjungi);
  })(sf);
  return n;
}
const hitung = (p) => hitungElemen(p, ['HeroNumber', 'KartuHero']);

/**
 * Layar yang WAJIB punya tepat satu angka utama, masing-masing dengan angka
 * yang dijawabnya. Layar acuan (arah-visual, peraga) boleh punya satu untuk
 * memperagakannya. Semua layar lain tidak boleh punya.
 */
const LAYAR_DATA = {
  'app/(tabs)/index.tsx': 'sisa kalori hari ini',
  'app/(tabs)/tren.tsx': 'rata-rata berat 7 hari',
  'app/(tabs)/budget.tsx': 'sisa jatah minggu ini',
  'app/ukuran.tsx': 'lingkar pinggang terakhir',
  'app/latihan.tsx': 'jumlah sesi pekan ini',
  'app/sumber-data.tsx': 'sumber aktif',
  'app/target-harian.tsx': 'target kalori hari ini',
};
const LAYAR_ACUAN = {
  'app/arah-visual.tsx': 'memperagakan komposisi hero',
  'app/peraga.tsx': 'memperagakan KartuHero',
};
const terdaftar = [...Object.keys(LAYAR_DATA), ...Object.keys(LAYAR_ACUAN)];
const basi = terdaftar.filter((p) => !layar.includes(p));
cek('daftar layar hero tidak basi (semua berkasnya ada)', basi.length === 0, basi.join(', '));

for (const [p, angka] of Object.entries(LAYAR_DATA)) {
  if (layar.includes(p)) cek(`${p}: satu angka utama (${angka})`, hitung(p) === 1, `${hitung(p)} angka utama`);
}
for (const p of Object.keys(LAYAR_ACUAN)) {
  if (layar.includes(p)) cek(`${p}: paling banyak satu angka utama`, hitung(p) <= 1, `${hitung(p)}`);
}
// Keputusan Fase 4 (bab Desain 8.6): angka utama hanya di layar data dan
// layar acuan, dan selalu lewat KartuHero supaya bingkainya sama.
const heroLiar = layar.filter((p) => hitung(p) > 0 && !terdaftar.includes(p));
cek('angka utama hanya di layar data (dan layar acuan)', heroLiar.length === 0, heroLiar.join(', '));
const heroTelanjang = layar.filter((p) => hitungElemen(p, ['HeroNumber']) > 0);
cek('layar memakai KartuHero, bukan HeroNumber telanjang', heroTelanjang.length === 0, heroTelanjang.join(', '));
const komponen = berkasTsx('src/components').filter((p) => !p.endsWith('HeroNumber.tsx') && !p.endsWith('KartuHero.tsx'));
const komponenBerhero = komponen.filter((p) => hitung(p) > 0);
cek('komponen tidak membawa angka utama sendiri', komponenBerhero.length === 0, komponenBerhero.join(', '));
// Angka hero rakitan sendiri: gaya `hero` di luar komponen angka utama & PemilihAngka.
const HERO_GAYA_BOLEH = ['HeroNumber.tsx', 'KartuHero.tsx', 'Pemilih.tsx'];
const heroRakitan = [...layar, ...berkasTsx('src/components')]
  .filter((p) => !HERO_GAYA_BOLEH.some((b) => p.endsWith(b)))
  .flatMap((p) => cariBaris(p, /typography\.hero\b/));
cek('tidak ada angka hero rakitan sendiri (typography.hero)', heroRakitan.length === 0, heroRakitan.join(' | '));

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
    cariBaris(p, NAMA_LAMA).map((temuan) => {
      const lokasi = temuan.split('  ')[0];
      const [berkas, baris] = [lokasi.slice(0, lokasi.lastIndexOf(':')), Number(lokasi.slice(lokasi.lastIndexOf(':') + 1))];
      const token = NAMA_LAMA.exec(readFileSync(berkas, 'utf8').split('\n')[baris - 1])[1];
      return `${lokasi} colors.${token} → ${USANG.get(token)}`;
    }),
  );
cek('layar & komponen tidak memakai token usang', namaLama.length === 0, namaLama);
cek('colors tidak dibekukan di tingkat modul (pakai getter/fungsi)', beku.length === 0, beku);
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
cek('ketebalan tidak ditimpa setelah typography (pakai varian bernama)', timpaBobot.length === 0, timpaBobot);
const bobotMentah = semuaUi.flatMap((p) => cariBaris(p, /fontWeight: '\d+'/));
cek('ketebalan span dari token bobot', bobotMentah.length === 0, bobotMentah);
const bobotTerlarang = semuaUi.flatMap((p) => cariBaris(p, /fontWeight: '(100|200|300|400|900)'/));
cek('ketebalan hanya 500, 600, 700, 800', bobotTerlarang.length === 0, bobotTerlarang);

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
// Tangga (bab Desain 8.4): enam ukuran dasar, naik tegas dari caption ke hero.
const ukuranDasar = Object.fromEntries(gaya.filter((g) => dasar.includes(g[1])).map((g) => [g[1], Number(g[2])]));
const urut = [...dasar].reverse(); // caption → hero
cek(
  'tangga ukuran naik tegas: caption < label < body < title < display < hero',
  urut.every((d, i) => i === 0 || ukuranDasar[d] > ukuranDasar[urut[i - 1]]),
  urut.map((d) => `${d} ${ukuranDasar[d]}`).join(' < '),
);
const rasioBaris = gaya.map((g) => [g[1], Number(g[3]) / Number(g[2])]);
const rasioLuar = rasioBaris.filter(([, r]) => r < 1.05 || r > 1.5);
cek('tinggi baris 1,05–1,5 × ukuran', rasioLuar.length === 0, rasioLuar.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(', '));
const varian = gaya.filter((g) => !dasar.includes(g[1]));
const varianLiar = varian.filter((g) => !Object.values(ukuranDasar).includes(Number(g[2])));
cek('varian bernama memakai ukuran dari tangga (tidak menambah ukuran)', varianLiar.length === 0, varianLiar.map((g) => g[1]).join(', '));
// Dynamic Type (HIG): tidak ada teks yang mematikan penskalaan; hanya angka
// hero yang dibatasi, lewat MAKS_SKALA_HERO.
const skalaMati = [...layar, ...berkasTsx('src/components')].flatMap((p) => cariBaris(p, /allowFontScaling=\{false\}/));
cek('tidak ada teks yang mematikan Dynamic Type', skalaMati.length === 0, skalaMati.join(' | '));
cek('angka hero dibatasi MAKS_SKALA_HERO', /maxFontSizeMultiplier=\{MAKS_SKALA_HERO\}/.test(readFileSync('src/components/HeroNumber.tsx', 'utf8')));

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

console.log('\nNavigasi (docs/desain/peta-navigasi.md)');
const tabTeks = readFileSync(join('app', '(tabs)', '_layout.tsx'), 'utf8');
const tab = [...tabTeks.matchAll(/\{ rute: '(\w+)', judul: '([^']+)'/g)].map((m) => ({ rute: m[1], judul: m[2] }));
cek(`jumlah tab ${tab.length} (1–5, batas HIG iPhone)`, tab.length >= 1 && tab.length <= 5);
const tabBeda = tab.filter((t) => {
  const layarTab = readFileSync(join('app', '(tabs)', `${t.rute}.tsx`), 'utf8');
  // Tab "index" menyapa pengguna ("Hai, …") alih-alih mencetak judulnya.
  // Judul boleh lebih panjang ("Tren berat") asalkan diawali label tabnya.
  return t.rute !== 'index' && !new RegExp(`(>\\s*|judul="|judul=\\{\`)${t.judul}\\b`).test(layarTab);
});
cek('judul layar diawali label tabnya', tabBeda.length === 0, tabBeda.map((t) => `${t.rute}: "${t.judul}"`).join(', '));
const tabelRute = [...tataLetak.matchAll(/\{ nama: '([\w-]+)', jenis: '(dorong|modal)' \}/g)].map((m) => m[1]);
const ruteTumpukan = readdirSync('app')
  .filter((n) => n.endsWith('.tsx') && !['_layout.tsx', 'masuk.tsx'].includes(n))
  .map((n) => n.replace('.tsx', ''));
const tanpaTransisi = ruteTumpukan.filter((r) => !tabelRute.includes(r));
cek('setiap rute tumpukan punya pola transisi (dorong/modal)', tanpaTransisi.length === 0, tanpaTransisi.join(', '));
const kembaliMentah = [...berkasTs('app'), ...berkasTs('src')]
  .filter((p) => !p.endsWith(join('lib', 'kembali.ts')))
  .flatMap((p) => cariBaris(p, /router\.back\(\)/));
cek('kembali lewat useKembali (satu langkah, ada induk bila tanpa riwayat)', kembaliMentah.length === 0, kembaliMentah.join(' | '));
const indukTeks = readFileSync(join('src', 'lib', 'kembali.ts'), 'utf8');
const tanpaInduk = ruteTumpukan.filter((r) => !indukTeks.includes(`'/${r}':`));
cek('setiap rute tumpukan punya induk untuk kembali tanpa riwayat', tanpaInduk.length === 0, tanpaInduk.join(', '));
const tanpaHeader = layar
  .filter((p) => !/_layout\.tsx$|masuk\.tsx$/.test(p))
  .filter((p) => (readFileSync(p, 'utf8').match(/<HeaderLayar\b/g) ?? []).length === 0);
cek('setiap layar memakai HeaderLayar (kecuali layar masuk)', tanpaHeader.length === 0, tanpaHeader.join(', '));

// Setiap Pressable harus terbukti mencapai 44 pt: token ukuran (TAP_MIN,
// KONTROL_* + sisaSentuh, ukuran.tombolLangkah), hitSlop, padding ≥ md, flex
// penuh, atau membungkus seluruh Card. Tombol bersama (Tombol, TombolIkon)
// sudah memenuhinya di dalam komponennya.
const CUKUP_SENTUH = /TAP_MIN|KONTROL_|tombolLangkah|hitSlop|padding: spacing\.(md|lg|xl)|paddingVertical: spacing\.(md|lg|xl)|flex: 1/;
const sentuhKecil = semuaUi.flatMap((berkas) => {
  const sf = ts.createSourceFile(berkas, readFileSync(berkas, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hasil = [];
  (function kunjungi(n) {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'Pressable') {
      const buka = n.openingElement.getText(sf);
      const anakPertama = n.children.find((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
      const tagAnak = anakPertama && (ts.isJsxElement(anakPertama) ? anakPertama.openingElement : anakPertama).tagName.getText(sf);
      if (!CUKUP_SENTUH.test(buka) && tagAnak !== 'Card') {
        hasil.push(`${berkas}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(n, kunjungi);
  })(sf);
  return hasil;
});
cek('setiap Pressable terbukti ≥ 44 pt (token, hitSlop, padding, atau membungkus Card)', sentuhKecil.length === 0, sentuhKecil.join(' | '));

console.log('\nAcuan resmi');
let bab = '';
try {
  bab = readFileSync('docs/desain/bab-desain-prd.md', 'utf8');
} catch {
  // ditangani cek di bawah
}
cek('bab Desain PRD ada dan berstatus resmi', /\*\*Status\*\* \| \*\*Resmi/.test(bab));
cek('bab Desain punya riwayat versi', /## Riwayat & perubahan/.test(bab));

if (gagal) {
  console.log(`\n${gagal} pemeriksaan gagal:`);
  for (const n of daftarGagal) console.log(`  ✗ ${n}`);
  console.log('Aturan & alasannya: docs/desain/bab-desain-prd.md (ringkas) dan docs/desain/arah-visual.md (rinci).');
} else {
  console.log('\nSemua pemeriksaan desain lulus');
}
process.exit(gagal ? 1 : 0);
