/**
 * Memeriksa kontras teks terhadap latar sesuai WCAG 2.1 AA.
 *
 * Palet di PRD dipilih untuk NUANSA, bukan untuk keterbacaan, dan beberapa
 * aksennya memang tidak lolos sebagai teks kecil — itulah sebabnya tema punya
 * varian `aksenTeks`/`macroTeks` yang terpisah. Aturan mana yang dipakai di mana
 * cuma bisa dijaga kalau diperiksa mesin; dengan mata, aksen 3,5:1 dan 4,6:1 di
 * atas latar gelap terlihat sama-sama "cukup terang".
 *
 * Latar bertint (mis. banner `amber + '14'` di atas `bg`) ikut dihitung sebagai
 * WARNA HASIL CAMPURAN, bukan sebagai latar dasarnya — teks di dalam banner
 * berdiri di atas campuran itu, bukan di atas `bg`.
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
  return require(join(kerja, 'keluar', 'colors.js')).colors;
}

const c = muatWarna();

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

/** Latar bertint yang benar-benar dipakai di layar. */
const BANNER_AMBER = campur(c.amber, '14', c.bg);
const BANNER_CORAL = campur(c.coral, '14', c.bg);
const PILL_AMBER = campur(c.amber, '1A', c.surface);
const PILIHAN_AMBER = campur(c.amber, '14', c.surface);
/** Gelembung pesan pengguna: amber 8% di atas latar layar. */
const GELEMBUNG_PENGGUNA = campur(c.amber, '14', c.bg);

/**
 * Pasangan yang benar-benar ada di layar. `besar` berarti teksnya ≥24px atau
 * ≥18,7px tebal, sehingga ambangnya 3:1 menurut WCAG.
 */
const PASANGAN = [
  // Teks netral di tiap permukaan
  ['text di bg', c.text, c.bg, false],
  ['text di surface', c.text, c.surface, false],
  ['text di surfaceSunken', c.text, c.surfaceSunken, false],
  ['textMuted di bg', c.textMuted, c.bg, false],
  ['textMuted di surface', c.textMuted, c.surface, false],
  ['textMuted di surfaceSunken', c.textMuted, c.surfaceSunken, false],
  ['textFaint di bg', c.textFaint, c.bg, false],
  ['textFaint di surface', c.textFaint, c.surface, false],
  ['textFaint di surfaceSunken', c.textFaint, c.surfaceSunken, false],

  // Aksen sebagai TEKS KECIL — di sinilah varian aksenTeks wajib dipakai
  ['amber di surface', c.amber, c.surface, false],
  ['amber di surfaceSunken', c.amber, c.surfaceSunken, false],
  ['amber di bg', c.amber, c.bg, false],
  ['aksenTeks.coral di surface', c.aksenTeks.coral, c.surface, false],
  ['aksenTeks.coral di surfaceSunken', c.aksenTeks.coral, c.surfaceSunken, false],
  ['aksenTeks.jade di surface', c.aksenTeks.jade, c.surface, false],
  ['aksenTeks.jade di surfaceSunken', c.aksenTeks.jade, c.surfaceSunken, false],

  // Warna makro sebagai teks
  ['macroTeks.kalori di surface', c.macroTeks.kalori, c.surface, false],
  ['macroTeks.protein di surface', c.macroTeks.protein, c.surface, false],
  ['macroTeks.lemak di surface', c.macroTeks.lemak, c.surface, false],
  ['macroTeks.karbo di surface', c.macroTeks.karbo, c.surface, false],
  ['macroTeks.satFat di surface', c.macroTeks.satFat, c.surface, false],
  ['macroTeks.lemak di surfaceSunken', c.macroTeks.lemak, c.surfaceSunken, false],

  // Latar bertint: banner, pill, dan kotak konfirmasi
  ['amber di banner amber (14 atas bg)', c.amber, BANNER_AMBER, false],
  ['textFaint di banner amber', c.textFaint, BANNER_AMBER, false],
  ['aksenTeks.coral di banner coral (14 atas bg)', c.aksenTeks.coral, BANNER_CORAL, false],
  ['textFaint di banner coral', c.textFaint, BANNER_CORAL, false],
  ['amber di pill amber (1A atas surface)', c.amber, PILL_AMBER, false],
  // Latar pilihan terpilih (amber 8% di atas surface) — dipakai PemilihFase,
  // PanelRedistribusi, dan pemilih jenis kelamin.
  ['amber di pilihan terpilih', c.amber, PILIHAN_AMBER, false],
  ['text di pilihan terpilih', c.text, PILIHAN_AMBER, false],
  // textFaint SENGAJA tidak ada di daftar ini: di atas latar terpilih ia cuma
  // 3,94:1, jadi sub-label pilihan memakai textMuted. Kalau suatu saat ada yang
  // memasang textFaint di sana lagi, pasangannya harus ditambahkan ke sini dan
  // akan langsung gagal.
  ['textMuted di pilihan terpilih', c.textMuted, PILIHAN_AMBER, false],

  ['text di gelembung pengguna', c.text, GELEMBUNG_PENGGUNA, false],
  ['textFaint di gelembung pengguna', c.textFaint, GELEMBUNG_PENGGUNA, false],

  // Label di atas tombol isian penuh
  ['bg di atas amber', c.bg, c.amber, false],
  ['bg di atas jade', c.bg, c.jade, false],
  ['bg di atas coral', c.bg, c.coral, false],

  // Mark grafik dan tepi KONTROL — ambang 3:1 (WCAG 1.4.11)
  ['garis amber di surface (mark)', c.amber, c.surface, true],
  ['borderKuat di surface', c.borderKuat, c.surface, true],
  ['borderKuat di surfaceSunken', c.borderKuat, c.surfaceSunken, true],
  ['borderKuat di bg', c.borderKuat, c.bg, true],
];

let gagal = 0;
console.log('\nKontras teks (WCAG 2.1 AA)');
for (const [label, depan, belakang, besar] of PASANGAN) {
  const rasio = kontras(depan, belakang);
  const ambang = besar ? AA_BESAR : AA_KECIL;
  const lulus = rasio >= ambang;
  console.log(
    `${lulus ? '  ok  ' : ' GAGAL'} ${label.padEnd(46)} ${rasio.toFixed(2)}:1 (min ${ambang})`,
  );
  if (!lulus) gagal += 1;
}

/*
 * `border` sengaja TIDAK diuji dengan ambang 3:1. Ia dipakai untuk pemisah
 * dekoratif — tepi kartu, garis antar baris, garis bantu grafik — yang justru
 * harus resesif; 3:1 di sana akan membuat kerangka lebih berisik daripada
 * datanya. Yang menandai KONTROL adalah `borderKuat`, dan itu yang diuji 3:1
 * di atas. Jadi di sini `border` diperiksa dari sisi sebaliknya: tidak boleh
 * terlalu menonjol.
 */
const rasioGaris = kontras(c.border, c.surface);
console.log('\nGaris pemisah dekoratif harus tetap resesif');
console.log(
  `${rasioGaris < 2 ? '  ok  ' : ' GAGAL'} border vs surface ${rasioGaris.toFixed(2)}:1 (maks 2,0)`,
);
if (rasioGaris >= 2) gagal += 1;

console.log(gagal === 0 ? '\n✓ Semua pasangan lolos AA' : `\n✗ ${gagal} pasangan gagal`);
process.exit(gagal === 0 ? 0 : 1);
