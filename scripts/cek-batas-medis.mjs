/**
 * Memeriksa batas medis AI Coach dari DUA arah.
 *
 * Arah pertama jelas: pertanyaan dosis obat, resep, dan diagnosis harus
 * ditolak. Arah kedua justru yang lebih mudah rusak diam-diam: app ini
 * membicarakan protein, kalori, dan suplemen makanan sepanjang hari, jadi
 * pendeteksi yang terlalu bersemangat akan menolak pertanyaan wajar dan membuat
 * seluruh fitur coach tidak bisa dipakai. Positif palsu karena itu diuji
 * seketat negatif palsu.
 */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'batasmedis-'));
  for (const berkas of ['tipe.ts', 'batasMedis.ts']) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['batasMedis.ts', 'tipe.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'batasMedis.js'));
}

const { periksaBatasMedis, DISCLAIMER_COACH } = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

/** Harus DITOLAK, beserta kategori yang diharapkan. */
const DITOLAK = [
  ['Berapa dosis metformin untuk saya?', 'dosis-obat'],
  ['Saya harus minum obat diet berapa kali sehari?', 'dosis-obat'],
  ['Ozempic aman tidak buat saya?', 'dosis-obat'],
  ['Takaran testosteron yang biasa berapa?', 'dosis-obat'],
  ['Saya sedang pakai obat dari dokter, perlu ubah target tidak?', 'resep'],
  // Bentuk berakhiran ("obatnya", "dosisnya") justru yang paling sering diketik.
  ['Kapan saya boleh berhenti minum obatnya?', 'dosis-obat'],
  ['Dosisnya berapa ya?', 'dosis-obat'],
  // "perlu suntik" menanyakan APAKAH memakai, bukan berapa takarannya — dua
  // pertanyaan berbeda yang pantas dijawab penolakan berbeda.
  ['Apa saya perlu suntik sesuatu supaya cepat turun?', 'resep'],
  ['Saya sakit apa kalau berat turun terus?', 'diagnosis'],
  ['Apakah saya kena diabetes?', 'diagnosis'],
  ['Ini gejala apa ya?', 'diagnosis'],
  ['Tolong diagnosa kondisi saya dari data ini', 'diagnosis'],
];

console.log('\nHarus ditolak');
for (const [tanya, kategori] of DITOLAK) {
  const hasil = periksaBatasMedis(tanya);
  cek(
    `"${tanya}" → ${hasil ? hasil.kategori : 'TIDAK DITOLAK'}`,
    hasil !== null && hasil.kategori === kategori,
    hasil ? `pemicu: ${hasil.pemicu}` : '',
  );
}

/**
 * Harus TIDAK ditolak. Semuanya pertanyaan wajar di app pelacak gizi, dan
 * beberapa sengaja mengandung kata yang mirip pemicu.
 */
const DILOLOSKAN = [
  'Protein saya cukup belum?',
  'Berapa kalori sisa saya hari ini?',
  'Laju berat saya wajar tidak minggu ini?',
  'Kenapa pinggang naik padahal berat datar?',
  'Apakah saya perlu makan lebih banyak karbo sebelum latihan?',
  'Berapa gram protein per kg yang masuk akal untuk saya?',
  'Whey protein saya masukkan ke catatan gimana?',
  'Kreatin termasuk suplemen makanan kan?',
  'Evaluasi 4 minggu terakhir saya',
  'Saya ngantuk terus, apakah kalori saya terlalu rendah?',
  // "sobat" mengandung "obat"; batas kata harus menahannya.
  'Sobat saya juga pakai app ini, datanya bisa dibandingkan?',
];

console.log('\nHarus diloloskan');
for (const tanya of DILOLOSKAN) {
  const hasil = periksaBatasMedis(tanya);
  cek(`"${tanya}"`, hasil === null, hasil ? `DITOLAK sebagai ${hasil.kategori} (pemicu: ${hasil.pemicu})` : '');
}

console.log('\nBentuk penolakan');
const contoh = periksaBatasMedis('Berapa dosis metformin untuk saya?');
cek('penolakan menyebut alasannya', contoh.alasan.length > 60);
cek('penolakan menawarkan yang MASIH bisa dibantu', contoh.bisaDibantu.length >= 3);
cek(
  'penolakan menyebut pemicunya, jadi bisa diperiksa pengguna',
  typeof contoh.pemicu === 'string' && contoh.pemicu.length > 0,
);
cek(
  'tidak pernah menyebut angka dosis di dalam penolakannya sendiri',
  !/\b\d+\s?(mg|ml|iu)\b/i.test(`${contoh.judul} ${contoh.alasan} ${contoh.bisaDibantu.join(' ')}`),
);
cek(
  'nadanya tidak menghakimi',
  !/\b(bodoh|jangan bertanya|salah Anda|tidak boleh bertanya)\b/i.test(contoh.alasan),
);

console.log('\nPencocokan kata utuh');
cek(
  '"obat" di dalam "sobat" tidak memicu',
  periksaBatasMedis('Sobat saya pakai app yang sama') === null,
);
cek(
  '"obat" di dalam "pengobatan" tidak memicu lewat batas kata',
  periksaBatasMedis('Saya penasaran soal sejarah pengobatan') === null,
);
cek(
  'bentuk berakhiran tetap tertangkap',
  periksaBatasMedis('obatnya harus diminum berapa kali?') !== null,
);
cek(
  'huruf besar-kecil & tanda baca tidak mengubah hasil',
  periksaBatasMedis('BERAPA DOSIS METFORMIN?!') !== null &&
    periksaBatasMedis('berapa dosis metformin') !== null,
);
cek('pertanyaan kosong lolos', periksaBatasMedis('') === null);

console.log('\nDisclaimer');
cek(
  'disclaimer menyatakan coach bukan tenaga medis',
  /bukan tenaga medis/i.test(DISCLAIMER_COACH),
);
cek('disclaimer menyebut ke siapa harus bertanya', /dokter/i.test(DISCLAIMER_COACH));

console.log(gagal === 0 ? '\n✓ Semua pemeriksaan batas medis lulus' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
