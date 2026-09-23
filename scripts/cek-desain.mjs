/**
 * Memeriksa dua prinsip desain PRD yang mudah rusak diam-diam:
 *
 * 1. SATU ANGKA UTAMA PER LAYAR. Angka raksasa (`HeroNumber`) paling banyak
 *    satu per layar, dan layar data wajib punya satu. Komponen tidak boleh
 *    membawa angka utamanya sendiri — kalau boleh, layar yang memakainya bisa
 *    berakhir dengan dua tanpa ada yang menyadarinya.
 * 2. DARK MODE DARI SATU PALET. Warna hanya dari `src/theme`; heks mentah di
 *    layar/komponen berarti warna yang lolos dari pemeriksaan kontras
 *    (`cek:kontras`) dan tidak ikut bila palet berubah. Pengecualian dicatat
 *    di sini dengan alasannya. Konfigurasi app juga harus gelap, supaya
 *    splash, latar sistem, dan papan ketik tidak berkedip terang.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
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

console.log('\nDark mode dari satu palet');
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
cek('app.json: userInterfaceStyle gelap', app.userInterfaceStyle === 'dark');
cek(`app.json: latar = colors.bg (${bg})`, Boolean(bg) && app.backgroundColor === bg && app.splash?.backgroundColor === bg);
const tataLetak = readFileSync('app/_layout.tsx', 'utf8');
cek('status bar terang di atas latar gelap', /<StatusBar style="light" \/>/.test(tataLetak));
cek('latar tiap layar dari colors.bg', /contentStyle: \{ backgroundColor: colors\.bg \}/.test(tataLetak));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan desain lulus');
process.exit(gagal ? 1 : 0);
