/**
 * Memeriksa hasil lab: posisi terhadap rentang rujukan, ringkasan, urutan
 * riwayat, data tiruan yang masuk akal, dan — yang paling penting — bahwa
 * app tidak MENAFSIRKAN hasil lab.
 *
 * Hasil lab dibaca coach sebagai konteks, bukan dasar diagnosis. Kata seperti
 * "tinggi", "rendah", "normal", atau "berbahaya" adalah tafsiran; app hanya
 * boleh menyebut posisi nilai terhadap rentang rujukan MILIK LAB.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const kerja = mkdtempSync(join(tmpdir(), 'lab-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['hasilLab.ts', 'pengingat.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const {
  posisiPenanda, ringkasHasilLab, kalimatRingkasanLab, kelompokkanPerTahun,
  uraiNilaiLab, uraiTanggalLab, periksaHasilLab, penandaDariTemplat, TEMPLAT_PANEL_LAB, PENANDA_KOSONG,
} = require(join(kerja, 'keluar', 'hasilLab.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
const p = (nilai, min, maks) => ({ nama: 'X', nilai, satuan: 'mg/dL', rujukanMin: min, rujukanMaks: maks });

console.log('Posisi terhadap rentang rujukan lab');
cek('di dalam', posisiPenanda(p(100, 70, 130)) === 'dalam rentang');
cek('tepat di batas bawah = di dalam', posisiPenanda(p(70, 70, 130)) === 'dalam rentang');
cek('tepat di batas atas = di dalam', posisiPenanda(p(130, 70, 130)) === 'dalam rentang');
cek('di bawah', posisiPenanda(p(69.9, 70, 130)) === 'di bawah rentang');
cek('di atas', posisiPenanda(p(130.1, 70, 130)) === 'di atas rentang');
cek('hanya batas atas (mis. LDL < 130)', posisiPenanda(p(138, null, 130)) === 'di atas rentang' && posisiPenanda(p(90, null, 130)) === 'dalam rentang');
cek('hanya batas bawah (mis. HDL > 40)', posisiPenanda(p(38, 40, null)) === 'di bawah rentang' && posisiPenanda(p(48, 40, null)) === 'dalam rentang');
cek('tanpa rujukan', posisiPenanda(p(5, null, null)) === 'tanpa rujukan');

console.log('\nRingkasan');
const hasil = { id: 'a', tanggal: '2026-09-03', nama: 'Profil lipid', laboratorium: null,
  penanda: [p(212, null, 200), p(138, null, 130), p(48, 40, null), p(130, null, 150)] };
const r = ringkasHasilLab(hasil);
cek('4 penanda, 2 di luar rentang', r.jumlahPenanda === 4 && r.diLuarRentang.length === 2);
cek('kalimat: di luar rentang rujukan lab', kalimatRingkasanLab(r) === '4 penanda, 2 di luar rentang rujukan lab');
cek('kalimat: semuanya di dalam', kalimatRingkasanLab(ringkasHasilLab({ ...hasil, penanda: [p(1, 0, 2)] })) === '1 penanda, semuanya di dalam rentang rujukan lab');
cek('kalimat: tanpa rujukan sama sekali', kalimatRingkasanLab(ringkasHasilLab({ ...hasil, penanda: [p(1, null, null)] })) === '1 penanda, tanpa rentang rujukan dari lab');
cek('kalimat: tanpa penanda', kalimatRingkasanLab(ringkasHasilLab({ ...hasil, penanda: [] })) === 'Belum ada penanda tercatat');

console.log('\nRiwayat per tahun');
const k = kelompokkanPerTahun([
  { ...hasil, id: '1', tanggal: '2025-12-10' },
  { ...hasil, id: '3', tanggal: '2026-09-03' },
  { ...hasil, id: '2', tanggal: '2026-06-14' },
]);
cek('tahun terbaru lebih dulu', k.map((x) => x.tahun).join() === '2026,2025');
cek('dalam satu tahun: terbaru lebih dulu', k[0].hasil.map((x) => x.id).join() === '3,2');
cek('kosong → tanpa kelompok', kelompokkanPerTahun([]).length === 0);

console.log('\nForm tambah: membaca angka & tanggal');
for (const [t, h] of [['5,3', 5.3], ['5.3', 5.3], ['245', 245], ['0,75', 0.75], ['2,345', 2.345], ['1,2345', null], ['-5', null], ['', null], ['abc', null]])
  cek(`nilai "${t}" → ${h}`, uraiNilaiLab(t) === h, `dapat ${uraiNilaiLab(t)}`);
for (const [t, h] of [['3/9/2026', '2026-09-03'], ['03-09-2026', '2026-09-03'], ['3.9.2026', '2026-09-03'], ['2026-09-03', '2026-09-03'], ['31/2/2026', null], ['2026/09/03', null], ['9/2026', null]])
  cek(`tanggal "${t}" → ${h}`, uraiTanggalLab(t) === h, `dapat ${uraiTanggalLab(t)}`);

console.log('\nForm tambah: pemeriksaan');
const HARI_INI = '2026-09-23';
const baris = (nama, nilai, satuan, min = '', maks = '') => ({ nama, nilai, satuan, rujukanMin: min, rujukanMaks: maks });
const sah = periksaHasilLab({ nama: ' Profil lipid ', tanggal: '3/9/2026', laboratorium: '', penanda: [
  baris('Kolesterol LDL', '138', 'mg/dL', '', '130'), baris('Kolesterol HDL', '48', 'mg/dL', '40', ''), { ...PENANDA_KOSONG },
] }, HARI_INI);
cek('isian sah: panel dirapikan, tanggal ISO, lab kosong → null', sah.sah && sah.hasil.nama === 'Profil lipid' && sah.hasil.tanggal === '2026-09-03' && sah.hasil.laboratorium === null);
cek('baris kosong diabaikan; rentang kosong → null', sah.sah && sah.hasil.penanda.length === 2 && sah.hasil.penanda[0].rujukanMin === null && sah.hasil.penanda[0].rujukanMaks === 130);
const kosong = periksaHasilLab({ nama: '', tanggal: '', laboratorium: '', penanda: [{ ...PENANDA_KOSONG }] }, HARI_INI);
cek('semua kosong: nama, tanggal, penanda diminta', !kosong.sah && kosong.galat.nama && kosong.galat.tanggal && kosong.galat.penanda);
const depan = periksaHasilLab({ nama: 'X', tanggal: '24/9/2026', laboratorium: '', penanda: [baris('A', '1', 'U')] }, HARI_INI);
cek('tanggal masa depan ditolak', !depan.sah && /masa depan/.test(depan.galat.tanggal));
cek('hari ini diterima', periksaHasilLab({ nama: 'X', tanggal: '23/9/2026', laboratorium: '', penanda: [baris('A', '1', 'U')] }, HARI_INI).sah);
const terbalik = periksaHasilLab({ nama: 'X', tanggal: '1/9/2026', laboratorium: '', penanda: [baris('A', '1', 'U', '10', '5')] }, HARI_INI);
cek('rentang terbalik ditolak di baris itu', !terbalik.sah && /Batas bawah lebih besar/.test(terbalik.galat.perPenanda[0].rentang));
const ganda = periksaHasilLab({ nama: 'X', tanggal: '1/9/2026', laboratorium: '', penanda: [baris('HbA1c', '5,3', '%'), baris('hba1c', '5,4', '%')] }, HARI_INI);
cek('penanda ganda (huruf besar-kecil sama) ditolak', !ganda.sah && /sudah ada/.test(ganda.galat.perPenanda[1].nama));
const tanpaSatuan = periksaHasilLab({ nama: 'X', tanggal: '1/9/2026', laboratorium: '', penanda: [baris('A', '1,5', '')] }, HARI_INI);
cek('satuan wajib', !tanpaSatuan.sah && tanpaSatuan.galat.perPenanda[0].satuan);
cek('templat hanya nama & satuan — tanpa rentang rujukan', TEMPLAT_PANEL_LAB.every((t) =>
  penandaDariTemplat(t.nama).every((p) => p.nama && p.satuan && p.nilai === '' && p.rujukanMin === '' && p.rujukanMaks === '')));
cek('templat tak dikenal → null', penandaDariTemplat('Tidak ada') === null);
const format = periksaHasilLab({ nama: 'X'.repeat(61), tanggal: 'kemarin', laboratorium: '', penanda: [baris('A', 'lima', 'U', 'a', 'b')] }, HARI_INI);
cek('format salah: panel terlalu panjang, tanggal, nilai, dan rentang', !format.sah && format.galat.nama && format.galat.tanggal
  && format.galat.perPenanda[0].nilai && format.galat.perPenanda[0].rujukanMin && format.galat.perPenanda[0].rujukanMaks);
const pesanForm = [kosong, depan, terbalik, ganda, tanpaSatuan, format].flatMap((h) => (h.sah ? [] : [
  h.galat.nama, h.galat.tanggal, h.galat.penanda, ...h.galat.perPenanda.flatMap((g) => (g ? Object.values(g) : [])),
])).filter(Boolean);
const pesanBernada = pesanForm.filter((t) => pelanggaranNada(t).length > 0 || /\b(tinggi|rendah|normal|berbahaya)\b/i.test(t));
cek(`${pesanForm.length} pesan form netral & tanpa tafsiran`, pesanForm.length >= 8 && pesanBernada.length === 0, pesanBernada.join(' | '));

console.log('\nData tiruan masuk akal');
const mock = readFileSync('src/mocks/hasilLab.ts', 'utf8');
const penandaMock = [...mock.matchAll(/\{ nama: '([^']+)', nilai: ([\d.]+), satuan: '([^']*)', rujukanMin: (null|[\d.]+), rujukanMaks: (null|[\d.]+) \}/g)];
cek(`${penandaMock.length} penanda terbaca dari data tiruan`, penandaMock.length >= 15);
const rusak = penandaMock.filter((m) => !m[3] || (m[4] !== 'null' && m[5] !== 'null' && Number(m[4]) > Number(m[5])));
cek('setiap penanda bersatuan dan rentangnya tidak terbalik', rusak.length === 0, rusak.map((m) => m[1]).join(', '));

console.log('\nTanpa tafsiran');
const TAFSIRAN = /\b(tinggi|rendah|normal|abnormal|buruk|baik|bahaya|berbahaya|sehat|risiko|waspada)\b/i;
const kalimat = [
  ...['dalam rentang', 'di bawah rentang', 'di atas rentang', 'tanpa rujukan'],
  kalimatRingkasanLab(r),
];
const src = ts.createSourceFile('l.tsx', readFileSync('app/hasil-lab.tsx', 'utf8') + '\n' + readFileSync('app/tambah-hasil-lab.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
(function jelajah(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
    const t = n.text.replace(/\s+/g, ' ').trim();
    if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
  }
  ts.forEachChild(n, jelajah);
})(src);
cek('layar punya kalimat untuk diperiksa', kalimat.length >= 8, `hanya ${kalimat.length}`);
const menafsir = kalimat.filter((t) => TAFSIRAN.test(t));
cek('tanpa kata tafsiran (tinggi/rendah/normal/berbahaya/…)', menafsir.length === 0, menafsir.join(' | '));
const bernada = kalimat.filter((t) => pelanggaranNada(t).length > 0);
cek('nada netral', bernada.length === 0, bernada.join(' | '));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan hasil lab lulus');
process.exit(gagal ? 1 : 0);
