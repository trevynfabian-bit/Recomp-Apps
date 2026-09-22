/**
 * Memeriksa aritmetika riwayat perubahan ukuran (`ringkasPerubahan`).
 *
 * Yang dijaga di sini bukan rumus rumit, melainkan hal-hal yang paling mudah
 * salah dan paling sulit terlihat di layar: urutan tanggal yang tidak terjamin,
 * selang yang panjangnya berbeda-beda, pembulatan ke 0,1 cm, dan laju per pekan
 * yang harus menormalkan selang — bukan sekadar menyalin selisihnya.
 */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'ukuran-'));
  for (const berkas of ['tipe.ts', 'ukuran.ts']) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['ukuran.ts', 'tipe.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'ukuran.js'));
}

const { ringkasPerubahan, lajuTerkini, statusBatasPinggang, HARI_PER_PEKAN } = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

/** Deret pinggang tiruan: empat pencatatan mingguan. */
const MINGGUAN = [
  { tanggal: '2026-09-01', nilai: 84.5 },
  { tanggal: '2026-09-08', nilai: 84.8 },
  { tanggal: '2026-09-15', nilai: 85.2 },
  { tanggal: '2026-09-22', nilai: 85.4 },
];

console.log('\nDeret mingguan rapi');
const r = ringkasPerubahan(MINGGUAN);
cek('tiga selang dari empat titik', r.perubahan.length === 3);
cek(
  `selisih tiap selang ${r.perubahan.map((p) => p.selisih).join(' / ')}`,
  JSON.stringify(r.perubahan.map((p) => p.selisih)) === JSON.stringify([0.3, 0.4, 0.2]),
);
cek(
  `total ${r.totalSelisih} cm dalam ${r.rentangHari} hari`,
  r.totalSelisih === 0.9 && r.rentangHari === 21,
);
cek(
  'total sama dengan jumlah tiap selang',
  Math.abs(r.perubahan.reduce((n, p) => n + p.selisih, 0) - r.totalSelisih) < 0.001,
);
cek(
  'selang tepat 7 hari → laju sama dengan selisihnya',
  r.perubahan.every((p) => p.jarakHari === HARI_PER_PEKAN && p.lajuPerPekan === p.selisih),
);

console.log('\nSelang tidak seragam');
const timpang = ringkasPerubahan([
  { tanggal: '2026-09-01', nilai: 84.5 },
  { tanggal: '2026-09-04', nilai: 84.8 }, // 3 hari, +0,3
  { tanggal: '2026-09-18', nilai: 85.4 }, // 14 hari, +0,6
]);
const [cepat, lambat] = timpang.perubahan;
cek(
  `+0,3 cm dalam 3 hari → laju ${cepat.lajuPerPekan} cm/pekan`,
  cepat.selisih === 0.3 && cepat.jarakHari === 3 && cepat.lajuPerPekan === 0.7,
);
cek(
  `+0,6 cm dalam 14 hari → laju ${lambat.lajuPerPekan} cm/pekan`,
  lambat.selisih === 0.6 && lambat.jarakHari === 14 && lambat.lajuPerPekan === 0.3,
);
cek(
  'selisih lebih besar bisa berarti laju lebih kecil',
  lambat.selisih > cepat.selisih && lambat.lajuPerPekan < cepat.lajuPerPekan,
);

console.log('\nUrutan, pembulatan, dan kasus tepi');
const acak = ringkasPerubahan([
  { tanggal: '2026-09-15', nilai: 85.2 },
  { tanggal: '2026-09-01', nilai: 84.5 },
  { tanggal: '2026-09-08', nilai: 84.8 },
]);
cek(
  'titik tak berurut diurutkan lebih dulu',
  acak.awal.tanggal === '2026-09-01' && acak.akhir.tanggal === '2026-09-15' &&
    JSON.stringify(acak.perubahan.map((p) => p.dari)) ===
      JSON.stringify(['2026-09-01', '2026-09-08']),
);

// 85,4 − 85,1 di JS = 0.29999999999999716; harus tampil 0,3 bukan 0,3000000000.
const pecahan = ringkasPerubahan([
  { tanggal: '2026-09-01', nilai: 85.1 },
  { tanggal: '2026-09-08', nilai: 85.4 },
]);
cek(
  `selisih floating point dibulatkan (${pecahan.perubahan[0].selisih})`,
  pecahan.perubahan[0].selisih === 0.3,
  `mentah ${85.4 - 85.1}`,
);

const satu = ringkasPerubahan([{ tanggal: '2026-09-01', nilai: 84.5 }]);
cek(
  'satu titik: tidak ada selang dan tidak ada total palsu',
  satu.perubahan.length === 0 && satu.totalSelisih === null && satu.rentangHari === null &&
    satu.awal.tanggal === '2026-09-01',
);

const kosong = ringkasPerubahan([]);
cek(
  'tanpa titik: semuanya null, bukan lemparan',
  kosong.perubahan.length === 0 && kosong.totalSelisih === null && kosong.awal === null,
);

const turun = ringkasPerubahan([
  { tanggal: '2026-09-01', nilai: 85.4 },
  { tanggal: '2026-09-08', nilai: 84.9 },
]);
cek(
  `arah turun memberi selisih negatif (${turun.perubahan[0].selisih})`,
  turun.perubahan[0].selisih === -0.5 && turun.totalSelisih === -0.5,
);

console.log('\nLaju terkini');
cek(
  `empat pencatatan mingguan naik 0,9 cm dalam 21 hari → ${lajuTerkini(MINGGUAN)} cm/pekan`,
  lajuTerkini(MINGGUAN) === 0.3,
);
// Satu pekan yang aneh tidak boleh mengubah kesimpulan seluruhnya.
const berisik = [
  { tanggal: '2026-09-01', nilai: 84.5 },
  { tanggal: '2026-09-08', nilai: 84.8 },
  { tanggal: '2026-09-15', nilai: 86.2 }, // meteran bergeser
  { tanggal: '2026-09-22', nilai: 85.4 },
];
const selangTerakhir = ringkasPerubahan(berisik).perubahan.at(-1).lajuPerPekan;
cek(
  `satu pekan aneh: selang terakhir ${selangTerakhir} vs laju terentang ${lajuTerkini(berisik)}`,
  selangTerakhir === -0.8 && lajuTerkini(berisik) === 0.3,
);
cek('satu titik saja → laju null', lajuTerkini([MINGGUAN[0]]) === null);

console.log('\nStatus batas pinggang');
const belum = statusBatasPinggang(85.4, null, 0.3);
cek('batas belum ditetapkan', belum.keadaan === 'belum-ditetapkan' && belum.selisihCm === null);

const lewat = statusBatasPinggang(86.4, 86, 0.3);
cek(
  `sudah lewat: selisih +${lewat.selisihCm} cm`,
  lewat.keadaan === 'lewat' && lewat.selisihCm === 0.4 && lewat.pekanLagi === 0,
);
cek('pas di batas dihitung sudah lewat', statusBatasPinggang(86, 86, 0.3).keadaan === 'lewat');

// Jarak yang SAMA, urgensi berbeda — inti dari memakai waktu, bukan jarak.
const dekatCepat = statusBatasPinggang(85.2, 86, 0.4);
const dekatPelan = statusBatasPinggang(85.2, 86, 0.1);
cek(
  `sisa 0,8 cm dengan laju 0,4 → ${dekatCepat.pekanLagi} pekan (mendekat)`,
  dekatCepat.keadaan === 'mendekat' && dekatCepat.pekanLagi === 2,
);
cek(
  `sisa 0,8 cm dengan laju 0,1 → ${dekatPelan.pekanLagi} pekan (aman)`,
  dekatPelan.keadaan === 'aman' && dekatPelan.pekanLagi === 8,
);

const lajuTurun = statusBatasPinggang(85.2, 86, -0.3);
cek(
  'laju turun tidak pernah "mendekat"',
  lajuTurun.keadaan === 'aman' && lajuTurun.pekanLagi === null,
);
cek(
  'laju datar juga tidak "mendekat"',
  statusBatasPinggang(85.9, 86, 0).keadaan === 'aman',
);
cek(
  'tanpa laju, jarak sedekat apa pun tetap "aman" — bukan tebakan',
  statusBatasPinggang(85.9, 86, null).keadaan === 'aman',
);

console.log(gagal === 0 ? '\n✓ Semua pemeriksaan riwayat ukuran lulus' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
