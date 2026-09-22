/**
 * Membuktikan rumus Navy di `@recomp/logika` benar-benar rumus Navy.
 *
 * Rumus ini ditulis dalam bentuk METRIK (logaritma dari cm). Bentuk yang paling
 * banyak diterbitkan justru versi INCI dengan konstanta yang sama sekali
 * berbeda angkanya. Keduanya seharusnya menghasilkan persen yang sama pada
 * tubuh yang sama — jadi versi inci dipakai di sini sebagai pembanding
 * independen. Kalau salah satu konstanta salah ketik, selisihnya langsung
 * terlihat; membandingkan implementasi dengan dirinya sendiri tidak akan
 * menangkap apa pun.
 *
 * Selain itu diperiksa pagar-pagarnya: masukan yang mustahil harus menghasilkan
 * `null` beserta alasannya, bukan angka yang kelihatan sah.
 */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

/**
 * Dua toleransi, karena kedua bentuk itu TIDAK identik secara aljabar: bentuk
 * inci adalah kecocokan log-linear terhadap bentuk hiperbolik 495/(…)−450, jadi
 * keduanya paling rapat di tengah rentang dan merenggang di ujung yang ekstrem.
 * Di proporsi tubuh yang wajar selisihnya harus kecil; di seluruh kisi termasuk
 * ujungnya, cukup longgar untuk perbedaan bentuk tapi jauh lebih ketat daripada
 * akibat satu konstanta salah ketik (yang menggeser hasil beberapa poin).
 *
 * Toleransi wanita lebih longgar daripada pria bukan karena dilonggarkan supaya
 * lulus, melainkan karena pasangan konstanta versi wanita memang berjarak lebih
 * jauh: selisihnya bergerak dari −0,48 sampai +0,17 poin di seluruh proporsi
 * wajar, terbesar pada tubuh tinggi. Kontrol negatif di bawah membuktikan
 * toleransi ini masih menangkap satu konstanta yang salah ketik.
 */
const TOLERANSI_WAJAR = { pria: 0.35, wanita: 0.55 };
const TOLERANSI_UJUNG = 0.8;

/** Rentang persen lemak yang dianggap proporsi tubuh wajar. */
const WAJAR = { bawah: 8, atas: 35 };

const CM_PER_INCI = 2.54;

/** Bentuk inci yang diterbitkan; pembanding independen untuk versi metrik. */
function navyInciPria(pinggangCm, leherCm, tinggiCm) {
  const p = pinggangCm / CM_PER_INCI;
  const l = leherCm / CM_PER_INCI;
  const t = tinggiCm / CM_PER_INCI;
  return 86.01 * Math.log10(p - l) - 70.041 * Math.log10(t) + 36.76;
}

function navyInciWanita(pinggangCm, pinggulCm, leherCm, tinggiCm) {
  const p = pinggangCm / CM_PER_INCI;
  const g = pinggulCm / CM_PER_INCI;
  const l = leherCm / CM_PER_INCI;
  const t = tinggiCm / CM_PER_INCI;
  return 163.205 * Math.log10(p + g - l) - 97.684 * Math.log10(t) - 78.387;
}

/**
 * Kompilasi modul bodyFat ke JS agar bisa dijalankan Node apa adanya.
 * Sumbernya disalin ke direktori sementara lebih dulu: `tsc` menolak argumen
 * berkas bila ada tsconfig.json di cwd (TS5112).
 */
function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'bodyfat-'));
  for (const berkas of ['tipe.ts', 'bodyFat.ts']) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['bodyFat.ts', 'tipe.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'bodyFat.js'));
}

const { estimasiBodyFatNavy, komposisiTubuh, KETIDAKPASTIAN_BF } = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

// --- 1. Paritas metrik vs inci, pria --------------------------------------
console.log('\nPria: bentuk metrik vs bentuk inci yang diterbitkan');
let priaWajar = 0;
let priaUjung = 0;
let rentangNegatif = 0;
for (const tinggiCm of [160, 170, 176, 185, 195]) {
  for (const leherCm of [34, 38.7, 43]) {
    for (const pinggangCm of [70, 85.4, 100, 115]) {
      const hasil = estimasiBodyFatNavy({ jenisKelamin: 'pria', tinggiCm, pinggangCm, leherCm });
      if (hasil.persen === null) continue;
      if (hasil.rentang.bawah < 0) rentangNegatif += 1;
      const beda = Math.abs(hasil.persen - navyInciPria(pinggangCm, leherCm, tinggiCm));
      priaUjung = Math.max(priaUjung, beda);
      if (hasil.persen >= WAJAR.bawah && hasil.persen <= WAJAR.atas) {
        priaWajar = Math.max(priaWajar, beda);
      }
    }
  }
}
cek(
  `proporsi wajar ${WAJAR.bawah}–${WAJAR.atas}%: selisih maksimum ${priaWajar.toFixed(3)} ≤ ${TOLERANSI_WAJAR.pria}`,
  priaWajar <= TOLERANSI_WAJAR.pria,
);
cek(
  `seluruh kisi termasuk ujung: selisih maksimum ${priaUjung.toFixed(3)} ≤ ${TOLERANSI_UJUNG}`,
  priaUjung <= TOLERANSI_UJUNG,
);

// --- 2. Paritas metrik vs inci, wanita ------------------------------------
console.log('\nWanita: bentuk metrik vs bentuk inci yang diterbitkan');
let wanitaWajar = 0;
let wanitaUjung = 0;
for (const tinggiCm of [150, 160, 168, 178]) {
  for (const leherCm of [30, 33, 36]) {
    for (const pinggangCm of [65, 75, 88, 100]) {
      for (const pinggulCm of [88, 95, 105]) {
        const hasil = estimasiBodyFatNavy({
          jenisKelamin: 'wanita', tinggiCm, pinggangCm, leherCm, pinggulCm,
        });
        if (hasil.persen === null) continue;
        if (hasil.rentang.bawah < 0) rentangNegatif += 1;
        const beda = Math.abs(hasil.persen - navyInciWanita(pinggangCm, pinggulCm, leherCm, tinggiCm));
        wanitaUjung = Math.max(wanitaUjung, beda);
        if (hasil.persen >= WAJAR.bawah && hasil.persen <= WAJAR.atas) {
          wanitaWajar = Math.max(wanitaWajar, beda);
        }
      }
    }
  }
}
cek(
  `proporsi wajar ${WAJAR.bawah}–${WAJAR.atas}%: selisih maksimum ${wanitaWajar.toFixed(3)} ≤ ${TOLERANSI_WAJAR.wanita}`,
  wanitaWajar <= TOLERANSI_WAJAR.wanita,
);
cek(
  `seluruh kisi termasuk ujung: selisih maksimum ${wanitaUjung.toFixed(3)} ≤ ${TOLERANSI_UJUNG}`,
  wanitaUjung <= TOLERANSI_UJUNG,
);

// --- 3. Pagar-pagar masukan mustahil --------------------------------------
console.log('\nPagar masukan');
const leherLebihBesar = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 176, pinggangCm: 38, leherCm: 40,
});
cek(
  'pinggang ≤ leher menghasilkan null + alasan + kurang "ukuran"',
  leherLebihBesar.persen === null &&
    /lebih besar dari lingkar leher/.test(leherLebihBesar.alasanKosong ?? '') &&
    leherLebihBesar.kurang === 'ukuran',
  leherLebihBesar.alasanKosong ?? 'tanpa alasan',
);

// Kekurangan yang BISA dilengkapi dari profil harus bisa dibedakan kode dari
// yang tidak — UI memakainya untuk memutuskan menawarkan tombol atau tidak.
const tanpaJenisKelamin = estimasiBodyFatNavy({
  jenisKelamin: null, tinggiCm: 176, pinggangCm: 85.4, leherCm: 38.7,
});
cek(
  'jenis kelamin null → kurang "jenis-kelamin"',
  tanpaJenisKelamin.persen === null && tanpaJenisKelamin.kurang === 'jenis-kelamin',
  tanpaJenisKelamin.alasanKosong ?? 'tanpa alasan',
);

const tinggiNull = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: null, pinggangCm: 85.4, leherCm: 38.7,
});
cek(
  'tinggi null → kurang "tinggi"',
  tinggiNull.persen === null && tinggiNull.kurang === 'tinggi',
  tinggiNull.alasanKosong ?? 'tanpa alasan',
);

const wanitaTanpaPinggul = estimasiBodyFatNavy({
  jenisKelamin: 'wanita', tinggiCm: 165, pinggangCm: 75, leherCm: 32,
});
cek(
  'wanita tanpa lingkar pinggul menghasilkan null + kurang "pinggul"',
  wanitaTanpaPinggul.persen === null &&
    /pinggul/.test(wanitaTanpaPinggul.alasanKosong ?? '') &&
    wanitaTanpaPinggul.kurang === 'pinggul',
  wanitaTanpaPinggul.alasanKosong ?? 'tanpa alasan',
);

const takMasukAkal = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 176, pinggangCm: 250, leherCm: 38,
});
cek(
  'hasil di luar rentang manusia ditolak dengan alasannya sendiri + kurang "ukuran"',
  takMasukAkal.persen === null &&
    /di luar rentang yang pernah terukur/.test(takMasukAkal.alasanKosong ?? '') &&
    takMasukAkal.kurang === 'ukuran',
  takMasukAkal.alasanKosong ?? 'tanpa alasan',
);

const tanpaTinggi = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 0, pinggangCm: 85, leherCm: 38,
});
cek(
  'tinggi 0 menghasilkan null + alasan + kurang "tinggi"',
  tanpaTinggi.persen === null &&
    /Tinggi badan/.test(tanpaTinggi.alasanKosong ?? '') &&
    tanpaTinggi.kurang === 'tinggi',
  tanpaTinggi.alasanKosong ?? 'tanpa alasan',
);

// --- 4. Rentang & kepekaan -------------------------------------------------
console.log('\nRentang, kepekaan, dan komposisi');
const nyata = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 176, pinggangCm: 85.4, leherCm: 38.7,
});
cek(
  `estimasi profil contoh = ${nyata.persen}%`,
  nyata.persen !== null && nyata.persen > 10 && nyata.persen < 25,
);
cek('hasil yang berhasil tidak menyisakan kurang', nyata.kurang === null);
cek(
  `rentang ±${KETIDAKPASTIAN_BF} poin (${nyata.rentang?.bawah}–${nyata.rentang?.atas})`,
  Math.abs((nyata.rentang?.bawah ?? 0) - (nyata.persen - KETIDAKPASTIAN_BF)) < 0.05 &&
    Math.abs((nyata.rentang?.atas ?? 0) - (nyata.persen + KETIDAKPASTIAN_BF)) < 0.05,
);

cek('rentang bawah tidak pernah negatif di seluruh kisi', rentangNegatif === 0,
  `${rentangNegatif} pelanggaran`);

// Jepitan di 0 baru menggigit di bawah 4%; cari kasus yang benar-benar memicunya.
const tipis = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 170, pinggangCm: 70, leherCm: 38.7,
});
cek(
  'estimasi sangat rendah tetap memberi rentang bawah 0, bukan negatif',
  tipis.persen !== null && tipis.persen < KETIDAKPASTIAN_BF && tipis.rentang.bawah === 0,
  `persen ${tipis.persen}% → bawah ${tipis.rentang?.bawah}%`,
);

const satuCmLebih = estimasiBodyFatNavy({
  jenisKelamin: 'pria', tinggiCm: 176, pinggangCm: 86.4, leherCm: 38.7,
});
const kepekaanNyata = Math.round((satuCmLebih.persen - nyata.persen) * 10) / 10;
cek(
  `kepekaan 1 cm pinggang = ${nyata.sensitivitasPinggang} poin`,
  nyata.sensitivitasPinggang !== null &&
    nyata.sensitivitasPinggang > 0 &&
    Math.abs(nyata.sensitivitasPinggang - kepekaanNyata) < 0.05,
  `dihitung ulang: ${kepekaanNyata}`,
);

const komposisi = komposisiTubuh(nyata.persen, 75);
cek(
  `komposisi 75 kg → ${komposisi.lemakKg} kg lemak + ${komposisi.bebasLemakKg} kg bebas lemak`,
  Math.abs(komposisi.lemakKg + komposisi.bebasLemakKg - 75) < 0.11,
);

// --- 5. Arah: pinggang turun harus menurunkan estimasi --------------------
console.log('\nArah estimasi');
const deret = [84.5, 84.8, 85.2, 85.4].map(
  (pinggangCm) =>
    estimasiBodyFatNavy({ jenisKelamin: 'pria', tinggiCm: 176, pinggangCm, leherCm: 38.7 }).persen,
);
cek(
  `pinggang naik → estimasi naik monoton (${deret.join(' → ')})`,
  deret.every((n, i) => i === 0 || n >= deret[i - 1]),
);

// --- 6. Kontrol negatif ---------------------------------------------------
// Membuktikan toleransi di atas bukan sekadar cukup longgar untuk apa saja:
// satu konstanta yang digeser sedikit pun harus langsung melewatinya.
console.log('\nKontrol negatif: konstanta salah ketik');
function navySalahKetik(pinggangCm, leherCm, tinggiCm) {
  // 0.19077 → 0.19177: satu digit, persis jenis salah ketik yang dicari.
  return 495 / (1.0324 - 0.19177 * Math.log10(pinggangCm - leherCm) + 0.15456 * Math.log10(tinggiCm)) - 450;
}
let maksSalah = 0;
for (const tinggiCm of [160, 176, 195]) {
  for (const pinggangCm of [75, 85.4, 100]) {
    const benar = estimasiBodyFatNavy({ jenisKelamin: 'pria', tinggiCm, pinggangCm, leherCm: 38.7 });
    if (benar.persen === null) continue;
    maksSalah = Math.max(
      maksSalah,
      Math.abs(navySalahKetik(pinggangCm, 38.7, tinggiCm) - navyInciPria(pinggangCm, 38.7, tinggiCm)),
    );
  }
}
cek(
  `konstanta meleset 0,001 menghasilkan selisih ${maksSalah.toFixed(3)} poin — di atas toleransi ${TOLERANSI_WAJAR.pria}`,
  maksSalah > TOLERANSI_WAJAR.pria,
);

console.log(gagal === 0 ? '\n✓ Semua pemeriksaan body fat lulus' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
