/**
 * Memeriksa pengingat & widget: nada netral, jam pagi, dan teks widget.
 *
 * Nada adalah syarat PRD yang paling mudah rusak diam-diam: satu kalimat
 * "melebihi target!" yang ditambahkan belakangan tidak memecahkan apa pun
 * kecuali kepercayaan pengguna. Jadi SETIAP teks yang bisa muncul di layar
 * kunci — untuk seluruh rentang angka — diperiksa di sini.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'widget-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const {
  formatJamMenit, geserJamTimbang, JAM_TIMBANG_BAWAAN, NOTIF_RINGKASAN, NOTIF_TIMBANG,
  pelanggaranNada, perluPengingatTimbang, RENTANG_JAM_TIMBANG, teksWidget,
} = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('Jam pengingat');
cek('bawaan 06.30', formatJamMenit(JAM_TIMBANG_BAWAAN) === '06.30');
cek('format dua digit', formatJamMenit(5 * 60 + 5) === '05.05');
cek('geser +15', geserJamTimbang(390, 15) === 405);
cek('tertahan di batas pagi (11.00)', geserJamTimbang(RENTANG_JAM_TIMBANG.maks, 15) === RENTANG_JAM_TIMBANG.maks);
cek('tertahan di batas bawah (04.00)', geserJamTimbang(RENTANG_JAM_TIMBANG.min, -15) === RENTANG_JAM_TIMBANG.min);

console.log('\nPengingat hanya bila terlewat');
cek('aktif & belum timbang → kirim', perluPengingatTimbang(true, false) === true);
cek('sudah timbang (dari sumber mana pun) → tidak dikirim', perluPengingatTimbang(true, true) === false);
cek('dimatikan → tidak dikirim', perluPengingatTimbang(false, false) === false);

console.log('\nNada netral');
{
  // Kontrol negatif: pemeriksanya menangkap nada menegur.
  cek('kontrol: "melebihi target!" tertangkap', pelanggaranNada('Kalori melebihi target!').join(',') === 'melebihi,!');
  cek('kontrol: "jangan lupa" tertangkap', pelanggaranNada('Jangan lupa timbang').includes('jangan'));
  cek('notifikasi timbang netral', pelanggaranNada(`${NOTIF_TIMBANG.judul} ${NOTIF_TIMBANG.isi}`).length === 0);
  cek('notifikasi ringkasan netral', pelanggaranNada(`${NOTIF_RINGKASAN.judul} ${NOTIF_RINGKASAN.isi}`).length === 0);

  const kasar = [];
  for (let k = -3000; k <= 4000; k += 37) {
    for (const p of [null, -40, 0, 0.4, 12.5, 180]) {
      for (const tampil of [true, false]) {
        const t = teksWidget({ sisaKalori: k, sisaProteinG: p, dihitungPada: null }, tampil);
        const semua = `${t.judul} ${t.baris1} ${t.baris2} ${t.aksesLabel}`;
        const v = pelanggaranNada(semua);
        if (v.length > 0 || /NaN|undefined|null|-\d/.test(semua)) kasar.push(`${k}/${p}: ${semua} [${v}]`);
      }
    }
  }
  cek('semua teks widget netral, tanpa angka negatif, untuk seluruh rentang', kasar.length === 0, kasar.slice(0, 2).join(' | '));
}

console.log('\nTeks widget');
{
  const t = teksWidget({ sisaKalori: 1120, sisaProteinG: 57, dihitungPada: null }, true);
  cek(`sisa: "${t.baris1}" / "${t.baris2}"`, t.baris1 === '1.120 kcal tersisa' && t.baris2 === '57 g protein lagi');
  const lewat = teksWidget({ sisaKalori: -120, sisaProteinG: 0, dihitungPada: null }, true);
  cek(`di atas target sebagai fakta: "${lewat.baris1}"`, lewat.baris1 === '120 kcal di atas target');
  cek('protein tercapai', lewat.baris2 === 'Protein tercapai');
  cek('protein berdesimal dibulatkan satu desimal', teksWidget({ sisaKalori: 1, sisaProteinG: 12.46, dihitungPada: null }, true).baris2 === '12,5 g protein lagi');
  const sembunyi = teksWidget({ sisaKalori: 1120, sisaProteinG: 57, dihitungPada: null }, false);
  cek('angka disembunyikan: tidak ada satu digit pun di layar kunci',
    !/\d/.test(`${sembunyi.judul} ${sembunyi.baris1} ${sembunyi.baris2} ${sembunyi.aksesLabel}`));
  cek('belum ada ringkasan', teksWidget({ sisaKalori: null, sisaProteinG: null, dihitungPada: null }, true).baris1 === 'Belum ada ringkasan');
}

console.log(gagal === 0 ? '\n✓ Pengingat & widget: nada netral di seluruh rentang, pengingat hanya bila terlewat' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
