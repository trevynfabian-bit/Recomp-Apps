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
  isianDariHasilLab, hasilLabSama, tulisNilaiLab, tulisRujukanLab, barisDataMentahLab, BATAS_PANJANG_LAB,
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

console.log('\nUbah entri: pulang-pergi isian');
const contoh = {
  id: 'x', tanggal: '2026-06-04', nama: 'Panel campuran', laboratorium: null,
  penanda: [
    { nama: 'HbA1c', nilai: 5.3, satuan: '%', rujukanMin: null, rujukanMaks: 5.7 },
    { nama: 'Kreatinin', nilai: 1, satuan: 'mg/dL', rujukanMin: 0.7, rujukanMaks: 1.3 },
    { nama: 'TSH', nilai: 2.345, satuan: 'mIU/L', rujukanMin: 0.4, rujukanMaks: 4 },
    { nama: 'Feritin', nilai: 0.75, satuan: 'µg/L', rujukanMin: null, rujukanMaks: null },
  ],
};
const isianContoh = isianDariHasilLab(contoh);
cek('isian: tanggal ditulis 4/6/2026', isianContoh.tanggal === '4/6/2026');
cek('isian: koma desimal, tanpa nol di belakang', isianContoh.penanda[0].nilai === '5,3' && isianContoh.penanda[1].nilai === '1' && isianContoh.penanda[2].nilai === '2,345');
cek('isian: rentang & lab kosong jadi teks kosong', isianContoh.penanda[3].rujukanMin === '' && isianContoh.laboratorium === '');
const balik = periksaHasilLab(isianContoh, '2026-09-23');
cek('diperiksa lagi → hasil yang sama persis', balik.sah && hasilLabSama(balik.hasil, contoh), JSON.stringify(balik.sah ? balik.hasil : balik.galat));
// Semua penanda di data tiruan ikut pulang-pergi.
const semuaMock = { id: 'm', tanggal: '2026-09-03', nama: 'Semua penanda tiruan', laboratorium: 'Lab klinik',
  penanda: [...readFileSync('src/mocks/hasilLab.ts', 'utf8').matchAll(/\{ nama: '([^']+)', nilai: ([\d.]+), satuan: '([^']*)', rujukanMin: (null|[\d.]+), rujukanMaks: (null|[\d.]+) \}/g)]
    .map((m, i) => ({ nama: `${m[1]} ${i}`, nilai: Number(m[2]), satuan: m[3], rujukanMin: m[4] === 'null' ? null : Number(m[4]), rujukanMaks: m[5] === 'null' ? null : Number(m[5]) })) };
const balikMock = periksaHasilLab(isianDariHasilLab(semuaMock), '2026-09-23');
cek(`${semuaMock.penanda.length} penanda tiruan pulang-pergi utuh`, balikMock.sah && hasilLabSama(balikMock.hasil, semuaMock));
const diubah = periksaHasilLab({ ...isianContoh, penanda: isianContoh.penanda.map((p, i) => (i === 0 ? { ...p, nilai: '5,4' } : p)) }, '2026-09-23');
cek('satu nilai diubah → tidak sama', diubah.sah && !hasilLabSama(diubah.hasil, contoh));

console.log('\nData tiruan masuk akal');
const mock = readFileSync('src/mocks/hasilLab.ts', 'utf8');
const penandaMock = [...mock.matchAll(/\{ nama: '([^']+)', nilai: ([\d.]+), satuan: '([^']*)', rujukanMin: (null|[\d.]+), rujukanMaks: (null|[\d.]+) \}/g)];
cek(`${penandaMock.length} penanda terbaca dari data tiruan`, penandaMock.length >= 15);
const rusak = penandaMock.filter((m) => !m[3] || (m[4] !== 'null' && m[5] !== 'null' && Number(m[4]) > Number(m[5])));
cek('setiap penanda bersatuan dan rentangnya tidak terbalik', rusak.length === 0, rusak.map((m) => m[1]).join(', '));

console.log('\nPanjang teks (sama dengan tabel lab_results)');
{
  const isi = (u = {}, up = {}) => ({ nama: 'Profil lipid', tanggal: '3/9/2026', laboratorium: '', ...u,
    penanda: [{ nama: 'LDL', nilai: '138', satuan: 'mg/dL', rujukanMin: '', rujukanMaks: '130', ...up }] });
  const B = BATAS_PANJANG_LAB;
  const lab81 = periksaHasilLab(isi({ laboratorium: 'x'.repeat(B.laboratorium + 1) }), '2026-09-23');
  const penanda61 = periksaHasilLab(isi({}, { nama: 'x'.repeat(B.penanda + 1) }), '2026-09-23');
  const satuan21 = periksaHasilLab(isi({}, { satuan: 'x'.repeat(B.satuan + 1) }), '2026-09-23');
  cek(`batas: panel ${B.panel}, laboratorium ${B.laboratorium}, penanda ${B.penanda}, satuan ${B.satuan}`,
    periksaHasilLab(isi({ laboratorium: 'x'.repeat(B.laboratorium) }, { nama: 'x'.repeat(B.penanda), satuan: 'x'.repeat(B.satuan) }), '2026-09-23').sah);
  cek('laboratorium terlalu panjang → pesan di kolomnya', !lab81.sah && /laboratorium paling panjang/.test(lab81.galat.laboratorium ?? ''));
  cek('penanda & satuan terlalu panjang → pesan per penanda', !penanda61.sah && !!penanda61.galat.perPenanda[0]?.nama && !satuan21.sah && !!satuan21.galat.perPenanda[0]?.satuan);
  const pesanPanjang = [lab81.galat.laboratorium, penanda61.galat.perPenanda[0]?.nama, satuan21.galat.perPenanda[0]?.satuan].filter(Boolean);
  cek('pesan panjang teks netral', pesanPanjang.every((t) => pelanggaranNada(t).length === 0), pesanPanjang.join(' | '));
  cek('form menampilkan galat laboratorium', /galat=\{tampil \? galat\.laboratorium : undefined\}/.test(readFileSync('app/tambah-hasil-lab.tsx', 'utf8')));
}

console.log('\nLabel data mentah');
cek('nilai ditulis apa adanya: 5,3 · 245 · 0,75 · 2,345',
  [[5.3, '5,3'], [245, '245'], [0.75, '0,75'], [2.345, '2,345']].every(([n, t]) => tulisNilaiLab(n) === t));
const tidakUtuh = penandaMock.filter((m) => uraiNilaiLab(tulisNilaiLab(Number(m[2]))) !== Number(m[2]));
cek('setiap nilai tiruan tidak dibulatkan saat ditampilkan', tidakUtuh.length === 0, tidakUtuh.map((m) => m[1]).join(', '));
cek('rujukan: "13–17", "maks 200", "min 40", tanpa → null',
  tulisRujukanLab(p(1, 13, 17)) === '13–17' && tulisRujukanLab(p(1, null, 200)) === 'maks 200' &&
  tulisRujukanLab(p(1, 40, null)) === 'min 40' && tulisRujukanLab(p(1, null, null)) === null);
const mentah = barisDataMentahLab({ ...contoh, penanda: [...contoh.penanda, { nama: 'Hematokrit', nilai: 45, satuan: '%', rujukanMin: 40, rujukanMaks: 50 }] });
cek('satu baris per penanda, urutan seperti diisi', mentah.length === contoh.penanda.length + 1 && mentah.every((b, i) => b.nama === [...contoh.penanda.map((x) => x.nama), 'Hematokrit'][i]));
cek('nilai + satuan: "5,3%", "45%", "2,345 mIU/L"', mentah[0].nilai === '5,3%' && mentah[4].nilai === '45%' && mentah[2].nilai === '2,345 mIU/L', `${mentah[0].nilai} | ${mentah[4].nilai} | ${mentah[2].nilai}`);
cek('rujukan dan tanpa rujukan ditulis', mentah[2].rujukan === 'Rujukan lab 0,4–4' && mentah[3].rujukan === 'Tanpa rujukan dari lab', `${mentah[2].rujukan} | ${mentah[3].rujukan}`);
cek('pembaca layar: rentang dibaca "sampai", posisi disebut',
  mentah[2].aksesLabel === 'TSH: 2,345 mIU/L, rujukan lab 0,4 sampai 4, dalam rentang' && mentah[3].aksesLabel === 'Feritin: 0,75 µg/L, tanpa rujukan dari lab',
  `${mentah[2].aksesLabel} | ${mentah[3].aksesLabel}`);
const sumber = readFileSync('src/lib/sumber.ts', 'utf8');
cek('asal hasil lab: manual (data mentah), bukan estimasi', /SUMBER_HASIL_LAB[^=]*=\s*\{\s*jenis: 'manual'/.test(sumber));
for (const layar of ['app/hasil-lab.tsx', 'app/tambah-hasil-lab.tsx']) {
  const isi = readFileSync(layar, 'utf8');
  cek(`${layar}: penanda sumber memakai SUMBER_HASIL_LAB`, /<PenandaSumber jenis=\{SUMBER_HASIL_LAB\.jenis\} detail=\{SUMBER_HASIL_LAB\.detail\}/.test(isi) && !/jenis="estimasi"/.test(isi));
}

console.log('\nTanpa tafsiran');
const TAFSIRAN = /\b(tinggi|rendah|normal|abnormal|buruk|baik|bahaya|berbahaya|sehat|risiko|waspada)\b/i;
const kalimat = [
  ...['dalam rentang', 'di bawah rentang', 'di atas rentang', 'tanpa rujukan'],
  kalimatRingkasanLab(r),
  ...barisDataMentahLab(contoh).flatMap((b) => [b.rujukan, b.aksesLabel]),
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
