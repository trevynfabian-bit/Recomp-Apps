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
  susunMatriksTarget, urutanFaseJanggal, URUTAN_FASE_MATRIKS, rincianKaloriMakro, ISIAN_KOSONG,
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
// Target belum diisi (tipe hari baru): kosong bukan perubahan, satu kolom terisi sudah perubahan.
cek('belum diisi: isian kosong bukan perubahan', !isianBerubah(ISIAN_KOSONG, null));
cek('belum diisi: satu kolom terisi = perubahan', isianBerubah({ ...ISIAN_KOSONG, kalori: '2200' }, null));
cek('belum diisi: isian kosong ditolak dengan empat pesan', Object.keys(periksaTarget(ISIAN_KOSONG).galat ?? {}).length === 4);

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

console.log('\nPembagian kalori ke makro');
const r1 = rincianKaloriMakro({ target_kalori: 2450, target_protein_g: 165, target_lemak_g: 75, batas_sat_fat_g: 22 });
cek('protein 165 g = 660 kcal, lemak 75 g = 675 kcal, sisa karbo 1.115 kcal',
  r1.proteinKkal === 660 && r1.lemakKkal === 675 && r1.karboKkal === 1115, JSON.stringify(r1));
cek('persen menjumlah 100', r1.persen.protein + r1.persen.lemak + r1.persen.karbo === 100, JSON.stringify(r1.persen));
cek('persen 27 / 28 / 45', r1.persen.protein === 27 && r1.persen.lemak === 28 && r1.persen.karbo === 45, JSON.stringify(r1.persen));
const r2 = rincianKaloriMakro({ target_kalori: 2450, target_protein_g: 165, target_lemak_g: 85, batas_sat_fat_g: 22 });
cek('lemak +10 g memakan 90 kcal dari karbo', r1.karboKkal - r2.karboKkal === 90);
const r3 = rincianKaloriMakro({ target_kalori: 1000, target_protein_g: 200, target_lemak_g: 50, batas_sat_fat_g: 10 });
cek('protein + lemak melebihi kalori: karbo tidak negatif', r3.karboKkal === 0 && r3.persen.karbo === 0);

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
const sumber = ts.createSourceFile('t.tsx', readFileSync('app/target-harian.tsx', 'utf8') + '\n' + readFileSync('src/components/MatriksTarget.tsx', 'utf8') + '\n' + readFileSync('src/components/SheetSuntingTarget.tsx', 'utf8') + '\n' + readFileSync('src/components/PemilihTipeHari.tsx', 'utf8') + '\n' + readFileSync('app/(tabs)/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
  const temuan = [...src.matchAll(/'([^'\n]*(?:Target berubah|posisinya terbaca|digambar setelah|belum bisa dihitung|belum diisi)[^'\n]*)'|`([^`\n]*(?:Target berubah|posisinya terbaca|digambar setelah|belum bisa dihitung|belum diisi)[^`\n]*)`/g)]
    .map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, 'X'));
  cek(`${berkas}: kalimat perubahan ditemukan`, temuan.length >= 1, 'tidak ada');
  kalimat.push(...temuan);
}
for (const t of kalimat) cek(`netral: "${t.length > 70 ? `${t.slice(0, 67)}...` : t}"`, pelanggaranNada(t).length === 0, pelanggaranNada(t).join(', '));

console.log('\nAritmetika pasti (gram satu desimal)');
// Pecahan biner membuat 7,4 × 4 + 41,6 × 9 = 403,99999999999994: sisa karbo
// yang tepat 99 g terbaca 98 g, dan target yang TEPAT di batas ditolak form
// padahal diterima database (numeric).
cek('sisa karbo pasti: 800 kcal, P 7,4, L 41,6 → 99 g', karboTersisaG({ target_kalori: 800, target_protein_g: 7.4, target_lemak_g: 41.6, batas_sat_fat_g: 0 }) === 99,
  String(karboTersisaG({ target_kalori: 800, target_protein_g: 7.4, target_lemak_g: 41.6, batas_sat_fat_g: 0 })));
cek('sisa karbo pasti negatif: 800 kcal, P 14,8, L 83,2 → −2 g', karboTersisaG({ target_kalori: 800, target_protein_g: 14.8, target_lemak_g: 83.2, batas_sat_fat_g: 0 }) === -2);
cek('tepat di batas diterima: 1.084 kcal = P 0,1 × 4 + L 120,4 × 9', periksa({ kalori: '1084', protein: '0,1', lemak: '120,4', satFat: '10' }).sah);
cek('satu kcal di bawahnya ditolak', !periksa({ kalori: '1083', protein: '0,1', lemak: '120,4', satFat: '10' }).sah);
{
  // Sapuan: sisa karbo = hitungan bilangan bulat persepuluh untuk ribuan kombinasi.
  let beda = 0;
  for (let k = 800; k <= 3200; k += 7) for (let p = 0; p <= 2500; p += 37) for (let l = 0; l <= 1500; l += 23) {
    const pasti = Math.floor((k * 10 - p * 4 - l * 9) / 40);
    if (karboTersisaG({ target_kalori: k, target_protein_g: p / 10, target_lemak_g: l / 10, batas_sat_fat_g: 0 }) !== pasti) beda += 1;
  }
  cek('sapuan sisa karbo: sama dengan hitungan pasti', beda === 0, `${beda} beda`);
}

console.log('\nAPI target (muat_target / simpan_target)');
{
  const skema = readFileSync('supabase/migrations/20260922004600_skema_target_preferensi.sql', 'utf8');
  const dataTs = readFileSync('src/data/target.ts', 'utf8');
  const penyedia = readFileSync('src/state/target.tsx', 'utf8');
  // Setiap aturan CHECK target di tabel punya kalimatnya sendiri di app.
  const aturanSql = [...new Set([...skema.matchAll(/'(day_type_targets_[a-z_]+)',\s*\n?\s*'check/g)].map((x) => x[1]))];
  aturanSql.push('day_type_targets_kalori_masuk_akal');
  cek(`${aturanSql.length} aturan CHECK target ditemukan di migrasi`, aturanSql.length >= 6, aturanSql.join(', '));
  const tanpaPesan = aturanSql.filter((a) => !new RegExp(`^\\s*${a}:`, 'm').test(dataTs));
  cek('setiap aturan tabel punya pesan di @/data/target', tanpaPesan.length === 0, tanpaPesan.join(', '));
  // Pesan rentang dibangun dari RENTANG_TARGET, bukan angka yang diketik ulang.
  cek('pesan rentang memakai RENTANG_TARGET', /RENTANG_TARGET\.protein\.maks/.test(dataTs) && !/antara 0 dan 500/.test(dataTs));
  const pesanData = [...dataTs.matchAll(/'([^'\n]{12,})'|`([^`\n]{12,})`/g)].map((x) => (x[1] ?? x[2]).replace(/\$\{[^}]*\}/g, 'X'))
    .filter((t) => /\s/.test(t) && !/^(muat_target|simpan_target)$/.test(t));
  const bernada = pesanData.filter((t) => pelanggaranNada(t).length > 0);
  cek(`${pesanData.length} pesan data target netral`, pesanData.length >= 8 && bernada.length === 0, bernada.join(' | '));
  const layarMuat = readFileSync('src/components/LayarMuatTarget.tsx', 'utf8');
  const kalimatMuat = [];
  (function jelajah(n) {
    if (ts.isImportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (/\s/.test(t) && /[a-z]{3}/i.test(t)) kalimatMuat.push(t);
    }
    ts.forEachChild(n, jelajah);
  })(ts.createSourceFile('m.tsx', layarMuat, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  cek('layar muat: kalimat netral', kalimatMuat.length >= 2 && kalimatMuat.every((t) => pelanggaranNada(t).length === 0), kalimatMuat.join(' | '));
  cek('penyedia memuat dari server hanya saat masuk & kredensial ada', /const pakaiServer = supabaseSiap && pengguna !== null;/.test(penyedia));
  cek('penyedia memakai baris dari server setelah simpan (bukan isian)', /hasil\.target/.test(penyedia));
  cek('layar muat punya Coba lagi & Keluar', /label="Coba lagi"/.test(layarMuat) && /label="Keluar"/.test(layarMuat));
  cek('muat berbatas waktu (tidak menunggu klien Supabase ±30 detik)', /dalamBatasWaktu\(muatTarget\(\), BATAS_MUAT_MS\)/.test(penyedia));
  cek('hasil muat yang berangkat sebelum simpanan dibuang', /if \(versi\.current !== versiAwal\) return;/.test(penyedia) && /versi\.current \+= 1;/.test(penyedia));
  cek('salinan di perangkat diperiksa bentuknya sebelum dipakai', /const adaSalinan = dataTargetSah\(salinan\);/.test(penyedia));
}

console.log(gagal ? `\n${gagal} pemeriksaan gagal` : '\nSemua pemeriksaan target lulus');
process.exit(gagal ? 1 : 0);
