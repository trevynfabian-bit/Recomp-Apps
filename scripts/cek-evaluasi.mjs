/**
 * Memeriksa tabel keputusan evaluasi 4 mingguan.
 *
 * Yang paling mudah salah di logika bercabang seperti ini bukan satu cabang
 * tertentu, melainkan LUBANG di antaranya: kombinasi yang tidak pernah
 * dipikirkan dan jatuh ke `undefined`, atau rekomendasi yang kebetulan
 * bertentangan dengan fase yang sedang dijalankan. Karena itu seluruh ruang
 * kombinasi dijalankan (3 fase × 4 arah berat × 4 arah pinggang × 4 arah
 * kekuatan = 192), bukan beberapa contoh pilihan.
 */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'evaluasi-'));
  for (const berkas of ['tipe.ts', 'evaluasi.ts']) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['evaluasi.ts', 'tipe.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'evaluasi.js'));
}

const { evaluasi4Mingguan, PEKAN_EVALUASI } = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

const FASE = ['Lean Gain', 'Cut', 'Maintenance'];
const ARAH = ['naik', 'datar', 'turun', 'belum jelas'];

const semua = [];
for (const fase of FASE) {
  for (const arahBerat of ARAH) {
    for (const arahPinggang of ARAH) {
      for (const arahKekuatan of ARAH) {
        semua.push({
          input: { fase, arahBerat, arahPinggang, arahKekuatan, pekanData: PEKAN_EVALUASI },
          hasil: evaluasi4Mingguan({
            fase,
            arahBerat,
            arahPinggang,
            arahKekuatan,
            pekanData: PEKAN_EVALUASI,
          }),
        });
      }
    }
  }
}

console.log(`\nCakupan (${semua.length} kombinasi)`);
cek(
  'setiap kombinasi menghasilkan verdict lengkap — tanpa lubang',
  semua.every(
    ({ hasil }) =>
      hasil &&
      typeof hasil.kode === 'string' && hasil.kode.length > 0 &&
      typeof hasil.judul === 'string' && hasil.judul.length > 0 &&
      typeof hasil.ringkas === 'string' && hasil.ringkas.length > 0 &&
      typeof hasil.rekomendasi === 'string' && hasil.rekomendasi.length > 0 &&
      typeof hasil.penentu === 'string' && hasil.penentu.length > 0 &&
      ['rendah', 'sedang', 'tinggi'].includes(hasil.keyakinan),
  ),
);

const kode = [...new Set(semua.map((s) => s.hasil.kode))];
cek(`${kode.length} kode verdict berbeda terpakai`, kode.length >= 12, kode.join(', '));

cek(
  'kode tiap fase tidak pernah bocor ke fase lain',
  semua.every(({ input, hasil }) => {
    if (hasil.kode === 'data-kurang') return true;
    const awalan = { 'Lean Gain': 'lg-', Cut: 'cut-', Maintenance: 'mt-' }[input.fase];
    return hasil.kode.startsWith(awalan);
  }),
);

console.log('\nBatas keluaran coach');
cek(
  'tidak ada rekomendasi yang menyentuh dosis obat',
  semua.every(
    ({ hasil }) =>
      !/\b(obat|dosis|mg\b|suplemen resep|steroid)\b/i.test(
        `${hasil.judul} ${hasil.ringkas} ${hasil.rekomendasi}`,
      ),
  ),
);
cek(
  'nadanya deskriptif — tanpa kata menghakimi',
  semua.every(
    ({ hasil }) =>
      !/\b(gagal|malas|buruk sekali|tidak disiplin|salah Anda)\b/i.test(
        `${hasil.judul} ${hasil.ringkas} ${hasil.rekomendasi}`,
      ),
  ),
);

console.log('\nRekomendasi tidak boleh melawan fasenya sendiri');
// Saat Lean Gain, verdict "berat turun" tidak boleh menyuruh menurunkan kalori.
const lgTurun = semua.filter(
  (s) => s.input.fase === 'Lean Gain' && s.input.arahBerat === 'turun',
);
cek(
  `Lean Gain + berat turun (${lgTurun.length} kombinasi) → menaikkan kalori`,
  lgTurun.every((s) => /Naikkan target kalori/.test(s.hasil.rekomendasi)),
);
// Saat Cut, verdict "berat naik" tidak boleh menyuruh menaikkan kalori.
const cutNaik = semua.filter((s) => s.input.fase === 'Cut' && s.input.arahBerat === 'naik');
cek(
  `Cut + berat naik (${cutNaik.length} kombinasi) → tidak pernah menyuruh menaikkan kalori`,
  cutNaik.every((s) => !/naikkan target/i.test(s.hasil.rekomendasi)),
);

console.log('\nKasus yang menentukan');
const bersih = evaluasi4Mingguan({
  fase: 'Lean Gain', arahBerat: 'naik', arahPinggang: 'datar', arahKekuatan: 'naik', pekanData: 4,
});
cek(
  `lean gain bersih → "${bersih.judul}"`,
  bersih.kode === 'lg-bersih' && /Jangan ubah apa pun/.test(bersih.rekomendasi),
);

const lemak = evaluasi4Mingguan({
  fase: 'Lean Gain', arahBerat: 'naik', arahPinggang: 'naik', arahKekuatan: 'datar', pekanData: 4,
});
cek(
  `pinggang naik tanpa kekuatan → "${lemak.judul}"`,
  lemak.kode === 'lg-lemak-dominan',
);

// Berat DATAR bukan kegagalan kalau kekuatan naik — ini inti rekomposisi.
const rekomp = evaluasi4Mingguan({
  fase: 'Lean Gain', arahBerat: 'datar', arahPinggang: 'datar', arahKekuatan: 'naik', pekanData: 4,
});
cek(
  `berat datar + kekuatan naik → "${rekomp.judul}" (bukan stagnasi)`,
  rekomp.kode === 'lg-rekomposisi' && /hasil yang baik/.test(rekomp.rekomendasi),
);

const agresif = evaluasi4Mingguan({
  fase: 'Cut', arahBerat: 'turun', arahPinggang: 'turun', arahKekuatan: 'turun', pekanData: 4,
});
cek(
  `Cut + kekuatan turun → "${agresif.judul}" (kekuatan menang atas pinggang)`,
  agresif.kode === 'cut-terlalu-agresif',
);

console.log('\nKeyakinan');
cek(
  'empat pekan penuh & semua arah terbaca → tinggi',
  evaluasi4Mingguan({
    fase: 'Cut', arahBerat: 'turun', arahPinggang: 'turun', arahKekuatan: 'datar', pekanData: 4,
  }).keyakinan === 'tinggi',
);
cek(
  'satu sumbu belum jelas → turun ke sedang',
  evaluasi4Mingguan({
    fase: 'Cut', arahBerat: 'turun', arahPinggang: 'belum jelas', arahKekuatan: 'datar', pekanData: 4,
  }).keyakinan === 'sedang',
);
cek(
  'dua pekan data → rendah',
  evaluasi4Mingguan({
    fase: 'Cut', arahBerat: 'turun', arahPinggang: 'turun', arahKekuatan: 'datar', pekanData: 2,
  }).keyakinan === 'rendah',
);
const tanpaBerat = evaluasi4Mingguan({
  fase: 'Cut', arahBerat: 'belum jelas', arahPinggang: 'turun', arahKekuatan: 'naik', pekanData: 4,
});
cek(
  'arah berat belum terbaca → berhenti, bukan menebak',
  tanpaBerat.kode === 'data-kurang' && tanpaBerat.keyakinan === 'rendah',
);

console.log(gagal === 0 ? '\n✓ Semua pemeriksaan evaluasi lulus' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
