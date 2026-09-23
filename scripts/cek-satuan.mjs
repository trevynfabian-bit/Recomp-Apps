/**
 * Memeriksa konversi satuan tampilan (metrik ⇄ imperial).
 *
 * Yang dijaga di sini bukan perkalian 2,54 — itu sulit disalahkan. Yang dijaga
 * adalah dua hal yang gampang salah dan efeknya tidak terlihat di layar:
 *
 *   1. Arah konversinya. `simpan*` mengalikan, `tampilkan*` membagi. Menukar
 *      keduanya menghasilkan tinggi 70 cm untuk orang 178 cm — angka yang tetap
 *      lolos semua rumus dan cuma salah 6,45 kali.
 *   2. Konversi ini TIDAK bolak-balik tanpa kehilangan. 85,4 cm tampil 33,6 in,
 *      dan 33,6 in kembali jadi 85,3 cm. Skrip ini MEMBUKTIKAN kehilangan itu
 *      ada, supaya alasan "nilai tampilan jangan pernah ditulis ke penyimpanan"
 *      berdiri di atas angka, bukan di atas kalimat.
 *
 * Batas tinggi & batas pinggang juga dibandingkan dengan CHECK di database:
 * batas yang hanya ada di satu sisi akan menolak di sisi lain dengan pesan yang
 * tidak bisa dibaca pengguna.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'satuan-'));
  copyFileSync('packages/logika/src/satuan.ts', join(kerja, 'satuan.ts'));
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['satuan.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'satuan.js'));
}

const {
  CM_PER_INCI,
  KG_PER_LB,
  labelBerat,
  labelPanjang,
  periksaBatasPinggang,
  periksaTinggi,
  RENTANG_BATAS_PINGGANG_CM,
  RENTANG_TINGGI_CM,
  simpanBerat,
  simpanPanjang,
  tampilkanBerat,
  tampilkanPanjang,
} = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('\nKonstanta definisi resmi');
cek('1 inci = 2,54 cm tepat', CM_PER_INCI === 2.54);
cek('1 lb = 0,45359237 kg tepat', KG_PER_LB === 0.45359237);

console.log('\nMetrik tidak disentuh');
cek('tampilkanPanjang metrik apa adanya', tampilkanPanjang(85.4, 'metrik') === 85.4);
cek('simpanPanjang metrik apa adanya', simpanPanjang(85.4, 'metrik') === 85.4);
cek('tampilkanBerat metrik dua desimal', tampilkanBerat(74.36, 'metrik') === 74.36);
cek('simpanBerat metrik dua desimal', simpanBerat(74.36, 'metrik') === 74.36);

console.log('\nArah konversi — yang paling mudah tertukar');
// 178 cm ÷ 2,54 = 70,08 in. Kalau arahnya tertukar, hasilnya 452,1 in.
cek('178 cm tampil 70,1 in', tampilkanPanjang(178, 'imperial') === 70.1, '178 ÷ 2,54');
// 70 in × 2,54 = 177,8 cm. Kalau tertukar, hasilnya 27,6 cm.
cek('70 in disimpan 177,8 cm', simpanPanjang(70, 'imperial') === 177.8, '70 × 2,54');
// 74,36 kg ÷ 0,45359237 = 163,9 lb. Tertukar → 33,7 lb.
cek('74,36 kg tampil 163,9 lb', tampilkanBerat(74.36, 'imperial') === 163.9);
// 164 lb × 0,45359237 = 74,39 kg. Tertukar → 361,6 kg.
cek('164 lb disimpan 74,39 kg', simpanBerat(164, 'imperial') === 74.39);
cek(
  'tampilkan lalu simpan tidak saling membatalkan arahnya',
  simpanPanjang(tampilkanPanjang(178, 'imperial'), 'imperial') > 170,
  `178 → ${tampilkanPanjang(178, 'imperial')} in → ${simpanPanjang(tampilkanPanjang(178, 'imperial'), 'imperial')} cm`,
);

console.log('\nKehilangan pembulatan itu NYATA (dan itu sebabnya jangan bolak-balik)');
const bolakBalik = simpanPanjang(tampilkanPanjang(85.4, 'imperial'), 'imperial');
cek(
  `85,4 cm → ${tampilkanPanjang(85.4, 'imperial')} in → ${bolakBalik} cm`,
  bolakBalik !== 85.4 && Math.abs(bolakBalik - 85.4) <= 0.2,
  'selisihnya kecil tapi ADA; nilai tampilan tidak boleh ditulis balik',
);
// Bolak-balik berulang tidak boleh MENGHANYUT tanpa batas — kalau pun terjadi
// sekali, kesalahannya harus berhenti, bukan menumpuk tiap render.
let hanyut = 85.4;
for (let i = 0; i < 20; i += 1) {
  hanyut = simpanPanjang(tampilkanPanjang(hanyut, 'imperial'), 'imperial');
}
cek(
  `20× bolak-balik berhenti di ${hanyut} cm`,
  Math.abs(hanyut - 85.4) <= 0.2,
  'kesalahannya tidak menumpuk',
);

console.log('\nLabel satuan');
cek('metrik → cm & kg', labelPanjang('metrik') === 'cm' && labelBerat('metrik') === 'kg');
cek('imperial → in & lb', labelPanjang('imperial') === 'in' && labelBerat('imperial') === 'lb');

console.log('\nBatas tinggi & pinggang, dalam satuan pengguna sendiri');
cek('178 cm wajar', periksaTinggi(178, 'metrik') === null);
cek('17 cm ditolak', typeof periksaTinggi(17, 'metrik') === 'string');
cek('1780 cm ditolak', typeof periksaTinggi(1780, 'metrik') === 'string');
cek('tepat di batas bawah diterima', periksaTinggi(100, 'metrik') === null);
cek('tepat di batas atas diterima', periksaTinggi(250, 'metrik') === null);
cek('70 in wajar', periksaTinggi(70, 'imperial') === null);
cek('7 in ditolak', typeof periksaTinggi(7, 'imperial') === 'string');
{
  const pesan = periksaTinggi(7, 'imperial');
  cek(
    `pesan imperial menyebut inci, bukan cm — "${pesan}"`,
    pesan.includes('in') && !pesan.includes('cm'),
  );
  const pesanMetrik = periksaTinggi(17, 'metrik');
  cek(
    `pesan metrik menyebut cm — "${pesanMetrik}"`,
    pesanMetrik.includes('cm'),
  );
}
cek('batas pinggang 90 cm wajar', periksaBatasPinggang(90, 'metrik') === null);
cek('batas pinggang 9 cm ditolak', typeof periksaBatasPinggang(9, 'metrik') === 'string');
cek('batas pinggang 35 in wajar', periksaBatasPinggang(35, 'imperial') === null);

console.log('\nRentangnya sama dengan CHECK di database');
const migrasi = readFileSync('supabase/migrations/20260922002100_profil_tubuh.sql', 'utf8');
cek(
  `tinggi ${RENTANG_TINGGI_CM.min}–${RENTANG_TINGGI_CM.maks} cm ada di migrasi`,
  migrasi.includes(`tinggi_cm between ${RENTANG_TINGGI_CM.min} and ${RENTANG_TINGGI_CM.maks}`),
);
cek(
  `batas pinggang ${RENTANG_BATAS_PINGGANG_CM.min}–${RENTANG_BATAS_PINGGANG_CM.maks} cm ada di migrasi`,
  migrasi.includes(
    `batas_pinggang_cm between ${RENTANG_BATAS_PINGGANG_CM.min} and ${RENTANG_BATAS_PINGGANG_CM.maks}`,
  ),
);
const ukuran = readFileSync('supabase/migrations/20260922002000_body_measurements.sql', 'utf8');
cek(
  'batas pinggang memakai rentang yang sama dengan kolom pinggang di body_measurements',
  ukuran.includes(
    `pinggang_cm between ${RENTANG_BATAS_PINGGANG_CM.min} and ${RENTANG_BATAS_PINGGANG_CM.maks}`,
  ),
);

console.log();
if (gagal > 0) {
  console.error(`✗ ${gagal} pemeriksaan satuan GAGAL.`);
  process.exit(1);
}
console.log('✓ Konversi satuan benar arahnya, kehilangan pembulatannya terukur & tidak menghanyut, batasnya sejalan dengan database.');
