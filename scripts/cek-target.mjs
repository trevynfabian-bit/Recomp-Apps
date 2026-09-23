/**
 * Memeriksa form target harian per tipe hari: cara membaca angka, batas yang
 * sama dengan database, aturan lintas kolom, nada pesan, dan bahwa target
 * bawaan sendiri lolos aturan yang sama.
 *
 * Yang terakhir penting: form yang menolak angka bawaan app akan memaksa
 * pengguna "memperbaiki" target yang tidak pernah ia sentuh.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const kerja = mkdtempSync(join(tmpdir(), 'target-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['targetHarian.ts', 'pengingat.ts', 'redistribusi.ts', 'deteksiTipeHari.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const {
  uraiKalori, uraiGram, isianDariTarget, periksaTarget, isianBerubah, karboTersisaG, RENTANG_TARGET,
  susunMatriksTarget, urutanFaseJanggal, URUTAN_FASE_MATRIKS,
} = require(join(kerja, 'keluar', 'targetHarian.js'));
const { pelanggaranNada } = require(join(kerja, 'keluar', 'pengingat.js'));
const { redistribusiBasi, terapkanRedistribusi } = require(join(kerja, 'keluar', 'redistribusi.js'));
const { deteksiTipeHari, aturanDeteksiTipeHari } = require(join(kerja, 'keluar', 'deteksiTipeHari.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
const pesanSemua = [];
const periksa = (isian) => {
  const h = periksaTarget(isian);
  if (!h.sah) pesanSemua.push(...Object.values(h.galat));
  return h;
};

console.log('Membaca angka');
for (const [teks, harap] of [['2450', 2450], ['2.450', 2450], ['2 450', 2450], [' 3100 ', 3100], ['2,450', null], ['2450,5', null], ['', null], ['-2450', null], ['2e3', null], ['abc', null], ['123456', null]])
  cek(`kalori "${teks}" → ${harap}`, uraiKalori(teks) === harap, `dapat ${uraiKalori(teks)}`);
for (const [teks, harap] of [['72', 72], ['72,5', 72.5], ['72.5', 72.5], ['0', 0], ['72,55', null], ['7,2,5', null], ['-5', null], ['', null], ['1.000', null]])
  cek(`gram "${teks}" → ${harap}`, uraiGram(teks) === harap, `dapat ${uraiGram(teks)}`);

console.log('\nBatas sama dengan database');
const migrasi = readFileSync('supabase/migrations/20260922000100_log_harian_dan_target.sql', 'utf8');
const m = migrasi.match(/day_type_targets_kalori_masuk_akal check \(target_kalori between (\d+) and (\d+)\)/);
cek('CHECK kalori ditemukan di migrasi', m !== null);
if (m) cek(`rentang kalori = CHECK (${m[1]}–${m[2]})`, RENTANG_TARGET.kalori.min === Number(m[1]) && RENTANG_TARGET.kalori.maks === Number(m[2]));
cek('kolom gram numeric(6,1): satu desimal', /target_protein_g numeric\(6, 1\)/.test(migrasi) && uraiGram('1,25') === null);

const dasar = { kalori: '2450', protein: '165', lemak: '75', satFat: '22' };
const h0 = periksa(dasar);
cek('isian sah diterima', h0.sah && h0.nilai.target_kalori === 2450 && h0.nilai.target_protein_g === 165);
cek('karbo tersisa = (2450 − 165×4 − 75×9) / 4 → 278 g', h0.sah && h0.karboG === 278, JSON.stringify(h0));
cek('batas bawah kalori 800 sah', periksa({ ...dasar, kalori: '800', protein: '50', lemak: '20', satFat: '5' }).sah);
cek('799 kcal ditolak', !periksa({ ...dasar, kalori: '799', protein: '50', lemak: '20', satFat: '5' }).sah);
cek('8000 kcal sah', periksa({ ...dasar, kalori: '8000' }).sah);
cek('8001 kcal ditolak', !periksa({ ...dasar, kalori: '8001' }).sah);
cek('protein 0 sah (angka, bukan kosong)', periksa({ ...dasar, protein: '0' }).sah);
const salahKetik = periksa({ ...dasar, protein: '1650' });
cek('salah ketik protein 1650 g ditangkap', !salahKetik.sah && !!salahKetik.galat.protein);
const format = periksa({ kalori: '2450,5', protein: '72,55', lemak: 'tujuh', satFat: '22' });
cek('format salah: pesan per kolom', !format.sah && !!format.galat.kalori && !!format.galat.protein && !!format.galat.lemak && !format.galat.satFat,
  JSON.stringify(format));

console.log('\nAturan lintas kolom');
const satFat = periksa({ ...dasar, satFat: '80' });
cek('sat fat > lemak ditolak di kolom sat fat', !satFat.sah && !!satFat.galat.satFat && !satFat.galat.lemak);
cek('sat fat = lemak sah', periksa({ ...dasar, satFat: '75' }).sah);
// 250×4 + 150×9 = 2350 > 2000
const mustahil = periksa({ kalori: '2000', protein: '250', lemak: '150', satFat: '30' });
cek('protein + lemak melebihi kalori ditolak di kolom kalori', !mustahil.sah && /2\.350 kcal/.test(mustahil.galat.kalori ?? ''), JSON.stringify(mustahil));
cek('tepat pas (karbo 0) sah', periksa({ kalori: '2350', protein: '250', lemak: '150', satFat: '30' }).sah);
const kosong = periksa({ kalori: '', protein: '', lemak: '', satFat: '' });
cek('empat kolom kosong → empat pesan', !kosong.sah && Object.keys(kosong.galat).length === 4);
cek('karboTersisaG membulatkan ke bawah', karboTersisaG({ target_kalori: 2001, target_protein_g: 100, target_lemak_g: 50, batas_sat_fat_g: 10 }) === 287);

console.log('\nPerubahan');
const tersimpan = { target_kalori: 2450, target_protein_g: 72.5, target_lemak_g: 75, batas_sat_fat_g: 22 };
const isianAwal = isianDariTarget(tersimpan);
cek('isian dari target: desimal pakai koma', isianAwal.protein === '72,5' && isianAwal.kalori === '2450');
cek('isian awal tidak dihitung berubah', !isianBerubah(isianAwal, tersimpan));
cek('"2.450" sama dengan 2450 (bukan perubahan)', !isianBerubah({ ...isianAwal, kalori: '2.450' }, tersimpan));
cek('"72.5" sama dengan 72,5 (bukan perubahan)', !isianBerubah({ ...isianAwal, protein: '72.5' }, tersimpan));
cek('angka lain = perubahan', isianBerubah({ ...isianAwal, kalori: '2500' }, tersimpan));
cek('isian belum sah tetap dihitung berubah', isianBerubah({ ...isianAwal, kalori: '' }, tersimpan));

console.log('\nRedistribusi setelah target berubah');
const minggu = [
  { tanggal: '2026-09-21', namaTipeHari: 'Angkat Beban', targetKalori: 2850, targetProteinG: 180, terpakaiKalori: 2910 },
  { tanggal: '2026-09-24', namaTipeHari: 'Padel', targetKalori: 2950, targetProteinG: 175, terpakaiKalori: 0 },
  { tanggal: '2026-09-25', namaTipeHari: 'Beban+Lari', targetKalori: 3100, targetProteinG: 185, terpakaiKalori: 0 },
];
const redis = {
  opsi: 'sebar_rata', perluDipindah: 300, terserap: 300, tersisa: 0, dibatasiLantai: false, alasan: null,
  hari: [
    { tanggal: '2026-09-24', namaTipeHari: 'Padel', targetLama: 2950, targetBaru: 2800, selisih: -150, kenaLantai: false },
    { tanggal: '2026-09-25', namaTipeHari: 'Beban+Lari', targetLama: 3100, targetBaru: 2950, selisih: -150, kenaLantai: false },
  ],
};
cek('target tidak berubah → redistribusi tetap berlaku', !redistribusiBasi(redis, minggu));
const disunting = minggu.map((h) => (h.tanggal === '2026-09-25' ? { ...h, targetKalori: 3200 } : h));
cek('target hari mendatang disunting → redistribusi basi', redistribusiBasi(redis, disunting));
cek('tanpa pelepasan, target baru tertimpa angka lama (alasan aturan ini)',
  terapkanRedistribusi(disunting, redis).find((h) => h.tanggal === '2026-09-25').targetKalori === 2950);
const lampauBerubah = minggu.map((h) => (h.tanggal === '2026-09-21' ? { ...h, targetKalori: 2000 } : h));
cek('hari lampau bukan bagian redistribusi → tidak membuat basi', !redistribusiBasi(redis, lampauBerubah));
cek('tanpa redistribusi / abaikan → tidak basi', !redistribusiBasi(null, disunting) && !redistribusiBasi({ ...redis, opsi: 'abaikan' }, disunting));

console.log('\nMatriks tipe hari x fase');
const tMatriks = [
  { day_type_id: 'r', fase: 'Cut', target_kalori: 2000, target_protein_g: 175, target_lemak_g: 60, batas_sat_fat_g: 18 },
  { day_type_id: 'r', fase: 'Maintenance', target_kalori: 2300, target_protein_g: 150, target_lemak_g: 72, batas_sat_fat_g: 21 },
  { day_type_id: 'r', fase: 'Lean Gain', target_kalori: 2450, target_protein_g: 165, target_lemak_g: 75, batas_sat_fat_g: 22 },
  { day_type_id: 'p', fase: 'Cut', target_kalori: 2800, target_protein_g: 185, target_lemak_g: 68, batas_sat_fat_g: 19 },
  { day_type_id: 'p', fase: 'Maintenance', target_kalori: 2750, target_protein_g: 160, target_lemak_g: 80, batas_sat_fat_g: 24 },
];
const mtx = susunMatriksTarget([{ id: 'r', nama: 'Rest' }, { id: 'p', nama: 'Padel' }], tMatriks);
cek('kolom berurutan Cut → Maintenance → Lean Gain', JSON.stringify(mtx[0].sel.map((x) => x.fase)) === JSON.stringify(URUTAN_FASE_MATRIKS)
  && URUTAN_FASE_MATRIKS.join() === 'Cut,Maintenance,Lean Gain');
cek('sel berisi target absolut', mtx[0].sel[2].target.target_kalori === 2450 && mtx[0].sel[0].target.target_protein_g === 175);
cek('kombinasi tanpa target → kosong, tidak dipinjam dari fase lain', mtx[1].sel[2].target === null);
const janggal = urutanFaseJanggal(mtx);
cek('Cut di atas Maintenance terdeteksi', janggal.length === 1 && janggal[0].nama === 'Padel' && /Cut lebih tinggi dari Maintenance/.test(janggal[0].kalimat));
cek('urutan lazim tidak ditandai', !janggal.some((x) => x.nama === 'Rest'));
const mLg = susunMatriksTarget([{ id: 'r', nama: 'Rest' }], tMatriks.map((t) => (t.fase === 'Lean Gain' ? { ...t, target_kalori: 2200 } : t)));
cek('Maintenance di atas Lean Gain terdeteksi', /Maintenance lebih tinggi dari Lean Gain/.test(urutanFaseJanggal(mLg)[0]?.kalimat ?? ''));
const mockTeks = readFileSync('src/mocks/dailyLog.ts', 'utf8');
const semuaMock = [...mockTeks.matchAll(/day_type_id: '([^']+)', fase: '([^']+)', target_kalori: (\d+), target_protein_g: ([\d.]+), target_lemak_g: ([\d.]+), batas_sat_fat_g: ([\d.]+)/g)]
  .map((x) => ({ day_type_id: x[1], fase: x[2], target_kalori: +x[3], target_protein_g: +x[4], target_lemak_g: +x[5], batas_sat_fat_g: +x[6] }));
const tipeMock = [...new Set(semuaMock.map((t) => t.day_type_id))].map((id) => ({ id, nama: id }));
const mMock = susunMatriksTarget(tipeMock, semuaMock);
cek('target bawaan: matriks penuh 4 x 3', mMock.length === 4 && mMock.every((b) => b.sel.every((x) => x.target !== null)));
cek('target bawaan: tanpa urutan janggal', urutanFaseJanggal(mMock).length === 0, JSON.stringify(urutanFaseJanggal(mMock)));
for (const x of [...janggal, ...urutanFaseJanggal(mLg)]) cek(`nada: "${x.kalimat}"`, pelanggaranNada(`${x.kalimat} Periksa lagi bila tidak disengaja.`).length === 0);

console.log('\nKalimat aturan deteksi = perilaku deteksi');
const tipe = [
  { id: 'r', nama: 'Rest', auto_detect: true, is_default: true },
  { id: 'a', nama: 'Angkat Beban', auto_detect: true, is_default: false },
  { id: 'bl', nama: 'Beban+Lari', auto_detect: true, is_default: false },
  { id: 'p', nama: 'Padel', auto_detect: true, is_default: false },
  { id: 'k', nama: 'Yoga', auto_detect: false, is_default: false },
];
const w = (jenis) => ({ id: jenis, jenis, nama: jenis, sumber: 'hevy', mulai: '2026-09-22T06:00:00+07:00', durasi_menit: 60 });
// Tiap kalimat dibuktikan: workout yang digambarkannya menghasilkan tipe itu.
const bukti = [
  ['Beban+Lari', /angkat beban dan lari/, [w('angkat_beban'), w('lari')]],
  ['Angkat Beban', /angkat beban tanpa lari/, [w('angkat_beban')]],
  ['Padel', /padel tanpa angkat beban/, [w('padel')]],
  ['Rest', /tidak ada workout yang cocok/, [w('lainnya')]],
];
for (const [nama, pola, workouts] of bukti) {
  const dt = tipe.find((t) => t.nama === nama);
  cek(`${nama}: kalimat "${aturanDeteksiTipeHari(dt)}"`, pola.test(aturanDeteksiTipeHari(dt)));
  cek(`${nama}: deteksi pada workout yang digambarkan → ${nama}`, deteksiTipeHari(workouts, tipe).nama === nama);
}
cek('padel + angkat beban → bukan Padel (sesuai "tanpa angkat beban")', deteksiTipeHari([w('padel'), w('angkat_beban')], tipe).nama === 'Angkat Beban');
cek('tipe kustom: hanya manual', /manual/.test(aturanDeteksiTipeHari(tipe[4])));
cek('tipe bawaan dengan auto dimatikan: hanya manual',
  /manual/.test(aturanDeteksiTipeHari({ ...tipe[3], auto_detect: false })) && deteksiTipeHari([w('padel')], tipe.map((t) => (t.nama === 'Padel' ? { ...t, auto_detect: false } : t))).nama === 'Rest');
for (const dt of tipe) cek(`nada: ${dt.nama}`, pelanggaranNada(aturanDeteksiTipeHari(dt)).length === 0);

console.log('\nTarget bawaan lolos aturan yang sama');
const mock = readFileSync('src/mocks/dailyLog.ts', 'utf8');
const baris = [...mock.matchAll(/\{ id: '(tgt-[^']+)', day_type_id: '[^']+', fase: '[^']+', target_kalori: (\d+), target_protein_g: ([\d.]+), target_lemak_g: ([\d.]+), batas_sat_fat_g: ([\d.]+) \}/g)];
cek('12 baris target bawaan (4 tipe hari × 3 fase)', baris.length === 12, `dapat ${baris.length}`);
for (const b of baris) {
  const t = { target_kalori: +b[2], target_protein_g: +b[3], target_lemak_g: +b[4], batas_sat_fat_g: +b[5] };
  const h = periksaTarget(isianDariTarget(t));
  cek(`${b[1]} sah`, h.sah, JSON.stringify(h.galat ?? {}));
}

console.log('\nNada');
for (const p of new Set(pesanSemua)) cek(`netral: "${p.length > 70 ? `${p.slice(0, 67)}...` : p}"`, pelanggaranNada(p).length === 0, pelanggaranNada(p).join(', '));
// Kalimat di layar form, dibaca lewat parser TypeScript.
const sumber = ts.createSourceFile('t.tsx', readFileSync('app/target-harian.tsx', 'utf8') + '\n' + readFileSync('src/components/MatriksTarget.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const kalimat = [];
(function jelajah(n) {
  if (ts.isImportDeclaration(n)) return;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
    const t = n.text.replace(/\s+/g, ' ').trim();
    if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimat.push(t);
  }
  ts.forEachChild(n, jelajah);
})(sumber);
cek('layar form punya kalimat untuk diperiksa', kalimat.length >= 10, `hanya ${kalimat.length}`);
// Kalimat yang lahir dari perubahan target/fase di layar lain (Budget, Tren).
for (const berkas of ['app/(tabs)/budget.tsx', 'app/(tabs)/tren.tsx']) {
  const src = readFileSync(berkas, 'utf8');
  const temuan = [...src.matchAll(/'([^'\n]*(?:Target berubah|posisinya terbaca|digambar setelah)[^'\n]*)'|`([^`\n]*(?:Target berubah|posisinya terbaca|digambar setelah)[^`\n]*)`/g)]
    .map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, 'X'));
  cek(`${berkas}: kalimat perubahan ditemukan`, temuan.length >= 1, 'tidak ada');
  kalimat.push(...temuan);
}
for (const t of kalimat) cek(`netral: "${t.length > 70 ? `${t.slice(0, 67)}...` : t}"`, pelanggaranNada(t).length === 0, pelanggaranNada(t).join(', '));

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan target lulus');
process.exit(gagal ? 1 : 0);
