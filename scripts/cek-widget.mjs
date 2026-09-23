/**
 * Memeriksa pengingat & widget: nada netral, jam pagi, dan teks widget.
 *
 * Nada adalah syarat PRD yang paling mudah rusak diam-diam: satu kalimat
 * "melebihi target!" yang ditambahkan belakangan tidak memecahkan apa pun
 * kecuali kepercayaan pengguna. Jadi SETIAP teks yang bisa muncul di layar
 * kunci — untuk seluruh rentang angka — diperiksa di sini.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
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
  isiWidgetLingkar, jamPengingatUntuk, MIN_TIMBANGAN_SARAN, pelanggaranNada, perluPengingatTimbang,
  RENTANG_JAM_TIMBANG, ringkasJadwal, saranJamTimbang, teksWidget, teksWidgetSebaris,
  siapkanWidget, BATAS_SEGAR_MS, KATALOG_NOTIFIKASI, jenisNotifikasiBawaan, ringkasJenisAktif,
  LANGKAH_JAM_MENIT, menitDariJamSql, jamSqlDariMenit, rencanaPengingatTimbang, HARI_JADWAL_PENGINGAT,
  gabungCopyNotifikasi, copySah,
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

console.log('\nJadwal hari kerja & akhir pekan');
{
  const jam = { hariKerjaMenit: 390, akhirPekanMenit: 480 };
  cek('Rabu memakai jam hari kerja', jamPengingatUntuk('2026-09-23', jam) === 390);
  cek('Sabtu & Minggu memakai jam akhir pekan',
    jamPengingatUntuk('2026-09-26', jam) === 480 && jamPengingatUntuk('2026-09-27', jam) === 480);
  cek('tanpa jam akhir pekan: Sabtu memakai jam hari kerja',
    jamPengingatUntuk('2026-09-26', { hariKerjaMenit: 390, akhirPekanMenit: null }) === 390);
  cek(`ringkasan: "${ringkasJadwal(jam)}"`, ringkasJadwal(jam) === 'Sen–Jum 06.30 · Sab–Min 08.00');
  cek('jam sama → "Setiap hari"', ringkasJadwal({ hariKerjaMenit: 390, akhirPekanMenit: 390 }) === 'Setiap hari 06.30');
}

console.log('\nSaran jam dari kebiasaan');
{
  // Waktu timbang WIB → UTC (−7 jam). Kebiasaan sekitar 06.40.
  const wib = (tgl, jam) => new Date(`${tgl}T${jam}:00+07:00`).toISOString();
  const kebiasaan = ['06:32', '06:41', '06:38', '06:45', '06:40', '06:36', '06:44'].map((j, i) => wib(`2026-09-${10 + i}`, j));
  const s1 = saranJamTimbang(kebiasaan);
  cek(`median 06.40 → saran SESUDAH kebiasaan (07.00): ${s1 && formatJamMenit(s1.saranMenit)}`,
    s1?.kebiasaanMenit === 400 && s1?.saranMenit === 420 && s1?.dasar === 7);
  const pencilan = saranJamTimbang([...kebiasaan, wib('2026-09-20', '10:30'), wib('2026-09-21', '10:45')]);
  cek('dua pagi yang sangat telat tidak menggeser saran (median, bukan rata-rata)', pencilan?.saranMenit === 420);
  const malam = saranJamTimbang([...kebiasaan, wib('2026-09-22', '21:00')]);
  cek('timbangan malam diabaikan (di luar rentang pagi)', malam?.dasar === 7);
  cek(`kurang dari ${MIN_TIMBANGAN_SARAN} timbangan → tanpa saran`, saranJamTimbang(kebiasaan.slice(0, 4)) === null);
  const lambat = saranJamTimbang(['10:50', '10:55', '10:52', '10:58', '10:51'].map((j, i) => wib(`2026-09-${10 + i}`, j)));
  cek('saran tertahan di batas pagi (11.00)', lambat?.saranMenit === RENTANG_JAM_TIMBANG.maks);
}

console.log('\nCopy notifikasi dari server (diperiksa ulang di perangkat)');
{
  const dasar = KATALOG_NOTIFIKASI.find((n) => n.jenis === 'timbang');
  const baru = { ...dasar, isi: 'Setelah bangun, sebelum sarapan. Satu ketukan untuk mencatat.' };
  const g = gabungCopyNotifikasi([baru]);
  cek('kalimat server yang netral dipakai', g.find((n) => n.jenis === 'timbang').isi === baru.isi);
  cek('jenis lain tetap kalimat terbundel', g.find((n) => n.jenis === 'ringkasan').isi === NOTIF_RINGKASAN.isi);
  for (const [nama, isi] of [
    ['menegur', 'Berat Anda melebihi target'],
    ['tanda seru', 'Timbang sekarang!'],
    ['membawa angka', 'Kemarin 74,5 kg.'],
    ['terlalu panjang', 'x'.repeat(151)],
  ]) {
    cek(`kalimat server ${nama} → kalimat terbundel`,
      gabungCopyNotifikasi([{ ...dasar, isi }]).find((n) => n.jenis === 'timbang').isi === dasar.isi);
  }
  cek('jenis yang tidak dikenal diabaikan', gabungCopyNotifikasi([{ ...dasar, jenis: 'promo' }]).length === KATALOG_NOTIFIKASI.length);
  cek('seluruh katalog terbundel lolos aturan yang sama dengan CHECK database', KATALOG_NOTIFIKASI.every(copySah));
  const r = rencanaPengingatTimbang({ aktif: true, jadwal: { hariKerjaMenit: 390, akhirPekanMenit: null }, hariIni: '2026-09-23',
    sekarang: new Date('2026-09-23T05:00:00+07:00'), sudahTimbangHariIni: false, copy: { judul: baru.judul, isi: baru.isi } });
  cek('rencana memakai kalimat server bila diberikan', r.every((x) => x.isi === baru.isi));
}

console.log('\nRencana notifikasi timbang pagi');
{
  const jadwal = { hariKerjaMenit: 390, akhirPekanMenit: 480 };
  // Rabu 23 September 2026, 05.00 WIB — sebelum jam pengingat.
  const subuh = new Date('2026-09-23T05:00:00+07:00');
  const r = rencanaPengingatTimbang({ aktif: true, jadwal, hariIni: '2026-09-23', sekarang: subuh, sudahTimbangHariIni: false });
  cek(`${r.length} notifikasi, satu per tanggal, ${HARI_JADWAL_PENGINGAT} hari`,
    r.length === HARI_JADWAL_PENGINGAT && new Set(r.map((x) => x.id)).size === r.length);
  cek(`hari ini 06.30 WIB = ${r[0].waktu}`, r[0].id === 'timbang-2026-09-23' && r[0].waktu === '2026-09-22T23:30:00.000Z');
  const sabtu = r.find((x) => x.tanggal === '2026-09-26');
  cek(`Sabtu memakai jam akhir pekan (08.00 WIB = ${sabtu?.waktu})`, sabtu?.waktu === '2026-09-26T01:00:00.000Z');
  cek('isi dari katalog (nada netral dijaga di satu tempat)', r.every((x) => x.judul === NOTIF_TIMBANG.judul && x.isi === NOTIF_TIMBANG.isi));
  const sudah = rencanaPengingatTimbang({ aktif: true, jadwal, hariIni: '2026-09-23', sekarang: subuh, sudahTimbangHariIni: true });
  cek('sudah timbang hari ini → hari ini dilewati, besok tetap', sudah[0].tanggal === '2026-09-24' && sudah.length === HARI_JADWAL_PENGINGAT - 1);
  const siang = rencanaPengingatTimbang({ aktif: true, jadwal, hariIni: '2026-09-23', sekarang: new Date('2026-09-23T09:00:00+07:00'), sudahTimbangHariIni: false });
  cek('jam hari ini sudah lewat → tidak dijadwalkan untuk masa lalu', siang[0].tanggal === '2026-09-24');
  cek('dimatikan → tidak ada rencana', rencanaPengingatTimbang({ aktif: false, jadwal, hariIni: '2026-09-23', sekarang: subuh, sudahTimbangHariIni: false }).length === 0);
  // Pergantian bulan & tahun tetap berurutan tanpa tanggal ganda.
  const akhirTahun = rencanaPengingatTimbang({ aktif: true, jadwal, hariIni: '2026-12-25', sekarang: new Date('2026-12-25T00:00:00+07:00'), sudahTimbangHariIni: false });
  cek('lintas tahun: 25 Des → 7 Jan', akhirTahun[0].tanggal === '2026-12-25' && akhirTahun.at(-1).tanggal === '2027-01-07');
  const lib = readFileSync('src/lib/notifikasi.ts', 'utf8');
  cek('penjadwal di perangkat memakai rencana, tanpa teks notifikasi sendiri',
    lib.includes('rencanaPengingatTimbang(') && lib.includes('title: r.judul, body: r.isi') && !/Timbang pagi|sebelum sarapan/.test(lib));
  cek('pembatalan hari ini memakai id yang sama dengan rencana', lib.includes('`timbang-${tanggalHariIni()}`'));
  cek('tanpa suara & tanpa lencana', lib.includes('shouldPlaySound: false') && lib.includes('sound: false') && lib.includes('allowBadge: false'));
}

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

console.log('\nKatalog notifikasi per jenis');
{
  const jenis = KATALOG_NOTIFIKASI.map((n) => n.jenis);
  cek(`${jenis.length} jenis, masing-masing sekali: ${jenis.join(', ')}`, new Set(jenis).size === jenis.length && jenis.length === 5);
  const menegur = KATALOG_NOTIFIKASI.filter((n) => pelanggaranNada(`${n.nama} ${n.kapan} ${n.judul} ${n.isi}`).length > 0);
  cek('nama, keterangan, judul, dan isi setiap jenis netral', menegur.length === 0, menegur.map((n) => n.jenis).join(', '));
  // Layar kunci terbaca tanpa kunci dibuka: isi notifikasi tidak membawa angka apa pun.
  const berangka = (n) => /\d/.test(`${n.judul} ${n.isi}`);
  const bocor = KATALOG_NOTIFIKASI.filter(berangka);
  cek('tidak ada angka di judul & isi notifikasi mana pun', bocor.length === 0, bocor.map((n) => `${n.jenis}: ${n.isi}`).join(' | '));
  cek('kontrol: isi yang membawa berat tertangkap', berangka({ judul: 'Timbang pagi', isi: 'Kemarin 74,5 kg.' }));
  cek('isi timbang & ringkasan diambil dari konstanta yang sama (satu sumber)',
    KATALOG_NOTIFIKASI.find((n) => n.jenis === 'timbang')?.isi === NOTIF_TIMBANG.isi &&
      KATALOG_NOTIFIKASI.find((n) => n.jenis === 'ringkasan')?.isi === NOTIF_RINGKASAN.isi);
  cek('hanya timbang yang memakai jam pengingat di pratinjau',
    KATALOG_NOTIFIKASI.every((n) => (n.waktuPratinjau === null) === (n.jenis === 'timbang')));
  const bawaan = jenisNotifikasiBawaan();
  cek('pengaturan awal mengikuti katalog', KATALOG_NOTIFIKASI.every((n) => bawaan[n.jenis] === n.bawaan));
  cek(`semua nyala: "${ringkasJenisAktif(bawaan)}"`, ringkasJenisAktif(bawaan) === 'Semua aktif');
  cek('dua dimatikan: "3 dari 5 jenis aktif"', ringkasJenisAktif({ ...bawaan, ukuran: false, sumber: false }) === '3 dari 5 jenis aktif');
  cek('semua dimatikan', ringkasJenisAktif(Object.fromEntries(jenis.map((j) => [j, false]))) === 'Semua dimatikan');
}

console.log('\nSkema settings_notifications sejalan dengan logika');
{
  const sql = readFileSync('supabase/migrations/20260922004200_preferensi_widget_pengingat.sql', 'utf8');
  const tanpaKolom = KATALOG_NOTIFIKASI.filter((n) => !new RegExp(`${n.jenis}_aktif boolean not null default ${n.bawaan}`).test(sql));
  cek('setiap jenis di katalog punya kolom <jenis>_aktif dengan bawaan yang sama', tanpaKolom.length === 0,
    tanpaKolom.map((n) => n.jenis).join(', '));
  const bawaan = /jam_timbang time not null default '(\d{2}:\d{2})'/.exec(sql);
  cek(`jam bawaan SQL ${bawaan?.[1]} = JAM_TIMBANG_BAWAAN`, bawaan && menitDariJamSql(bawaan[1]) === JAM_TIMBANG_BAWAAN);
  const rentang = /jam_timbang between time '(\d{2}:\d{2})' and time '(\d{2}:\d{2})'/.exec(sql);
  cek(`rentang SQL ${rentang?.[1]}–${rentang?.[2]} = RENTANG_JAM_TIMBANG`,
    rentang && menitDariJamSql(rentang[1]) === RENTANG_JAM_TIMBANG.min && menitDariJamSql(rentang[2]) === RENTANG_JAM_TIMBANG.maks);
  cek('kelipatan menit SQL = LANGKAH_JAM_MENIT', sql.includes(`% ${LANGKAH_JAM_MENIT} = 0`));
  cek('konversi jam bolak-balik', menitDariJamSql('06:30:00') === 390 && jamSqlDariMenit(390) === '06:30'
    && jamSqlDariMenit(menitDariJamSql('11:00')) === '11:00');
  cek('nada netral dikunci database (bukan sakelar)', /check \(notif_netral\)/.test(sql));
  const endp = readFileSync('supabase/migrations/20260922004400_endpoint_preferensi.sql', 'utf8');
  const boleh = /v_boleh text\[\] := array\[([^\]]*)\]/.exec(endp)?.[1].match(/'([a-z_]+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
  const harus = [...KATALOG_NOTIFIKASI.map((n) => `${n.jenis}_aktif`), 'jam_timbang', 'jam_timbang_akhir_pekan', 'widget_aktif'];
  cek('endpoint menerima tepat kolom katalog + jam + widget (tidak lebih, tidak kurang)',
    JSON.stringify([...boleh].sort()) === JSON.stringify([...harus].sort()), `${boleh} vs ${harus}`);
  cek('endpoint menolak notif_netral dengan kalimat', endp.includes("Nada netral bukan pengaturan"));
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

console.log('\nWidget sebaris & bundar');
{
  const r = { sisaKalori: 1120, sisaProteinG: 57, targetKalori: 3100, dihitungPada: null };
  cek(`sebaris: "${teksWidgetSebaris(r, true)}"`, teksWidgetSebaris(r, true) === '1.120 kcal · 57 g protein');
  cek('sebaris di atas target', teksWidgetSebaris({ ...r, sisaKalori: -120, sisaProteinG: 0 }, true) === '+120 kcal · protein tercapai');
  cek('sebaris tersembunyi = nama app saja', teksWidgetSebaris(r, false) === 'Recomp');
  const l = isiWidgetLingkar(r, true);
  cek(`bundar: ${l.angka} ${l.satuan}, terpakai ${l.terpakai.toFixed(3)}`, l.angka === '1.120' && Math.abs(l.terpakai - 1980 / 3100) < 1e-9);
  const lewat = isiWidgetLingkar({ ...r, sisaKalori: -500 }, true);
  cek('cincin berhenti di penuh saat di atas target (tidak "meluap")', lewat.terpakai === 1 && lewat.angka === '+500');
  cek('tanpa target: tanpa cincin', isiWidgetLingkar({ ...r, targetKalori: null }, true).terpakai === null);
  const tersembunyi = isiWidgetLingkar(r, false);
  cek('bundar tersembunyi: tanpa angka & tanpa cincin', !/\d/.test(tersembunyi.angka) && tersembunyi.terpakai === null);
  const kasar = [];
  for (let k = -3000; k <= 4000; k += 53) {
    for (const t of [true, false]) {
      const semua = `${teksWidgetSebaris({ ...r, sisaKalori: k }, t)} ${isiWidgetLingkar({ ...r, sisaKalori: k }, t).aksesLabel}`;
      if (pelanggaranNada(semua).length > 0 || /NaN|undefined/.test(semua)) kasar.push(semua);
    }
  }
  cek('sebaris & bundar netral di seluruh rentang', kasar.length === 0, kasar.slice(0, 2).join(' | '));
}

console.log('\nWidget saat data kosong');
{
  const hariIni = '2026-09-23';
  const target = { kalori: 3100, proteinG: 180 };
  const kemarin = { sisaKalori: 1120, sisaProteinG: 57, targetKalori: 3100, dihitungPada: '2026-09-22T12:00:00Z', tanggal: '2026-09-22' };
  const baru = siapkanWidget({ masuk: true, ringkasan: kemarin, target }, hariIni);
  // "Bocor" = angka kemarin terbaca di layar kunci hari ini.
  const bocor = (r) => /1\.120|57 g/.test(`${teksWidget(r, true).aksesLabel} ${teksWidgetSebaris(r, true)} ${isiWidgetLingkar(r, true).aksesLabel}`);
  cek('ringkasan kemarin → keadaan "hari-baru", tanpa sisa', baru.kosong === 'hari-baru' && baru.sisaKalori === null);
  cek('angka kemarin tidak pernah tampil sebagai hari ini', !bocor(baru));
  // Kontrol negatif: widget yang tidak memeriksa tanggal menampilkan angka kemarin.
  const { tanggal: _t, ...naif } = kemarin;
  cek('kontrol: tanpa pemeriksaan tanggal, angka kemarin tertangkap bocor', bocor(naif));
  const sekarang = siapkanWidget({ masuk: true, ringkasan: { ...kemarin, tanggal: hariIni }, target }, hariIni);
  cek('ringkasan hari ini diteruskan apa adanya', sekarang.kosong === undefined && sekarang.sisaKalori === 1120);
  const tanpaTargetRingkasan = siapkanWidget(
    { masuk: true, ringkasan: { ...kemarin, targetKalori: undefined, tanggal: hariIni }, target }, hariIni);
  cek('target cincin diambil dari target hari bila ringkasan tidak membawanya', tanpaTargetRingkasan.targetKalori === 3100);
  cek('belum masuk menang atas ringkasan apa pun',
    siapkanWidget({ masuk: false, ringkasan: { ...kemarin, tanggal: hariIni }, target }, hariIni).kosong === 'belum-masuk');
  cek('tanpa target → "tanpa-target"',
    siapkanWidget({ masuk: true, ringkasan: null, target: null }, hariIni).kosong === 'tanpa-target' &&
      siapkanWidget({ masuk: true, ringkasan: null, target: { kalori: null, proteinG: 150 } }, hariIni).kosong === 'tanpa-target');

  const t = teksWidget(baru, true);
  cek(`hari baru: "${t.judul}" / "${t.baris1}" / "${t.baris2}"`,
    t.judul === 'Hari baru' && t.baris1 === 'Target 3.100 kcal' && t.baris2 === 'Protein 180 g');
  cek('hari baru tanpa target protein', teksWidget({ ...baru, targetProteinG: null }, true).baris2 === 'Belum ada catatan');
  cek(`sebaris hari baru: "${teksWidgetSebaris(baru, true)}"`, teksWidgetSebaris(baru, true) === 'Target 3.100 kcal');
  const l = isiWidgetLingkar(baru, true);
  cek('bundar hari baru: cincin kosong + target', l.terpakai === 0 && l.angka === '3.100' && l.satuan === 'target');

  const semuaKosong = ['belum-masuk', 'tanpa-target', 'hari-baru'].flatMap((k) =>
    [3100, null].flatMap((tk) => [180, null].map((tp) => ({
      kosong: k, sisaKalori: null, sisaProteinG: null, targetKalori: tk, targetProteinG: tp, dihitungPada: null,
    }))));
  const kasar = [];
  const digitBocor = [];
  for (const r of semuaKosong) {
    for (const tampil of [true, false]) {
      const p = teksWidget(r, tampil, new Date());
      const teks = `${p.judul} ${p.baris1} ${p.baris2} ${p.aksesLabel} ${teksWidgetSebaris(r, tampil)} ${isiWidgetLingkar(r, tampil).aksesLabel}`;
      if (pelanggaranNada(teks).length > 0 || /NaN|undefined|null|-\d/.test(teks)) kasar.push(`${r.kosong}: ${teks}`);
      // Angka hanya boleh muncul sebagai TARGET hari baru, dan hanya bila angka ditampilkan.
      if (/\d/.test(teks) && !(tampil && r.kosong === 'hari-baru' && r.targetKalori !== null)) digitBocor.push(`${r.kosong}/${tampil}: ${teks}`);
    }
  }
  cek(`${semuaKosong.length * 2} keadaan kosong netral, tanpa NaN/null`, kasar.length === 0, kasar.slice(0, 2).join(' | '));
  cek('keadaan kosong tanpa angka, kecuali target hari baru saat angka ditampilkan', digitBocor.length === 0, digitBocor.slice(0, 2).join(' | '));
  const belum = teksWidget(semuaKosong[0], true);
  cek(`belum masuk: "${belum.baris1} ${belum.baris2}"`, belum.baris1 === 'Masuk ke app untuk');
  // Widget persegi layar kunci ±160 pt: baris lebih panjang dari
  // "melihat sisa hari ini" (21 karakter) terpotong "…" di iPhone.
  const panjang = semuaKosong.flatMap((r) => {
    const p = teksWidget(r, true);
    return [p.baris1, p.baris2].filter((b) => b.length > 21);
  });
  cek('teks keadaan kosong muat satu baris widget persegi', panjang.length === 0, panjang.join(' | '));
  cek('kontrol: kalimat lama yang terpotong tertangkap', 'untuk melihat sisa hari ini'.length > 21);
  const tanpa = teksWidget(semuaKosong[4], true);
  cek(`tanpa target: "${tanpa.baris1} · ${tanpa.baris2}"`, tanpa.baris1 === 'Target belum diatur' && tanpa.baris2 === 'Atur di app');
}

console.log('\nAngka yang sudah lama diberi jamnya');
{
  const r = { sisaKalori: 1120, sisaProteinG: 57, targetKalori: 3100, dihitungPada: '2026-09-23T00:12:00Z' }; // 07.12 WIB
  const pada = (menit) => new Date(Date.parse(r.dihitungPada) + menit * 60_000);
  cek(`batas segar sejam (${BATAS_SEGAR_MS} ms)`, BATAS_SEGAR_MS === 3_600_000);
  cek('38 menit: "Sisa hari ini"', teksWidget(r, true, pada(38)).judul === 'Sisa hari ini');
  cek('tepat sejam: masih "Sisa hari ini"', teksWidget(r, true, pada(60)).judul === 'Sisa hari ini');
  const lama = teksWidget(r, true, pada(61));
  cek(`61 menit: "${lama.judul}" (jam WIB, bukan UTC 00.12)`, lama.judul === 'Sisa per 07.12');
  cek('label aksesibilitas ikut menyebut jamnya', lama.aksesLabel.startsWith('Sisa per 07.12:'));
  cek('tanpa jam sekarang: tidak pernah diberi label lama', teksWidget(r, true).judul === 'Sisa hari ini');
  const sembunyi = teksWidget(r, false, pada(300));
  cek('angka disembunyikan: label jam pun tidak muncul', !/\d/.test(`${sembunyi.judul} ${sembunyi.aksesLabel}`));
}

console.log('\nWidget native (Swift) sejalan dengan TypeScript');
{
  const swift = readFileSync('targets/widget/TeksWidget.swift', 'utf8');
  const widget = readFileSync('targets/widget/RecompWidget.swift', 'utf8');
  // Setiap frasa tetap yang dihasilkan TypeScript harus ada di Swift.
  const frasa = [
    'kcal tersisa', 'kcal di atas target', 'g protein lagi', 'Protein tercapai', 'Protein belum ditargetkan',
    'Belum ada ringkasan', 'Buka app untuk mulai', 'Buka app untuk', 'melihat sisa hari ini', 'Sisa hari ini',
    'Recomp. Buka app untuk melihat sisa hari ini.', 'Belum ada ringkasan hari ini.', 'g protein', 'protein tercapai',
    // Keadaan kosong & label angka lama.
    'Masuk ke app untuk', 'Recomp. Masuk ke app untuk melihat sisa hari ini.',
    'Target belum diatur', 'Atur di app', 'Target belum diatur. Atur di app.', 'Hari baru', 'Target ', 'Protein ',
    'Belum ada catatan', 'Sisa per ', '"target"',
  ];
  const frasaHilang = (sumber) => frasa.filter((f) => !sumber.includes(f));
  const hilang = frasaHilang(swift);
  cek('semua frasa widget TypeScript ada di Swift', hilang.length === 0, `hilang: ${hilang.join(', ')}`);
  // Kontrol negatif: Swift yang kalimatnya diubah di satu sisi saja harus tertangkap.
  const rusak = frasaHilang(swift.replaceAll('Protein tercapai', 'Protein sudah cukup'));
  cek('kontrol: kalimat yang diubah hanya di Swift tertangkap', rusak.includes('Protein tercapai'), JSON.stringify(rusak));
  const literal = [...(swift + widget).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\\([^)]*\)/g, ''));
  const menegur = literal.filter((t) => pelanggaranNada(t).length > 0);
  cek(`${literal.length} teks di Swift, semuanya netral`, menegur.length === 0, menegur.join(' | '));
  cek('angka Swift diformat lokal Indonesia (titik ribuan, koma desimal)', (swift.match(/Locale\(identifier: "id_ID"\)/g) ?? []).length === 2);
  cek('Swift memakai batas segar yang sama (sejam)', /batasSegar: TimeInterval = 60 \* 60/.test(swift));
  cek('Swift membuang ringkasan yang tanggalnya bukan hari ini', /tanggal == hariIni/.test(swift) && /\.hariBaru/.test(swift));
  const jumlah = (pola) => (swift.match(pola) ?? []).length;
  cek('Swift memakai zona WIB untuk setiap tanggal, jam, & tengah malam',
    jumlah(/DateFormatter\(\)/g) === 2 && jumlah(/f\.timeZone = zonaWib/g) === 2 &&
      swift.includes('kalender.timeZone = zonaWib') && swift.includes('"Asia/Jakarta"'));
  cek('timeline menyiapkan entri tengah malam (berganti ke "Hari baru" tanpa app dibuka)',
    widget.includes('tengahMalamBerikut') && widget.includes('TeksWidget.siapkan('));
  cek('tiga ukuran layar kunci didukung',
    ['.accessoryRectangular', '.accessoryCircular', '.accessoryInline'].every((f) => widget.includes(f)));
  cek('widget hanya membaca: tidak ada perhitungan target di Swift selain porsi cincin',
    !/target_kalori\s*-|kalori\s*-\s*terpakai/.test(widget));
}

console.log(gagal === 0 ? '\n✓ Pengingat & widget: nada netral di seluruh rentang, pengingat hanya bila terlewat' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
