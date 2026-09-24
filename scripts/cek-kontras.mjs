/**
 * Memeriksa kontras teks terhadap latar sesuai WCAG 2.1 AA, untuk KEDUA mode.
 *
 * Palet di PRD dipilih untuk NUANSA, bukan untuk keterbacaan, dan beberapa
 * aksennya memang tidak lolos sebagai teks kecil — itulah sebabnya setiap peran
 * punya varian `isian` dan `teks` yang terpisah. Aturan mana yang dipakai di
 * mana cuma bisa dijaga kalau diperiksa mesin; dengan mata, aksen 3,5:1 dan
 * 4,6:1 di atas latar gelap terlihat sama-sama "cukup terang".
 *
 * Latar bertint (mis. banner `aksen.isian + '14'` di atas `latar`) ikut
 * dihitung sebagai WARNA HASIL CAMPURAN, bukan sebagai latar dasarnya — teks di
 * dalam banner berdiri di atas campuran itu, bukan di atas `latar`.
 *
 * Kode di sini memakai nama semantik yang sama dengan layar (bab Desain 8.2).
 * Label "amber"/"coral"/"jade" di daftar hanya untuk dibaca manusia.
 */
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { buatRingkasan } from './lib/ringkasan-cek.mjs';

const require = createRequire(import.meta.url);

/**
 * Ambang WCAG 2.1 tingkat AA — acuan resmi app (bab Desain 8.3), BUKAN AAA.
 *
 * - `AA_KECIL` 4,5:1 — SC 1.4.3 Contrast (Minimum), teks biasa. Di tangga
 *   tipografi app: `body`, `label`, `caption`, `labelBiasa`, `bodySedang`,
 *   `bodyTebal` (semuanya < 18,66 px tebal / < 24 px).
 * - `AA_BESAR` 3:1 — SC 1.4.3 untuk teks besar (≥ 24 px, atau ≥ 18,66 px
 *   tebal): `hero`, `display`, `title` (20 px tebal ≥ 18,66). DAN SC 1.4.11
 *   Non-text Contrast untuk mark grafik, bar terhadap track, dan tepi kontrol.
 * - Pemisah dekoratif (`garis`) tidak tunduk 1.4.11; ia diperiksa dari arah
 *   sebaliknya: MAKSIMAL 2:1 supaya tetap resesif.
 *
 * Pasangan yang ditandai `besar: true` di daftar memakai `AA_BESAR`.
 */
const AA_KECIL = 4.5;
const AA_BESAR = 3.0;
/** Hanya informasi (tidak menggagalkan): seberapa banyak yang juga lolos AAA (SC 1.4.6). */
const AAA_KECIL = 7.0;
const AAA_BESAR = 4.5;

function muatWarna() {
  const kerja = mkdtempSync(join(tmpdir(), 'kontras-'));
  copyFileSync('src/theme/colors.ts', join(kerja, 'colors.ts'));
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['colors.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'colors.js')).palet;
}

const PALET = muatWarna();

/**
 * Warna pratinjau widget layar kunci (`src/theme/layarKunci.ts`): monokrom,
 * sama di kedua mode, jadi dibaca sekali. Dibaca dengan regex (bukan tsc)
 * karena berkasnya mengimpor tipe react-native.
 */
function muatLayarKunci() {
  const teks = readFileSync('src/theme/layarKunci.ts', 'utf8');
  const blok = teks.match(/warna: \{([\s\S]*?)\n  \}/)[1];
  return Object.fromEntries([...blok.matchAll(/(\w+): '(#[0-9A-Fa-f]{6,8})'/g)].map((m) => [m[1], m[2]]));
}
const LAYAR_KUNCI = muatLayarKunci();
/** Warna #RRGGBBAA dicampur ke dasarnya; #RRGGBB apa adanya. */
const padat = (hex, dasar) => (hex.length === 9 ? campur(hex.slice(0, 7), hex.slice(7), dasar) : hex);

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/** Campur warna bertint (alpha heksadesimal) di atas warna dasar. */
const campur = (atasHex, alphaHex, bawahHex) => {
  const a = parseInt(alphaHex, 16) / 255;
  const [r1, g1, b1] = rgb(atasHex);
  const [r2, g2, b2] = rgb(bawahHex);
  const gabung = (x, y) => Math.round(a * x + (1 - a) * y);
  return `#${[gabung(r1, r2), gabung(g1, g2), gabung(b1, b2)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
};

const luminansi = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const kontras = (a, b) => {
  const la = luminansi(a);
  const lb = luminansi(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Semua pasangan untuk satu palet `c` (mode gelap atau terang). */
function pasangan(c) {
/** Latar bertint yang benar-benar dipakai di layar. */
const BANNER_AMBER = campur(c.aksen.isian, c.alfa.pilih, c.latar);
const BANNER_CORAL = campur(c.status.bahaya.isian, c.alfa.pilih, c.latar);
const PILL_AMBER = campur(c.aksen.isian, c.alfa.pill, c.permukaan);
const PILIHAN_AMBER = campur(c.aksen.isian, c.alfa.pilih, c.permukaan);
/** Gelembung pesan pengguna: amber 8% di atas latar layar. */
const GELEMBUNG_PENGGUNA = campur(c.aksen.isian, c.alfa.pilih, c.latar);

/**
 * Pasangan yang benar-benar ada di layar. `besar` berarti teksnya ≥24px atau
 * ≥18,7px tebal, sehingga ambangnya 3:1 menurut WCAG.
 */
  return [
  // Teks netral di tiap permukaan
  ['teks di latar', c.teks, c.latar, false],
  ['teks di permukaan', c.teks, c.permukaan, false],
  ['teks di permukaanCekung', c.teks, c.permukaanCekung, false],
  ['teksRedup di latar', c.teksRedup, c.latar, false],
  ['teksRedup di permukaan', c.teksRedup, c.permukaan, false],
  ['teksRedup di permukaanCekung', c.teksRedup, c.permukaanCekung, false],
  ['teksSamar di latar', c.teksSamar, c.latar, false],
  ['teksSamar di permukaan', c.teksSamar, c.permukaan, false],
  ['teksSamar di permukaanCekung', c.teksSamar, c.permukaanCekung, false],

  // Aksen sebagai TEKS KECIL — di sinilah varian aksenTeks wajib dipakai
  ['amber di permukaan', c.aksen.teks, c.permukaan, false],
  ['amber di permukaanCekung', c.aksen.teks, c.permukaanCekung, false],
  ['amber di latar', c.aksen.teks, c.latar, false],
  ['bahaya.teks di permukaan', c.status.bahaya.teks, c.permukaan, false],
  ['bahaya.teks di permukaanCekung', c.status.bahaya.teks, c.permukaanCekung, false],
  ['sukses.teks di permukaan', c.status.sukses.teks, c.permukaan, false],
  ['sukses.teks di permukaanCekung', c.status.sukses.teks, c.permukaanCekung, false],

  // Warna makro sebagai teks
  ['macroTeks.kalori di permukaan', c.macroTeks.kalori, c.permukaan, false],
  ['macroTeks.protein di permukaan', c.macroTeks.protein, c.permukaan, false],
  ['macroTeks.lemak di permukaan', c.macroTeks.lemak, c.permukaan, false],
  ['macroTeks.karbo di permukaan', c.macroTeks.karbo, c.permukaan, false],
  ['macroTeks.satFat di permukaan', c.macroTeks.satFat, c.permukaan, false],
  ['macroTeks.lemak di permukaanCekung', c.macroTeks.lemak, c.permukaanCekung, false],

  // Latar bertint: banner, pill, dan kotak konfirmasi
  ['amber di banner amber (14 atas latar)', c.aksen.teks, BANNER_AMBER, false],
  ['teksSamar di banner amber', c.teksSamar, BANNER_AMBER, false],
  ['bahaya.teks di banner coral (14 atas latar)', c.status.bahaya.teks, BANNER_CORAL, false],
  ['teksSamar di banner coral', c.teksSamar, BANNER_CORAL, false],
  ['amber di pill amber (1A atas permukaan)', c.aksen.teks, PILL_AMBER, false],
  // Latar pilihan terpilih (amber 8% di atas surface) — dipakai PemilihFase,
  // PanelRedistribusi, dan pemilih jenis kelamin.
  ['amber di pilihan terpilih', c.aksen.teks, PILIHAN_AMBER, false],
  ['teks di pilihan terpilih', c.teks, PILIHAN_AMBER, false],
  // textFaint SENGAJA tidak ada di daftar ini: di atas latar terpilih ia cuma
  // 3,94:1, jadi sub-label pilihan memakai textMuted. Kalau suatu saat ada yang
  // memasang textFaint di sana lagi, pasangannya harus ditambahkan ke sini dan
  // akan langsung gagal.
  ['teksRedup di pilihan terpilih', c.teksRedup, PILIHAN_AMBER, false],

  // Matriks lengkap: SETIAP token teks × SETIAP permukaan, dibentuk dari palet.
  // Token teks atau permukaan baru otomatis ikut diperiksa di kedua mode tanpa
  // perlu menambah baris di sini.
  ...(() => {
    const teks = {
      teks: c.teks,
      teksRedup: c.teksRedup,
      teksSamar: c.teksSamar,
      'aksen.teks': c.aksen.teks,
      ...Object.fromEntries(Object.entries(c.status).map(([n, p]) => [`status.${n}.teks`, p.teks])),
      ...Object.fromEntries(Object.entries(c.macroTeks).map(([n, v]) => [`macroTeks.${n}`, v])),
    };
    const permukaan = { latar: c.latar, permukaan: c.permukaan, permukaanCekung: c.permukaanCekung };
    return Object.entries(teks).flatMap(([nt, vt]) =>
      Object.entries(permukaan).map(([np, vp]) => [`matriks: ${nt} di ${np}`, vt, vp, false]),
    );
  })(),

  // Peran semantik (bab Desain 8.2): teks tiap peran di tiga permukaan, dan
  // isiannya sebagai mark terhadap track.
  ...[['aksen', c.aksen], ...Object.entries(c.status)].flatMap(([nama, p]) => [
    [`peran ${nama}: teks di latar`, p.teks, c.latar, false],
    [`peran ${nama}: teks di permukaan`, p.teks, c.permukaan, false],
    [`peran ${nama}: teks di permukaanCekung`, p.teks, c.permukaanCekung, false],
    [`peran ${nama}: isian vs track`, p.isian, c.permukaanCekung, true],
    // `info` TIDAK pernah menjadi isian berlabel (tombol/chip): di mode gelap
    // label di atas ungu karbo hanya 4,41:1. Isiannya hanya bar & mark.
    ...(nama === 'info' ? [] : [[`peran ${nama}: diAtasIsian di isian`, c.diAtasIsian, p.isian, false]]),
  ]),

  // Teks status di dalam pill/label bertint WARNANYA SENDIRI di atas kartu
  // (PenandaSumber, StatusRedistribusi, LabelSinyalArah, KartuTdee,
  // IndikatorProteinTerlindungi) dan di chip aktif bertint aksen.
  ...[['sukses', c.status.sukses.teks], ['bahaya', c.status.bahaya.teks], ['peringatan', c.status.peringatan.teks],
      ['info', c.status.info.teks], ['teksRedup', c.teksRedup]].flatMap(([nama, w]) => [
    [`${nama} di pill ${nama} atas permukaan`, w, campur(w, c.alfa.pill, c.permukaan), false],
    [`${nama} di chip aktif (aksen ${c.alfa.aktif}) atas permukaan`, w, campur(c.aksen.isian, c.alfa.aktif, c.permukaan), false],
  ]),

  // Angka hero (teks besar, 3:1) di kartu dan latar.
  ['aksen.besar (hero) di permukaan', c.aksen.besar, c.permukaan, true],
  ['aksen.besar (hero) di latar', c.aksen.besar, c.latar, true],
  ['bahaya.isian (hero lewat) di permukaan', c.status.bahaya.isian, c.permukaan, true],

  // Pill status, satu baris per peran di arah-visual bab 1.3. Di atas `bg`
  // pill bertint (warna + '1A'); di atas kartu/sheet pill memakai `diKartu`
  // (tanpa isian), sehingga teksnya berdiri langsung di atas `surface`.
  // Pill bertint di atas surface SENGAJA tidak ada: jade/coral/karbo di sana
  // hanya ~3,9:1.
  ['sukses: pill jade di latar', c.status.sukses.teks, campur(c.status.sukses.teks, c.alfa.pill, c.latar), false],
  ['bahaya: pill coral di latar', c.status.bahaya.teks, campur(c.status.bahaya.teks, c.alfa.pill, c.latar), false],
  ['info: pill karbo di latar', c.macroTeks.karbo, campur(c.macroTeks.karbo, c.alfa.pill, c.latar), false],
  ['peringatan: pill amber di latar', c.aksen.teks, campur(c.aksen.isian, c.alfa.pill, c.latar), false],
  ['pill teksRedup di kartu (tanpa isian)', c.teksRedup, c.permukaan, false],

  ['teks di gelembung pengguna', c.teks, GELEMBUNG_PENGGUNA, false],
  ['teksSamar di gelembung pengguna', c.teksSamar, GELEMBUNG_PENGGUNA, false],

  // Warna status `info` (ungu karbo) sebagai teks kecil
  ['macroTeks.karbo di latar', c.macroTeks.karbo, c.latar, false],
  ['macroTeks.karbo di permukaanCekung', c.macroTeks.karbo, c.permukaanCekung, false],
  ['bahaya.teks di latar', c.status.bahaya.teks, c.latar, false],
  ['sukses.teks di latar', c.status.sukses.teks, c.latar, false],

  // Label di atas tombol isian penuh. Aturannya: label di atas isian APA PUN
  // memakai `bg`. `text` di atas coral hanya 3,64:1 — pasangan itu dulu
  // dipakai tombol merusak dan sengaja tidak masuk daftar ini.
  ['diAtasIsian di atas amber', c.diAtasIsian, c.aksen.teks, false],
  ['diAtasIsian di atas jade', c.diAtasIsian, c.status.sukses.isian, false],
  ['diAtasIsian di atas coral', c.diAtasIsian, c.status.bahaya.isian, false],

  // Mark grafik dan tepi KONTROL — ambang 3:1 (WCAG 1.4.11)
  ['garis amber di permukaan (mark)', c.aksen.teks, c.permukaan, true],
  // Bar makro terhadap TRACK-nya: batas "sudah terpakai" adalah informasi,
  // jadi ia tunduk pada ambang 3:1 untuk objek grafis (WCAG 1.4.11).
  ...['kalori', 'protein', 'lemak', 'karbo', 'satFat'].map((k) => [
    `bar ${k} vs track surfaceSunken`,
    c.macro[k],
    c.permukaanCekung,
    true,
  ]),
  ['garisKontrol di permukaan', c.garisKontrol, c.permukaan, true],
  ['garisKontrol di permukaanCekung', c.garisKontrol, c.permukaanCekung, true],
  ['garisKontrol di latar', c.garisKontrol, c.latar, true],
  // Tepi kolom Isian saat fokus dan saat bermasalah, terhadap latar kolom.
  ['tepi Isian fokus (aksen) di permukaanCekung', c.aksen.isian, c.permukaanCekung, true],
  ['tepi Isian galat (bahaya) di permukaanCekung', c.status.bahaya.isian, c.permukaanCekung, true],
  ['galat Isian (bahaya.teks) di permukaan', c.status.bahaya.teks, c.permukaan, false],

  // Chip terpilih (Fase 5): tint aksen `pill` di atas kartu/sheet dan di atas
  // latar layar (saran Coach). Label `teks`, ikon `aksen.teks`, tepi aksen 3:1.
  ...[['permukaan', c.permukaan], ['latar', c.latar]].flatMap(([nama, dasar]) => {
    const chip = campur(c.aksen.isian, c.alfa.pill, dasar);
    return [
      [`teks di chip terpilih atas ${nama}`, c.teks, chip, false],
      [`aksen.teks (ikon) di chip terpilih atas ${nama}`, c.aksen.teks, chip, false],
      [`tepi chip terpilih (aksen) di ${nama}`, c.aksen.isian, dasar, true],
    ];
  }),

  // Pratinjau widget layar kunci: monokrom, sama di kedua mode.
  ['layar kunci: jam di wallpaper', LAYAR_KUNCI.jam, LAYAR_KUNCI.latar, true],
  ['layar kunci: teks di wallpaper', LAYAR_KUNCI.teks, LAYAR_KUNCI.latar, false],
  ['layar kunci: teksRedup di wallpaper', padat(LAYAR_KUNCI.teksRedup, LAYAR_KUNCI.latar), LAYAR_KUNCI.latar, false],
  ['layar kunci: teks di widget persegi', LAYAR_KUNCI.teks, padat(LAYAR_KUNCI.isian, LAYAR_KUNCI.latar), false],
  ['layar kunci: teksRedup di widget persegi', padat(LAYAR_KUNCI.teksRedup, padat(LAYAR_KUNCI.isian, LAYAR_KUNCI.latar)), padat(LAYAR_KUNCI.isian, LAYAR_KUNCI.latar), false],
];
}

const hasil = buatRingkasan('cek:kontras');

// --- Paritas bentuk: kedua mode wajib punya kunci yang sama dan nilai sah.
// Kunci yang hanya ada di satu mode berarti layar yang memakainya mendapat
// `undefined` di mode lain — warna hilang tanpa galat.
console.log('Paritas palet gelap ↔ terang');
hasil.bagian('Paritas palet gelap ↔ terang');
const daun = (objek, jalur = '') =>
  Object.entries(objek).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${jalur}${k}`, v]] : daun(v, `${jalur}${k}.`),
  );
const kunciPer = Object.fromEntries(Object.entries(PALET).map(([m, c]) => [m, new Map(daun(c))]));
const [modeA, modeB] = Object.keys(kunciPer);
const hanyaA = [...kunciPer[modeA].keys()].filter((k) => !kunciPer[modeB].has(k));
const hanyaB = [...kunciPer[modeB].keys()].filter((k) => !kunciPer[modeA].has(k));
const tidakSah = Object.entries(kunciPer).flatMap(([m, peta]) =>
  [...peta].filter(([k, v]) => !(k.startsWith('alfa.') ? /^[0-9A-F]{2}$/i : /^#([0-9A-F]{6}|[0-9A-F]{8})$/i).test(v)).map(([k, v]) => `${m}:${k}=${v}`),
);
for (const [nama, daftar] of [
  [`kunci hanya di ${modeA}`, hanyaA],
  [`kunci hanya di ${modeB}`, hanyaB],
  ['nilai bukan heks sah', tidakSah],
]) {
  console.log(`${daftar.length === 0 ? '  ok  ' : ' GAGAL'} ${nama}${daftar.length ? `: ${daftar.join(', ')}` : ''}`);
  hasil.catat(nama, daftar.length === 0, daftar.length);
}

// --- Kontras per mode.
/** Margin di bawah ini lulus, tapi satu penyesuaian warna kecil bisa menjatuhkannya. */
const MARGIN_TIPIS = 0.1;
const ringkasan = [];
for (const [skema, c] of Object.entries(PALET)) {
  console.log(`\nKontras teks (WCAG 2.1 AA) — mode ${skema}`);
  hasil.bagian(`Kontras AA mode ${skema}`);
  let lulusMode = 0;
  let gagalMode = 0;
  let lulusAAA = 0;
  let terlemah = null;
  const tipis = [];
  for (const [label, depan, belakang, besar] of pasangan(c)) {
    const rasio = kontras(depan, belakang);
    const ambang = besar ? AA_BESAR : AA_KECIL;
    const lulus = rasio >= ambang;
    const margin = rasio - ambang;
    console.log(
      `${lulus ? (margin < MARGIN_TIPIS ? ' tipis' : '  ok  ') : ' GAGAL'} ${label.padEnd(46)} ${rasio.toFixed(2)}:1 (min ${ambang})`,
    );
    hasil.catat(label, lulus);
    if (lulus) lulusMode += 1;
    else gagalMode += 1;
    if (rasio >= (besar ? AAA_BESAR : AAA_KECIL)) lulusAAA += 1;
    if (lulus && margin < MARGIN_TIPIS) tipis.push(label);
    if (!terlemah || margin < terlemah.margin) terlemah = { label, rasio, ambang, margin };
  }
  ringkasan.push({ skema, lulusMode, gagalMode, lulusAAA, terlemah, tipis });
}

/*
 * `border` sengaja TIDAK diuji dengan ambang 3:1. Ia dipakai untuk pemisah
 * dekoratif — tepi kartu, garis antar baris, garis bantu grafik — yang justru
 * harus resesif; 3:1 di sana akan membuat kerangka lebih berisik daripada
 * datanya. Yang menandai KONTROL adalah `borderKuat`, dan itu yang diuji 3:1
 * di atas. Jadi di sini `border` diperiksa dari sisi sebaliknya: tidak boleh
 * terlalu menonjol.
 */
console.log('\nGaris pemisah dekoratif harus tetap resesif');
hasil.bagian('Garis pemisah tetap resesif');
for (const [skema, c] of Object.entries(PALET)) {
  const rasioGaris = kontras(c.garis, c.permukaan);
  console.log(
    `${rasioGaris < 2 ? '  ok  ' : ' GAGAL'} [${skema}] garis vs permukaan ${rasioGaris.toFixed(2)}:1 (maks 2,0)`,
  );
  hasil.catat(`[${skema}] garis vs permukaan`, rasioGaris < 2);
}

/*
 * Teks di atas latar bertint, dibaca dari KODE (Fase 5). Daftar pasangan di
 * atas hanya memeriksa kombinasi yang didaftarkan orang; di sini setiap elemen
 * dengan `backgroundColor: tint(colors.x, 'tingkat')` di layar & komponen
 * dicari, lalu setiap warna `colors.*` pada <Text> di dalamnya diuji 4,5:1
 * terhadap tint itu di atas permukaan dan latar, di kedua mode. Warna di
 * cabang kondisional (`a ? colors.x : colors.y`) diuji semuanya.
 */
console.log('\nTeks di atas latar bertint (dibaca dari kode)');
hasil.bagian('Teks di atas tint (dari kode)');
{
  const berkasTsx = (d) =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? berkasTsx(p) : p.endsWith('.tsx') ? [p] : [];
    });
  const ambil = (c, expr) => {
    const m = expr.match(/^colors\.([\w.]+)$/);
    if (!m) return null;
    let v = c;
    for (const bagian of m[1].split('.')) v = v?.[bagian];
    return typeof v === 'string' ? v : null;
  };
  let diuji = 0;
  const temuan = [];
  for (const f of [...berkasTsx('app'), ...berkasTsx('src/components')]) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    (function kunjungi(n) {
      if (ts.isJsxElement(n)) {
        const m = n.openingElement.getText(sf).match(/backgroundColor:\s*(?:[^,}]*\?\s*)?tint\((colors\.[\w.]+),\s*'(\w+)'\)/);
        if (m) {
          // Warna teks langsung di dalam elemen ini (bukan di elemen bertint bersarang).
          const warnaTeks = new Set();
          (function teks(x) {
            if ((ts.isJsxOpeningElement(x) || ts.isJsxSelfClosingElement(x)) && x.tagName.getText(sf) === 'Text') {
              for (const c of x.getText(sf).matchAll(/color:\s*([^,}]+)/g)) {
                for (const e of c[1].split(/[?:]/)) if (e.trim().startsWith('colors.')) warnaTeks.add(e.trim());
              }
            }
            ts.forEachChild(x, teks);
          })(n);
          const baris = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          for (const [mode, c] of Object.entries(PALET)) {
            for (const dasar of ['permukaan', 'latar']) {
              const w = ambil(c, m[1]);
              if (!w) continue;
              const latar = campur(w, c.alfa[m[2]], c[dasar]);
              for (const tw of warnaTeks) {
                const depan = ambil(c, tw);
                if (!depan) continue;
                diuji += 1;
                const r = kontras(depan, latar);
                if (r < AA_KECIL) temuan.push(`${f}:${baris} [${mode}, atas ${dasar}] ${tw} di tint(${m[1]}, '${m[2]}') ${r.toFixed(2)}:1`);
              }
            }
          }
        }
      }
      ts.forEachChild(n, kunjungi);
    })(sf);
  }
  console.log(`${temuan.length === 0 ? '  ok  ' : ' GAGAL'} ${diuji} kombinasi teks × tint dari kode`);
  for (const t of temuan) console.log(`         ${t}`);
  hasil.catat('teks di atas tint lolos AA (min 4,5:1)', temuan.length === 0, temuan.length);
}

console.log('\nRincian per mode');
for (const r of ringkasan) {
  console.log(
    `  ${r.skema.padEnd(7)} AA: ${r.lulusMode} lulus, ${r.gagalMode} gagal · terlemah: ${r.terlemah.label} ${r.terlemah.rasio.toFixed(2)}:1 (min ${r.terlemah.ambang}) · AAA (info): ${r.lulusAAA}/${r.lulusMode + r.gagalMode}`,
  );
  if (r.tipis.length) console.log(`          margin < ${MARGIN_TIPIS} (lulus, tapi rawan): ${r.tipis.join('; ')}`);
}

process.exit(
  hasil.cetak({ saran: 'Cara menyesuaikan warna: docs/desain/panduan-token.md ("Contoh: mengganti warna aksen").' }),
);
