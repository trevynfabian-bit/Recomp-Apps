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
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

/** Ambang WCAG AA. */
const AA_KECIL = 4.5;
const AA_BESAR = 3.0;

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
const BANNER_AMBER = campur(c.aksen.isian, '14', c.latar);
const BANNER_CORAL = campur(c.status.bahaya.isian, '14', c.latar);
const PILL_AMBER = campur(c.aksen.isian, '1A', c.permukaan);
const PILIHAN_AMBER = campur(c.aksen.isian, '14', c.permukaan);
/** Gelembung pesan pengguna: amber 8% di atas latar layar. */
const GELEMBUNG_PENGGUNA = campur(c.aksen.isian, '14', c.latar);

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

  // Angka hero (teks besar, 3:1) di kartu dan latar.
  ['aksen.besar (hero) di permukaan', c.aksen.besar, c.permukaan, true],
  ['aksen.besar (hero) di latar', c.aksen.besar, c.latar, true],
  ['bahaya.isian (hero lewat) di permukaan', c.status.bahaya.isian, c.permukaan, true],

  // Pill status, satu baris per peran di arah-visual bab 1.3. Di atas `bg`
  // pill bertint (warna + '1A'); di atas kartu/sheet pill memakai `diKartu`
  // (tanpa isian), sehingga teksnya berdiri langsung di atas `surface`.
  // Pill bertint di atas surface SENGAJA tidak ada: jade/coral/karbo di sana
  // hanya ~3,9:1.
  ['sukses: pill jade di latar', c.status.sukses.teks, campur(c.status.sukses.teks, '1A', c.latar), false],
  ['bahaya: pill coral di latar', c.status.bahaya.teks, campur(c.status.bahaya.teks, '1A', c.latar), false],
  ['info: pill karbo di latar', c.macroTeks.karbo, campur(c.macroTeks.karbo, '1A', c.latar), false],
  ['peringatan: pill amber di latar', c.aksen.teks, campur(c.aksen.isian, '1A', c.latar), false],
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
];
}

let gagal = 0;
for (const [skema, c] of Object.entries(PALET)) {
  console.log(`\nKontras teks (WCAG 2.1 AA) — mode ${skema}`);
  for (const [label, depan, belakang, besar] of pasangan(c)) {
    const rasio = kontras(depan, belakang);
    const ambang = besar ? AA_BESAR : AA_KECIL;
    const lulus = rasio >= ambang;
    console.log(
      `${lulus ? '  ok  ' : ' GAGAL'} ${label.padEnd(46)} ${rasio.toFixed(2)}:1 (min ${ambang})`,
    );
    if (!lulus) gagal += 1;
  }
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
for (const [skema, c] of Object.entries(PALET)) {
  const rasioGaris = kontras(c.garis, c.permukaan);
  console.log(
    `${rasioGaris < 2 ? '  ok  ' : ' GAGAL'} [${skema}] garis vs permukaan ${rasioGaris.toFixed(2)}:1 (maks 2,0)`,
  );
  if (rasioGaris >= 2) gagal += 1;
}

console.log(gagal === 0 ? '\n✓ Semua pasangan lolos AA' : `\n✗ ${gagal} pasangan gagal`);
process.exit(gagal === 0 ? 0 : 1);
