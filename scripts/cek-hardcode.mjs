/**
 * Mencari nilai visual yang DITULIS LANGSUNG di layar & komponen, padahal
 * seharusnya datang dari token di src/theme (bab Desain 8.2–8.5).
 *
 * Nilai tertanam adalah titik yang lolos dari tiga hal sekaligus: tidak ikut
 * berganti saat mode terang/gelap berganti, tidak ikut diperiksa `cek:kontras`,
 * dan tidak ikut berubah saat token diubah. Setiap temuan dicetak dengan
 * `berkas:baris` dan saran token terdekat, jadi perbaikannya bisa langsung
 * dikerjakan tanpa membuka dokumen desain.
 *
 * Yang diperiksa: warna (heks, rgb/rgba/hsl, nama warna CSS), jarak
 * (gap/margin/padding), radius, ukuran huruf, tinggi baris, ukuran ikon, dan
 * aritmetika token (`spacing.md + 2`). Pengecualian dicatat di bawah beserta
 * alasannya — di sini, bukan di kode layar.
 */
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buatRingkasan } from './lib/ringkasan-cek.mjs';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Token (dibaca dari sumbernya, supaya saran selalu cocok dengan tema terkini)

/** Palet dikompilasi seperti di cek-kontras: colors.ts tidak bergantung pada apa pun. */
function muatPalet() {
  const kerja = mkdtempSync(join(tmpdir(), 'hardcode-'));
  copyFileSync('src/theme/colors.ts', join(kerja, 'colors.ts'));
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['colors.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'colors.js')).palet;
}

/** Heks (huruf besar) → jalur token semantik, dari kedua mode. */
function petaWarna(palet) {
  const peta = new Map();
  const jelajah = (objek, jalur) => {
    for (const [k, v] of Object.entries(objek)) {
      const j = `${jalur}.${k}`;
      if (typeof v === 'string') {
        if (!peta.has(v.toUpperCase())) peta.set(v.toUpperCase(), j);
      } else jelajah(v, j);
    }
  };
  // Peran semantik didahulukan; warna makro (nama domain) hanya bila tak ada peran.
  const { macro, macroTeks, ...peranGelap } = palet.gelap;
  const { macro: m2, macroTeks: mt2, ...peranTerang } = palet.terang;
  jelajah(peranGelap, 'colors');
  jelajah(peranTerang, 'colors');
  jelajah({ macro, macroTeks }, 'colors');
  jelajah({ macro: m2, macroTeks: mt2 }, 'colors');
  return peta;
}

/** `nama: angka` dari satu blok `export const <nama> = { ... }` di tokens.ts. */
function skalaAngka(teks, nama) {
  const blok = new RegExp(`export const ${nama} = \\{([\\s\\S]*?)\\n\\}`).exec(teks)?.[1] ?? '';
  return [...blok.matchAll(/^\s+(\w+): (\d+),/gm)].map((m) => [m[1], Number(m[2])]);
}

const TOKEN = readFileSync('src/theme/tokens.ts', 'utf8');
const SPACING = skalaAngka(TOKEN, 'spacing');
const RADIUS = skalaAngka(TOKEN, 'radius');
const IKON = skalaAngka(TOKEN, 'ukuranIkon');
const TIPO = [...TOKEN.matchAll(/^  (\w+): \{ fontSize: (\d+),/gm)].map((m) => [m[1], Number(m[2])]);
const WARNA = petaWarna(muatPalet());

/** Token dengan nilai paling dekat, mis. `spacing.md (12)`. */
function terdekat(skala, awalan, nilai) {
  const [nama, n] = skala.reduce((a, b) => (Math.abs(b[1] - nilai) < Math.abs(a[1] - nilai) ? b : a));
  return `${awalan}.${nama} (${n})`;
}

// ---------------------------------------------------------------------------
// Pengecualian (masing-masing dengan alasan)

// Tidak ada berkas yang dibebaskan seluruhnya. Pratinjau widget layar kunci
// (dulu dibebaskan) kini mengambil warnanya dari `layarKunci` di src/theme.
const BERKAS_BEBAS = [];
const BARIS_BEBAS = [
  { pola: /'transparent'/, alasan: 'bukan warna' },
];
const UKURAN_HURUF_BEBAS = [
  { berkas: 'src/components/Pemilih.tsx', alasan: 'angka PemilihAngka 52 pt: input yang bisa diketik, bukan HeroNumber; satu-satunya tempat' },
];
const UKURAN_BEBAS = [
  { berkas: 'app/arah-visual.tsx', alasan: 'layar acuan pengembang: contoh swatch & baris ukuran, bukan UI pengguna' },
];
const TINGGI_BARIS_BEBAS = [
  { berkas: 'src/components/Pemilih.tsx', alasan: 'tinggi baris angka 52 pt PemilihAngka (pasangan ukuran huruf di atas)' },
];

// ---------------------------------------------------------------------------
// Aturan

const NAMA_WARNA = 'white|black|red|green|blue|yellow|orange|purple|gray|grey|pink';
const ATURAN = [
  {
    nama: 'warna tertanam',
    // Warna diperiksa di SELURUH src (lib, hooks, dsb.) selain src/theme,
    // bukan hanya layar & komponen: warna di util grafik atau notifikasi
    // sama-sama lolos dari mode terang.
    luas: true,
    pola: new RegExp(`['"](#[0-9A-Fa-f]{3,8})['"]|\\b(rgba?|hsla?)\\(|['"](${NAMA_WARNA})['"]`, 'g'),
    saran: (m) => {
      const heks = m[1]?.toUpperCase();
      if (heks && WARNA.has(heks)) return `pakai ${WARNA.get(heks)}`;
      return 'pakai peran di colors (latar/permukaan/teks*/aksen/status.*); warna baru masuk palet + cek:kontras';
    },
  },
  {
    nama: 'tint tertanam',
    luas: true,
    pola: /\+ '([0-9A-Fa-f]{2})'/g,
    saran: () => "pakai tint(warna, 'pilih' | 'pill' | 'tepi' | …) dari src/theme",
  },
  {
    nama: 'jarak tertanam',
    pola: /\b(gap|rowGap|columnGap|margin\w*|padding\w*): (-?[1-9]\d*)\b/g,
    saran: (m) => `pakai ${terdekat(SPACING, 'spacing', Math.abs(Number(m[2])))} atau token ukuran`,
  },
  {
    // Lebar/tinggi/posisi tetap. 0 dan 1 (garis rambut) boleh; sisanya punya
    // nama di `ukuran` (src/theme/tokens.ts) supaya bisa ditelusuri & diubah.
    nama: 'ukuran tertanam',
    pola: /\b(width|height|minWidth|minHeight|maxWidth|maxHeight|top|left|right|bottom): (-?(?:[2-9]|[1-9]\d+))\b/g,
    bebas: UKURAN_BEBAS,
    saran: (m) => `beri nama di token ukuran (src/theme/tokens.ts) untuk ${m[1]}: ${m[2]}`,
  },
  {
    nama: 'radius tertanam',
    pola: /\b(border\w*Radius): (\d+)\b/g,
    saran: (m) => `pakai ${terdekat(RADIUS, 'radius', Number(m[2]))}`,
  },
  {
    nama: 'ukuran huruf tertanam',
    pola: /\bfontSize: (\d+)\b/g,
    bebas: UKURAN_HURUF_BEBAS,
    saran: (m) => `pakai ...${terdekat(TIPO, 'typography', Number(m[1]))}`,
  },
  {
    nama: 'tinggi baris tertanam',
    pola: /\blineHeight: (\d+)\b/g,
    bebas: TINGGI_BARIS_BEBAS,
    saran: () => 'hapus: setiap gaya typography sudah membawa lineHeight',
  },
  {
    nama: 'ukuran ikon tertanam',
    pola: /<Ionicons\b[^>]*\bsize=\{(\d+)\}/g,
    saran: (m) => `pakai ${terdekat(IKON, 'ukuranIkon', Number(m[1]))}`,
  },
  {
    nama: 'aritmetika token',
    pola: /\b(spacing|radius)\.\w+ [+-] \d+/g,
    saran: () => 'beri nama di token ukuran (src/theme/tokens.ts)',
  },
];

// ---------------------------------------------------------------------------

function berkasKode(dir, ekstensi) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? berkasKode(p, ekstensi) : ekstensi.test(p) ? [p] : [];
  });
}

const temuan = new Map(ATURAN.map((a) => [a.nama, []]));
const bukanBebas = (p) => !BERKAS_BEBAS.some((b) => b.berkas === p);
/** Layar & komponen: semua aturan. */
const berkasUi = new Set([...berkasKode('app', /\.tsx$/), ...berkasKode('src/components', /\.tsx$/)].filter(bukanBebas));
/** Sisa src (.ts/.tsx) di luar src/theme: hanya aturan `luas` (warna, tint). */
const berkasLuas = berkasKode('src', /\.tsx?$/).filter(
  (p) => !p.startsWith(join('src', 'theme')) && !berkasUi.has(p) && bukanBebas(p),
);
const berkas = [...berkasUi, ...berkasLuas];

for (const p of berkas) {
  readFileSync(p, 'utf8')
    .split('\n')
    .forEach((baris, i) => {
      const kode = baris.replace(/\/\/.*$/, '');
      if (/^\s*(\*|\/\*)/.test(kode)) return; // komentar blok
      for (const aturan of ATURAN) {
        if (aturan.bebas?.some((b) => b.berkas === p)) continue;
        if (!aturan.luas && !berkasUi.has(p)) continue;
        for (const m of kode.matchAll(aturan.pola)) {
          if (BARIS_BEBAS.some((b) => b.pola.test(kode))) continue;
          temuan.get(aturan.nama).push(`${p}:${i + 1}  ${m[0].trim()}  → ${aturan.saran(m)}`);
        }
      }
    });
}

const ringkasan = buatRingkasan('cek:hardcode');
ringkasan.bagian('Nilai tertanam');
console.log(`Nilai tertanam di ${berkasUi.size} berkas layar & komponen (+ warna di ${berkasLuas.length} berkas src lain)\n`);
let jumlahNilai = 0;
for (const [nama, daftar] of temuan) {
  console.log(`${daftar.length === 0 ? '✓' : '✗'} ${nama}${daftar.length ? ` (${daftar.length})` : ''}`);
  for (const t of daftar) console.log(`    ${t}`);
  ringkasan.catat(nama, daftar.length === 0, daftar.length);
  jumlahNilai += daftar.length;
}
process.exit(
  ringkasan.cetak({
    saran: `${jumlahNilai} nilai tertanam: ganti dengan token dari src/theme (lihat docs/desain/panduan-token.md).`,
  }),
);
