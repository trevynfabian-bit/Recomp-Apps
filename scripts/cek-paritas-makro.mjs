/**
 * Membuktikan aturan di SQL dan di paket `@recomp/logika` menghasilkan hasil SAMA.
 *
 * Perhitungan makro hidup di dua tempat karena PRD memang menuntutnya: UI
 * memakai paket TypeScript bersama (agar konsisten dengan web), sementara
 * widget lock screen membaca angka yang dihitung server karena WidgetKit tidak
 * bisa menjalankan paket TS. Dua tempat berarti dua aturan yang bisa
 * menyimpang diam-diam — skrip ini yang menahannya.
 *
 * Caranya: satu daftar kasus uji dijalankan lewat fungsi SQL dan lewat
 * `hitungMakro` dari src/lib/makro.ts, lalu hasilnya dibandingkan.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const PGROOT = process.env.PGROOT ?? '/var/tmp/recomp-paritas';
const PGBIN = process.env.PGBIN ?? '/usr/lib/postgresql/16/bin';
const PORT = process.env.PORT ?? '55433';

/** Kasus uji: batas bawah, batas atas, persis sama, pecahan, dan nol. */
const KASUS = [
  { label: 'di bawah target', terpakai: 1980, target: 2850, isBatas: false },
  { label: 'persis di target', terpakai: 2850, target: 2850, isBatas: false },
  { label: 'melewati target', terpakai: 3100, target: 2850, isBatas: false },
  { label: 'belum makan', terpakai: 0, target: 2850, isBatas: false },
  { label: 'protein pecahan', terpakai: 128.5, target: 180, isBatas: false },
  { label: 'sat fat di bawah batas', terpakai: 17, target: 25, isBatas: true },
  { label: 'sat fat persis di batas', terpakai: 25, target: 25, isBatas: true },
  { label: 'sat fat melewati batas', terpakai: 29, target: 25, isBatas: true },
  { label: 'sat fat pecahan lewat', terpakai: 25.1, target: 25, isBatas: true },
];

/** `diam`: galat yang MEMANG diharapkan (penolakan) tidak dicetak ke stderr. */
function sql(query, { diam = false } = {}) {
  const keluaran = execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-h', PGROOT, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', query],
    { encoding: 'utf8', ...(diam ? { stdio: 'pipe' } : {}) },
  ).trim();
  // Saat query memuat beberapa pernyataan, psql mencetak TAG PERINTAH tiap
  // pernyataan (SET, INSERT 0 1, …) sebelum hasilnya. Tag-nya dibuang, tapi
  // barisnya tidak diringkas — sebagian query di sini memang berhasil banyak baris.
  const TAG = /^(SET|BEGIN|COMMIT|ROLLBACK|DO|VACUUM|ANALYZE|(INSERT \d+ \d+)|((UPDATE|DELETE|SELECT|MOVE|FETCH|COPY) \d+))$/;
  return keluaran
    .split('\n')
    .filter((b) => !TAG.test(b.trim()))
    .join('\n')
    .trim();
}

function mulaiPostgres() {
  const jalan = (cmd) =>
    execFileSync('su', ['postgres', '-c', `PATH=${PGBIN}:$PATH ${cmd}`], { stdio: 'pipe' });
  try {
    jalan(`pg_ctl -D ${PGROOT}/data stop -m immediate`);
  } catch {
    /* belum jalan */
  }
  execFileSync('bash', ['-c', `rm -rf ${PGROOT} && mkdir -p ${PGROOT} && chown postgres:postgres ${PGROOT} && chmod 700 ${PGROOT}`]);
  jalan(`initdb -D ${PGROOT}/data -A trust -U postgres`);
  jalan(`pg_ctl -D ${PGROOT}/data -l ${PGROOT}/pg.log -o '-p ${PORT} -k ${PGROOT}' start`);
}

function hentikanPostgres() {
  try {
    execFileSync('su', ['postgres', '-c', `PATH=${PGBIN}:$PATH pg_ctl -D ${PGROOT}/data stop -m immediate`], { stdio: 'pipe' });
  } catch {
    /* sudah berhenti */
  }
}

/**
 * Kompilasi modul logika makro ke JS agar bisa dijalankan Node apa adanya.
 * Sumbernya disalin ke direktori sementara lebih dulu: `tsc` menolak argumen
 * berkas bila ada tsconfig.json di cwd (TS5112).
 */
function muatLogikaTs() {
  const kerja = mkdtempSync(join(tmpdir(), 'paritas-'));
  copyFileSync('packages/logika/src/format.ts', join(kerja, 'format.ts'));
  copyFileSync('packages/logika/src/tipe.ts', join(kerja, 'tipe.ts'));
  

  // Alias `@/…` tidak ada di luar proyek, jadi diarahkan ke berkas tetangga.
  // Paket bersama sudah memakai impor relatif, jadi disalin apa adanya.
  copyFileSync('packages/logika/src/makro.ts', join(kerja, 'makro.ts'));
  copyFileSync('packages/logika/src/deteksiTipeHari.ts', join(kerja, 'deteksiTipeHari.ts'));
  copyFileSync('packages/logika/src/tren.ts', join(kerja, 'tren.ts'));
  copyFileSync('packages/logika/src/koridor.ts', join(kerja, 'koridor.ts'));
  copyFileSync('packages/logika/src/budget.ts', join(kerja, 'budget.ts'));
  copyFileSync('packages/logika/src/redistribusi.ts', join(kerja, 'redistribusi.ts'));
  copyFileSync('packages/logika/src/tdee.ts', join(kerja, 'tdee.ts'));
  copyFileSync('packages/logika/src/bodyFat.ts', join(kerja, 'bodyFat.ts'));
  copyFileSync('packages/logika/src/ukuran.ts', join(kerja, 'ukuran.ts'));
  copyFileSync('packages/logika/src/evaluasi.ts', join(kerja, 'evaluasi.ts'));
  copyFileSync('packages/logika/src/pengingat.ts', join(kerja, 'pengingat.ts'));
  copyFileSync('packages/logika/src/percakapan.ts', join(kerja, 'percakapan.ts'));
  copyFileSync('packages/logika/src/periodeFase.ts', join(kerja, 'periodeFase.ts'));

  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['makro.ts', 'format.ts', 'tipe.ts', 'deteksiTipeHari.ts', 'tren.ts', 'koridor.ts',
     'budget.ts', 'redistribusi.ts', 'tdee.ts', 'bodyFat.ts', 'ukuran.ts', 'evaluasi.ts', 'pengingat.ts',
     'periodeFase.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return {
    ...require(join(kerja, 'keluar', 'makro.js')),
    ...require(join(kerja, 'keluar', 'deteksiTipeHari.js')),
    ...require(join(kerja, 'keluar', 'tren.js')),
    ...require(join(kerja, 'keluar', 'koridor.js')),
    ...require(join(kerja, 'keluar', 'budget.js')),
    ...require(join(kerja, 'keluar', 'redistribusi.js')),
    ...require(join(kerja, 'keluar', 'tdee.js')),
    ...require(join(kerja, 'keluar', 'bodyFat.js')),
    ...require(join(kerja, 'keluar', 'ukuran.js')),
    ...require(join(kerja, 'keluar', 'evaluasi.js')),
    ...require(join(kerja, 'keluar', 'pengingat.js')),
    ...require(join(kerja, 'keluar', 'periodeFase.js')),
  };
}

/** Kasus uji deteksi tipe hari: kombinasi jenis workout dalam satu hari. */
const KASUS_DETEKSI = [
  { label: 'tanpa workout', jenis: [] },
  { label: 'angkat beban saja', jenis: ['angkat_beban'] },
  { label: 'lari saja', jenis: ['lari'] },
  { label: 'beban + lari', jenis: ['angkat_beban', 'lari'] },
  { label: 'padel saja', jenis: ['padel'] },
  { label: 'beban + padel', jenis: ['angkat_beban', 'padel'] },
  { label: 'lari + padel', jenis: ['lari', 'padel'] },
  { label: 'beban + lari + padel', jenis: ['angkat_beban', 'lari', 'padel'] },
  { label: 'hanya jenis lainnya', jenis: ['lainnya'] },
  { label: 'lainnya + beban', jenis: ['lainnya', 'angkat_beban'] },
];

function psqlFile(berkas, db = 'postgres') {
  execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-h', PGROOT, '-p', PORT, '-U', 'postgres', '-d', db, '-q', '-f', berkas],
    { encoding: 'utf8', stdio: 'pipe' },
  );
}

/** Pasang tiruan auth Supabase + seluruh migrasi, supaya fungsi SQL bisa dipanggil. */
function pasangSkema() {
  sql('create extension if not exists "pgcrypto";');
  psqlFile('supabase/tests/harness.sql');
  for (const f of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
    psqlFile(join('supabase/migrations', f));
  }
}

mulaiPostgres();
try {
  // Aturan SQL-nya disalin apa adanya dari migrasi ringkasan_sisa_harian.
  const nilai = KASUS.map(
    (k) => `(${k.terpakai}::numeric, ${k.target}::numeric, ${k.isBatas})`,
  ).join(',');
  const keluaran = sql(`
    select string_agg(
      (target - terpakai)::text || '|' ||
      (case when is_batas then (terpakai > target) else (terpakai > target) end)::text,
      E'\\n' order by urutan)
    from (
      select row_number() over () as urutan, *
      from (values ${nilai}) as t(terpakai, target, is_batas)
    ) s;`);

  const barisSql = keluaran.split('\n').map((b) => {
    const [sisa, terlampaui] = b.split('|');
    return { sisa: Number(sisa), terlampaui: terlampaui === 'true' };
  });

  const { hitungMakro } = muatLogikaTs();

  let gagal = 0;
  console.log('kasus                          SQL sisa   TS sisa   SQL lewat  TS lewat');
  console.log('─'.repeat(76));
  KASUS.forEach((k, i) => {
    const macro = {
      key: k.isBatas ? 'satFat' : 'kalori',
      label: k.label,
      terpakai: k.terpakai,
      target: k.target,
      unit: k.isBatas ? 'g' : 'kcal',
      isBatas: k.isBatas,
    };
    const ts = hitungMakro(macro, 'sisa');
    // `hitungMakro` memutlakkan angkanya; tandanya dibawa `terlampaui`.
    const tsSisa = ts.terlampaui ? -ts.nilaiUtama : ts.nilaiUtama;
    const s = barisSql[i];
    const cocok = Math.abs(tsSisa - s.sisa) < 1e-9 && ts.terlampaui === s.terlampaui;
    if (!cocok) gagal += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${k.label.padEnd(28)} ${String(s.sisa).padStart(8)}  ${String(tsSisa).padStart(8)}` +
        `  ${String(s.terlampaui).padStart(9)}  ${String(ts.terlampaui).padStart(8)}`,
    );
  });

  console.log();
  if (gagal > 0) {
    console.error(`✗ ${gagal} kasus BERBEDA antara SQL dan TypeScript (aturan sisa).`);
    process.exit(1);
  }
  console.log(`✓ ${KASUS.length} kasus cocok — aturan sisa di SQL dan TypeScript sejalan.`);

  // === Bagian 2: aturan deteksi tipe hari ==================================
  console.log();
  pasangSkema();

  const UID = '99999999-9999-9999-9999-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID}', 'paritas@contoh.test');`);

  const { deteksiTipeHari } = muatLogikaTs();
  // Tipe hari sisi TS harus mencerminkan yang dibuat seed di database.
  const dayTypes = sql(
    `select string_agg(id || '|' || nama || '|' || auto_detect, E'\n' order by urutan)
       from public.day_types where user_id = '${UID}';`,
  )
    .split('\n')
    .map((b) => {
      const [id, nama, auto] = b.split('|');
      return { id, nama, auto_detect: auto === 't' || auto === 'true', is_default: nama === 'Rest' };
    });

  let gagalDeteksi = 0;
  console.log('kasus deteksi                  SQL             TS');
  console.log('─'.repeat(64));
  KASUS_DETEKSI.forEach((k, i) => {
    const tanggal = `2026-10-${String(i + 1).padStart(2, '0')}`;
    k.jenis.forEach((j, n) => {
      sql(
        `insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
         values ('${UID}', date '${tanggal}', 'w${n}', '${j}', 'manual', '${tanggal}-${n}');`,
      );
    });

    const namaSql = sql(
      `select coalesce((select nama from public.deteksi_tipe_hari(date '${tanggal}', '${UID}')), 'â€”');`,
    );

    const workouts = k.jenis.map((j, n) => ({
      id: `w${n}`, nama: `w${n}`, jenis: j, sumber: 'manual', durasi_menit: 30,
    }));
    const namaTs = deteksiTipeHari(workouts, dayTypes).nama ?? 'â€”';

    const cocok = namaSql === namaTs;
    if (!cocok) gagalDeteksi += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${k.label.padEnd(28)} ${namaSql.padEnd(15)} ${namaTs}`,
    );
  });

  console.log();
  if (gagalDeteksi > 0) {
    console.error(`✗ ${gagalDeteksi} kasus BERBEDA (aturan deteksi tipe hari).`);
    process.exit(1);
  }
  console.log(
    `✓ ${KASUS_DETEKSI.length} kasus cocok — aturan deteksi tipe hari di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 3: rata-rata berat 7 hari ====================================
  console.log();
  const { rataRata7Hari } = muatLogikaTs();

  // Sengaja berlubang: 09-19 dan 09-21 tidak ditimbang, supaya terbukti hari
  // kosong DILEWATI dan bukan dihitung nol.
  const TIMBANGAN = [
    ['2026-09-16', 74.1], ['2026-09-17', 74.5], ['2026-09-18', 74.2],
    ['2026-09-20', 74.4], ['2026-09-22', 74.6],
  ];
  for (const [tgl, kg] of TIMBANGAN) {
    sql(`set request.jwt.claim.sub = '${UID}'; select 1 from public.simpan_berat_pagi(date '${tgl}', ${kg});`);
  }

  const KASUS_RATA = ['2026-09-22', '2026-09-20', '2026-09-18', '2026-09-30'];
  const riwayatTs = TIMBANGAN.map(([tanggal, kg]) => ({ tanggal, berat_pagi_kg: kg }));

  let gagalRata = 0;
  console.log('tanggal        SQL rata  TS rata   SQL n  TS n');
  console.log('─'.repeat(52));
  for (const tgl of KASUS_RATA) {
    const baris = sql(
      `set request.jwt.claim.sub = '${UID}';
       select coalesce(rata_rata_kg::text, 'null') || '|' || jumlah_timbangan
         from public.rata_rata_berat_7_hari(date '${tgl}');`,
    );
    const [rataSql, nSql] = baris.split('|');
    const ts = rataRata7Hari(riwayatTs, tgl);
    const tsRata = ts.rataRataKg === null ? 'null' : String(ts.rataRataKg);

    const cocok =
      (rataSql === 'null' ? tsRata === 'null' : Math.abs(Number(rataSql) - Number(tsRata)) < 1e-9) &&
      Number(nSql) === ts.jumlahTimbangan;
    if (!cocok) gagalRata += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${tgl}  ${rataSql.padStart(8)}  ${tsRata.padStart(7)}  ${nSql.padStart(5)}  ${String(ts.jumlahTimbangan).padStart(4)}`,
    );
  }

  console.log();
  if (gagalRata > 0) {
    console.error(`✗ ${gagalRata} kasus BERBEDA (rata-rata 7 hari).`);
    process.exit(1);
  }
  console.log(`✓ ${KASUS_RATA.length} kasus cocok — rata-rata 7 hari di SQL dan TypeScript sejalan.`);

  // === Bagian 4: DERET rata-rata 7 hari ====================================
  //
  // Bagian 3 membandingkan satu tanggal per panggilan. Layar Tren memakai
  // `deret_rata_rata_7_hari`, yang menghitung seluruh rentang dalam satu query
  // — implementasi yang sama sekali berbeda, dan karena itu bisa menyimpang
  // sendiri meski versi satu-tanggalnya benar. Titik yang paling rawan adalah
  // titik PERTAMA rentang: jendelanya harus menjangkau enam hari SEBELUM
  // rentang yang diminta.
  console.log();
  const { deretTren } = muatLogikaTs();

  const DARI = '2026-09-18';
  const SAMPAI = '2026-09-24';
  const barisDeret = sql(
    `set request.jwt.claim.sub = '${UID}';
     select string_agg(
       tanggal::text || '|' || coalesce(rata_rata_kg::text, 'null') || '|' ||
       coalesce(berat_harian_kg::text, 'null'), ';' order by tanggal)
       from public.deret_rata_rata_7_hari(date '${DARI}', date '${SAMPAI}');`,
  );
  const deretSql = barisDeret.split(';').map((b) => {
    const [tanggal, rata, harian] = b.split('|');
    return { tanggal, rata, harian };
  });
  const deretTs = deretTren(riwayatTs, DARI, SAMPAI);

  let gagalDeret = 0;
  console.log('tanggal        SQL rata  TS rata   SQL harian  TS harian');
  console.log('─'.repeat(60));
  for (const [i, baris] of deretSql.entries()) {
    const ts = deretTs[i];
    const tsRata = ts.rataRataKg === null ? 'null' : String(ts.rataRataKg);
    const tsHarian = ts.beratHarianKg === null ? 'null' : String(ts.beratHarianKg);

    const cocok =
      baris.tanggal === ts.tanggal &&
      (baris.rata === 'null' ? tsRata === 'null' : Math.abs(Number(baris.rata) - Number(tsRata)) < 1e-9) &&
      (baris.harian === 'null' ? tsHarian === 'null' : Math.abs(Number(baris.harian) - Number(tsHarian)) < 1e-9);
    if (!cocok) gagalDeret += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${baris.tanggal}  ${baris.rata.padStart(8)}  ${tsRata.padStart(7)}  ` +
        `${baris.harian.padStart(10)}  ${tsHarian.padStart(9)}`,
    );
  }

  console.log();
  if (deretSql.length !== deretTs.length) {
    console.error(`✗ Panjang deret berbeda: SQL ${deretSql.length}, TS ${deretTs.length}.`);
    process.exit(1);
  }
  if (gagalDeret > 0) {
    console.error(`✗ ${gagalDeret} titik BERBEDA (deret rata-rata 7 hari).`);
    process.exit(1);
  }
  console.log(
    `✓ ${deretSql.length} titik cocok — deret rata-rata 7 hari di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 5: endpoint gabungan (arah & kecukupan) ======================
  //
  // Endpoint gabungan menghitung ULANG sinyal arah dan kecukupan data di SQL.
  // Keduanya punya aturan yang halus dan mudah menyimpang tanpa kelihatan:
  // "datar" ditentukan ambang 0,2 kg, dan `hariLagiUntukArah` dihitung dari
  // timbangan PERTAMA, bukan dari hari ini.
  console.log();
  const { sinyalArah, kecukupanTren } = muatLogikaTs();

  // Pengguna KEDUA dengan riwayat dua pekan penuh. Riwayat pengguna pertama
  // sengaja berlubang di bagian 3–4, jadi jendela sebelumnya selalu kosong dan
  // arahnya selalu "belum cukup data" — cabang yang paling tidak menarik.
  // Menambah timbangan ke sana akan mengubah angka bagian 3 & 4, jadi cabang
  // naik/turun/datar diuji di pengguna terpisah.
  const UID2 = 'ffff0000-0000-0000-0000-00000000f001';
  sql(`insert into auth.users (id, email) values ('${UID2}', 'paritas-tren@contoh.test');`);

  const RIWAYAT2 = [
    ['2026-09-09', 73.9], ['2026-09-10', 74.2], ['2026-09-11', 73.8],
    ['2026-09-12', 74.1], ['2026-09-13', 74.4], ['2026-09-14', 74.0],
    ['2026-09-15', 74.3], ['2026-09-16', 74.1], ['2026-09-17', 74.5],
    ['2026-09-18', 74.2], ['2026-09-19', 74.7], ['2026-09-20', 74.4],
    ['2026-09-21', 74.8], ['2026-09-22', 74.6],
  ];
  for (const [tgl, kg] of RIWAYAT2) {
    sql(`set request.jwt.claim.sub = '${UID2}'; select 1 from public.simpan_berat_pagi(date '${tgl}', ${kg});`);
  }
  const riwayat2Ts = RIWAYAT2.map(([tanggal, kg]) => ({ tanggal, berat_pagi_kg: kg }));

  // Pengguna KETIGA menguji AMBANG-nya, bukan cuma aritmetikanya. Tiga blok
  // 14 hari yang terpisah jauh (jendelanya tidak saling menyentuh), masing-
  // masing disusun agar selisihnya jatuh persis di sekitar ambang 0,2 kg:
  // +0,20 tepat di ambang (harus "naik", bukan "datar"), +0,15 di bawahnya
  // ("datar"), dan −0,30 ("turun"). Operator yang salah — `<=` alih-alih `<`
  // — hanya terlihat di kasus pertama.
  const UID3 = 'ffff0000-0000-0000-0000-00000000f002';
  sql(`insert into auth.users (id, email) values ('${UID3}', 'paritas-ambang@contoh.test');`);

  const BLOK = [
    { awal: '2026-07-01', lalu: 74.0, kini: 74.2, akhir: '2026-07-14', harap: 'naik' },
    { awal: '2026-08-01', lalu: 74.0, kini: 74.15, akhir: '2026-08-14', harap: 'datar' },
    { awal: '2026-09-01', lalu: 74.5, kini: 74.2, akhir: '2026-09-14', harap: 'turun' },
  ];
  const riwayat3Ts = [];
  for (const b of BLOK) {
    for (let i = 0; i < 14; i += 1) {
      const tgl = new Date(Date.parse(`${b.awal}T00:00:00Z`) + i * 86400000)
        .toISOString()
        .slice(0, 10);
      const kg = i < 7 ? b.lalu : b.kini;
      sql(`set request.jwt.claim.sub = '${UID3}'; select 1 from public.simpan_berat_pagi(date '${tgl}', ${kg});`);
      riwayat3Ts.push({ tanggal: tgl, berat_pagi_kg: kg });
    }
  }

  let gagalAmbang = 0;
  console.log('ambang 0,2 kg   SQL arah   TS arah    SQL Δ     TS Δ      diharapkan');
  console.log('─'.repeat(72));
  for (const b of BLOK) {
    const baris = sql(
      `set request.jwt.claim.sub = '${UID3}';
       select (j -> 'arah' ->> 'arah') || '|' || coalesce(j -> 'arah' ->> 'perubahan_kg', 'null')
         from (select public.tren_berat_7_hari(date '${b.akhir}', 14) as j) t;`,
    );
    const [arahSql, ubahSql] = baris.split('|');
    const ts = sinyalArah(riwayat3Ts, b.akhir);
    const tsUbah = ts.perubahanKg === null ? 'null' : String(ts.perubahanKg);

    const cocok =
      arahSql === ts.arah &&
      arahSql === b.harap &&
      Math.abs(Number(ubahSql) - Number(tsUbah)) < 1e-9;
    if (!cocok) gagalAmbang += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${b.akhir}  ${arahSql.padEnd(9)}  ${ts.arah.padEnd(9)}  ` +
        `${ubahSql.padStart(6)}  ${tsUbah.padStart(7)}  ${b.harap}`,
    );
  }
  console.log();
  if (gagalAmbang > 0) {
    console.error(`✗ ${gagalAmbang} kasus BERBEDA (ambang sinyal arah).`);
    process.exit(1);
  }
  console.log(`✓ ${BLOK.length} kasus cocok — ambang "datar" 0,2 kg sejalan di SQL dan TypeScript.`);
  console.log();

  const KASUS_GABUNGAN = ['2026-09-22', '2026-09-20', '2026-09-18', '2026-09-16'];
  let gagalGabungan = 0;
  console.log('tanggal        SQL arah          TS arah           SQL Δ     TS Δ      hari lagi');
  console.log('─'.repeat(86));
  for (const tgl of KASUS_GABUNGAN) {
    // Rentang 14 hari; TS diberi riwayat yang sama supaya pembandingnya adil.
    const baris = sql(
      `set request.jwt.claim.sub = '${UID2}';
       select (j -> 'arah' ->> 'arah') || '|' ||
              coalesce(j -> 'arah' ->> 'perubahan_kg', 'null') || '|' ||
              (j -> 'kecukupan' ->> 'cukup_arah') || '|' ||
              coalesce(j -> 'kecukupan' ->> 'hari_lagi_untuk_arah', 'null') || '|' ||
              (j -> 'kecukupan' ->> 'jendela_penuh') || '|' ||
              (j -> 'kecukupan' ->> 'jumlah_dalam_jendela')
         from (select public.tren_berat_7_hari(date '${tgl}', 14) as j) t;`,
    );
    const [arahSql, ubahSql, cukupSql, hariSql, penuhSql, nSql] = baris.split('|');

    const ts = sinyalArah(riwayat2Ts, tgl);
    // TS menerima riwayat 14 hari yang berakhir di tanggal itu — sama dengan
    // rentang yang dipakai SQL untuk menghitung kecukupan.
    const dariTs = new Date(Date.parse(`${tgl}T00:00:00Z`) - 13 * 86400000)
      .toISOString()
      .slice(0, 10);
    const riwayatJendela = riwayat2Ts.filter((r) => r.tanggal >= dariTs && r.tanggal <= tgl);
    const kec = kecukupanTren(riwayatJendela, tgl);

    const tsUbah = ts.perubahanKg === null ? 'null' : String(ts.perubahanKg);
    const tsHari = kec.hariLagiUntukArah === null ? 'null' : String(kec.hariLagiUntukArah);

    const cocok =
      arahSql === ts.arah &&
      (ubahSql === 'null' ? tsUbah === 'null' : Math.abs(Number(ubahSql) - Number(tsUbah)) < 1e-9) &&
      (cukupSql === 'true') === kec.cukupArah &&
      hariSql === tsHari &&
      (penuhSql === 'true') === kec.jendelaPenuh &&
      Number(nSql) === kec.jumlahDalamJendela;
    if (!cocok) gagalGabungan += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${tgl}  ${arahSql.padEnd(16)}  ${ts.arah.padEnd(16)}  ` +
        `${ubahSql.padStart(6)}  ${tsUbah.padStart(7)}  ${hariSql.padStart(4)}/${tsHari}`,
    );
  }

  console.log();
  if (gagalGabungan > 0) {
    console.error(`✗ ${gagalGabungan} kasus BERBEDA (endpoint tren gabungan).`);
    process.exit(1);
  }
  console.log(
    `✓ ${KASUS_GABUNGAN.length} kasus cocok — sinyal arah & kecukupan di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 6: koridor target ===========================================
  //
  // Koridor memakai laju MAJEMUK — `(1 + laju) ^ (hari/7)` — jadi selisih
  // presisi sekecil apa pun menumpuk sepanjang hari. Ia juga punya jebakan
  // penamaan: pada fase Cut kedua lajunya negatif, sehingga batas "bawah"
  // justru berasal dari laju MAKS. Ketiga fase diuji sepanjang 60 hari penuh,
  // titik demi titik.
  console.log();
  const { koridorTarget, statusKoridor } = muatLogikaTs();

  const FASE_UJI = ['Lean Gain', 'Cut', 'Maintenance'];
  const JANGKAR_KG = 74.3;
  const JANGKAR_TGL = '2026-09-01';
  const HARI_KORIDOR = 60;

  let gagalKoridor = 0;
  let titikDiperiksa = 0;
  console.log('fase          titik   selisih maks (kg)   contoh hari ke-59 (SQL / TS)');
  console.log('─'.repeat(78));
  for (const fase of FASE_UJI) {
    const baris = sql(
      `select string_agg(tanggal::text || '|' || bawah_kg::text || '|' || atas_kg::text, ';' order by tanggal)
         from public.koridor_target(${JANGKAR_KG}, date '${JANGKAR_TGL}', '${fase}'::public.fase_program, ${HARI_KORIDOR});`,
    );
    const sqlTitik = baris.split(';').map((b) => {
      const [tanggal, bawah, atas] = b.split('|');
      return { tanggal, bawah: Number(bawah), atas: Number(atas) };
    });
    const tsKoridor = koridorTarget(JANGKAR_KG, JANGKAR_TGL, fase, HARI_KORIDOR);

    let maksSelisih = 0;
    let cocok = sqlTitik.length === tsKoridor.titik.length;
    for (const [i, t] of sqlTitik.entries()) {
      const ts = tsKoridor.titik[i];
      if (!ts || t.tanggal !== ts.tanggal) { cocok = false; break; }
      maksSelisih = Math.max(
        maksSelisih,
        Math.abs(t.bawah - ts.bawahKg),
        Math.abs(t.atas - ts.atasKg),
      );
      if (t.bawah !== ts.bawahKg || t.atas !== ts.atasKg) cocok = false;
      titikDiperiksa += 1;
    }
    if (!cocok) gagalKoridor += 1;
    const akhirSql = sqlTitik[sqlTitik.length - 1];
    const akhirTs = tsKoridor.titik[tsKoridor.titik.length - 1];
    console.log(
      `${cocok ? '✓' : '✗'} ${fase.padEnd(12)}  ${String(sqlTitik.length).padStart(4)}   ` +
        `${maksSelisih.toFixed(4).padStart(9)}   ` +
        `${akhirSql.bawah}–${akhirSql.atas} / ${akhirTs.bawahKg}–${akhirTs.atasKg}`,
    );
  }

  // Posisi terhadap koridor: di bawah, di dalam, di atas, dan tidak bisa dinilai.
  const KASUS_STATUS = [
    { tanggal: '2026-09-29', rata: 70.0, harap: 'di bawah koridor' },
    // 29 Sep = hari ke-28 = 4 pekan; Lean Gain dari 74,3 kg memberi koridor
    // 75,05–75,80 kg, jadi 75,4 ada di dalamnya sementara 74,5 sudah di bawah.
    { tanggal: '2026-09-29', rata: 75.4, harap: 'di dalam koridor' },
    { tanggal: '2026-09-29', rata: 80.0, harap: 'di atas koridor' },
    { tanggal: '2026-08-20', rata: 74.5, harap: 'belum bisa dinilai' },
  ];
  let gagalStatus = 0;
  console.log();
  console.log('posisi terhadap koridor (Lean Gain)   SQL                  TS');
  console.log('─'.repeat(78));
  const koridorTs = koridorTarget(JANGKAR_KG, JANGKAR_TGL, 'Lean Gain', HARI_KORIDOR);
  for (const k of KASUS_STATUS) {
    const baris = sql(
      `select posisi || '|' || coalesce(selisih_kg::text, 'null')
         from public.status_koridor(${JANGKAR_KG}, date '${JANGKAR_TGL}',
              'Lean Gain'::public.fase_program, date '${k.tanggal}', ${k.rata});`,
    );
    const [posisiSql, selisihSql] = baris.split('|');
    const ts = statusKoridor(koridorTs, k.tanggal, k.rata);
    const tsSelisih = ts.selisihKg === null ? 'null' : String(ts.selisihKg);

    const cocok =
      posisiSql === ts.posisi &&
      posisiSql === k.harap &&
      (selisihSql === 'null'
        ? tsSelisih === 'null'
        : Math.abs(Number(selisihSql) - Number(tsSelisih)) < 1e-9);
    if (!cocok) gagalStatus += 1;
    console.log(
      `${cocok ? '✓' : '✗'} ${k.tanggal} ${String(k.rata).padStart(5)} kg   ` +
        `${posisiSql.padEnd(19)}  ${ts.posisi}`,
    );
  }

  console.log();
  if (gagalKoridor > 0 || gagalStatus > 0) {
    console.error(
      `✗ ${gagalKoridor} fase & ${gagalStatus} posisi BERBEDA (koridor target).`,
    );
    process.exit(1);
  }
  console.log(
    `✓ ${titikDiperiksa} titik koridor & ${KASUS_STATUS.length} posisi cocok — ` +
      'koridor target di SQL dan TypeScript sejalan.',
  );

  // === Bagian 7: budget kalori mingguan ====================================
  //
  // Tiga aturan budget mingguan hidup di dua tempat, dan ketiganya berupa
  // PILIHAN, bukan rumus yang bisa ditebak ulang: total memakai target ASLI,
  // laju memakai target BERLAKU, dan hari ini bukan hari tersisa. Yang
  // dibandingkan di sini justru agregasinya — rincian tujuh hari diambil dari
  // SQL lalu disuapkan ke `budgetMingguan`/`lajuBudget`, sehingga yang diuji
  // adalah aturannya, bukan sekadar kemampuan keduanya membaca tabel.
  console.log();
  const { budgetMingguan, lajuBudget, awalMinggu } = muatLogikaTs();

  const UID_BUDGET = '99999999-3333-3333-3333-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_BUDGET}', 'paritas-budget@contoh.test');`);
  sql(`update public.profiles set fase_aktif = 'Lean Gain' where user_id = '${UID_BUDGET}';`);

  // Pekan 21–27 Sep: Selasa sengaja dipotong redistribusi (berlaku 2900,
  // asli 3100) supaya kedua aturan target bisa dibedakan; Jum–Min tanpa baris
  // sama sekali supaya jalur "tipe hari bawaan" ikut terbandingkan.
  sql(`
    set request.jwt.claim.sub = '${UID_BUDGET}';
    select public.setel_tipe_hari(date '2026-09-21',
             (select id from public.day_types
               where user_id = '${UID_BUDGET}' and nama = 'Angkat Beban'));
    select public.setel_tipe_hari(date '2026-09-24',
             (select id from public.day_types
               where user_id = '${UID_BUDGET}' and nama = 'Angkat Beban'));
    select public.setel_tipe_hari(date '2026-09-22',
             (select id from public.day_types
               where user_id = '${UID_BUDGET}' and nama = 'Beban+Lari'));
    select public.setel_tipe_hari(date '2026-09-23',
             (select id from public.day_types
               where user_id = '${UID_BUDGET}' and nama = 'Rest'));
    update public.daily_logs set kalori = 2900, protein_g = 180
      where user_id = '${UID_BUDGET}' and tanggal = date '2026-09-21';
    update public.daily_logs
       set kalori = 3300, protein_g = 190,
           target_asli_kalori = target_kalori, target_kalori = 2900
     where user_id = '${UID_BUDGET}' and tanggal = date '2026-09-22';
    update public.daily_logs set kalori = 1200, protein_g = 95
      where user_id = '${UID_BUDGET}' and tanggal = date '2026-09-23';`);

  const KASUS_BUDGET = [
    { label: 'tengah pekan', pekan: '2026-09-23', hariIni: '2026-09-23', ambang: 300 },
    { label: 'ambang longgar', pekan: '2026-09-23', hariIni: '2026-09-23', ambang: 900 },
    { label: 'pekan di depan', pekan: '2026-09-28', hariIni: '2026-09-23', ambang: 300 },
    { label: 'pekan lampau', pekan: '2026-09-14', hariIni: '2026-09-23', ambang: 300 },
    { label: 'hari terakhir', pekan: '2026-09-23', hariIni: '2026-09-27', ambang: 300 },
    { label: 'hari pertama', pekan: '2026-09-23', hariIni: '2026-09-21', ambang: 300 },
  ];

  let gagalBudget = 0;
  console.log('kasus            SQL total  TS total   SQL sisa/hr  TS sisa/hr  SQL status      TS status');
  console.log('─'.repeat(96));
  for (const k of KASUS_BUDGET) {
    const mentah = sql(
      `set request.jwt.claim.sub = '${UID_BUDGET}';
       select public.budget_mingguan(date '${k.pekan}', date '${k.hariIni}', ${k.ambang})::text;`,
    );
    const b = JSON.parse(mentah);

    // Rincian SQL dipakai APA ADANYA sebagai masukan TS. Yang dibandingkan
    // adalah aturan agregasinya, bukan cara masing-masing membaca tabel.
    const hari = b.rincian.map((r) => ({
      tanggal: r.tanggal,
      namaTipeHari: r.nama_tipe_hari,
      targetKalori: r.target_kalori,
      targetAsliKalori: r.target_asli_kalori ?? undefined,
      terpakaiKalori: r.terpakai_kalori,
      targetProteinG: r.target_protein_g,
    }));
    const ts = budgetMingguan(hari, k.hariIni);
    const tsLaju = lajuBudget(ts, k.ambang);

    const beda = [];
    const bandingkan = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    bandingkan('minggu_mulai', b.minggu_mulai, ts.mingguMulai);
    bandingkan('minggu_mulai(awalMinggu)', b.minggu_mulai, awalMinggu(k.pekan));
    bandingkan('budget_total', b.budget_total, ts.budgetTotal);
    bandingkan('terpakai', b.terpakai, ts.terpakai);
    bandingkan('sisa', b.sisa, ts.sisa);
    bandingkan('hari_tersisa', b.hari_tersisa, ts.hariTersisa);
    bandingkan('target_mendatang', b.target_mendatang, ts.targetMendatang);
    bandingkan('sisa_per_hari', b.sisa_per_hari, ts.sisaPerHari);
    bandingkan('rencana_per_hari', b.rencana_per_hari, ts.rencanaPerHari);
    bandingkan('laju.seharusnya', b.laju.seharusnya, tsLaju.seharusnya);
    bandingkan('laju.selisih', b.laju.selisih, tsLaju.selisih);
    bandingkan('laju.status', b.laju.status, tsLaju.status);
    bandingkan('laju.ambang', b.laju.ambang_kcal, tsLaju.ambangKcal);
    // Status & selisih per hari ikut dibandingkan: salah menempatkan "hari ini"
    // tidak selalu mengubah total, tapi selalu mengubah barisnya.
    b.rincian.forEach((r, i) => {
      bandingkan(`rincian[${i}].status`, r.status, ts.rincian[i].status);
      bandingkan(`rincian[${i}].selisih`, r.selisih, ts.rincian[i].selisih);
    });

    if (beda.length > 0) gagalBudget += 1;
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${k.label.padEnd(15)} ${String(b.budget_total).padStart(8)}  ` +
        `${String(ts.budgetTotal).padStart(8)}  ${String(b.sisa_per_hari).padStart(10)}  ` +
        `${String(ts.sisaPerHari).padStart(10)}  ${String(b.laju.status).padEnd(14)}  ${tsLaju.status}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  // Pembulatan setengah NEGATIF: `Math.round(-1.5)` = −1, sedangkan `round()`
  // di Postgres memberi −2. Bedanya cuma 1 kkal, tapi ia muncul justru saat
  // jatah pekan sudah terlampaui — keadaan yang paling diperhatikan pengguna.
  // Pekan berikut disusun supaya sisa ÷ hari tersisa jatuh PERSIS di −1,5.
  const UID_LAMPAU = '99999999-4444-4444-4444-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_LAMPAU}', 'paritas-lampau@contoh.test');`);
  sql(`update public.profiles set fase_aktif = 'Lean Gain' where user_id = '${UID_LAMPAU}';`);
  // Tujuh hari Rest Lean Gain = 2450 × 7 = 17.150. Sen–Jum menghabiskan
  // 17.153 → sisa −3 dengan 2 hari tersisa.
  sql(`
    set request.jwt.claim.sub = '${UID_LAMPAU}';
    select public.setel_tipe_hari((date '2026-09-21' + i)::date,
             (select id from public.day_types
               where user_id = '${UID_LAMPAU}' and nama = 'Rest'))
      from generate_series(0, 4) as i;
    update public.daily_logs set kalori = 3430
     where user_id = '${UID_LAMPAU}' and tanggal between date '2026-09-21' and date '2026-09-24';
    update public.daily_logs set kalori = 3433
     where user_id = '${UID_LAMPAU}' and tanggal = date '2026-09-25';`);

  const mentahLampau = sql(
    `set request.jwt.claim.sub = '${UID_LAMPAU}';
     select public.budget_mingguan(date '2026-09-25', date '2026-09-25', 300)::text;`,
  );
  const bLampau = JSON.parse(mentahLampau);
  const tsLampau = budgetMingguan(
    bLampau.rincian.map((r) => ({
      tanggal: r.tanggal,
      namaTipeHari: r.nama_tipe_hari,
      targetKalori: r.target_kalori,
      targetAsliKalori: r.target_asli_kalori ?? undefined,
      terpakaiKalori: r.terpakai_kalori,
      targetProteinG: r.target_protein_g,
    })),
    '2026-09-25',
  );
  const setengahCocok =
    bLampau.sisa === -3 &&
    bLampau.hari_tersisa === 2 &&
    bLampau.sisa_per_hari === tsLampau.sisaPerHari;
  if (!setengahCocok) gagalBudget += 1;
  console.log(
    `${setengahCocok ? '✓' : '✗'} setengah negatif  sisa ${bLampau.sisa} ÷ ${bLampau.hari_tersisa} hari → ` +
      `SQL ${bLampau.sisa_per_hari} / TS ${tsLampau.sisaPerHari}`,
  );

  console.log();
  if (gagalBudget > 0) {
    console.error(`✗ ${gagalBudget} kasus BERBEDA (budget kalori mingguan).`);
    process.exit(1);
  }
  console.log(
    `✓ ${KASUS_BUDGET.length + 1} kasus cocok — budget mingguan & laju di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 8: redistribusi kalori mingguan ==============================
  //
  // Redistribusi punya tiga sumber penyimpangan yang tidak saling menutupi:
  // pembulatan 50 kkal, lantai kalori harian, dan urutan keduanya (bulatkan
  // dulu, baru tegakkan lantai — kebalikannya melanggar lantai). Ditambah
  // pembagi yang sering menghasilkan pecahan berulang, ini bagian yang paling
  // mudah menyimpang diam-diam. Rincian budget-nya diambil dari SQL lalu
  // disuapkan ke `hitungRedistribusi`, jadi yang dibandingkan aturannya.
  console.log();
  const { hitungRedistribusi, KELIPATAN_KCAL } = muatLogikaTs();

  const kelipatanSql = Number(sql('select public.kelipatan_redistribusi_kcal();'));
  if (kelipatanSql !== KELIPATAN_KCAL) {
    console.error(
      `✗ Kelipatan pembulatan BERBEDA: SQL ${kelipatanSql} vs TS ${KELIPATAN_KCAL}.`,
    );
    process.exit(1);
  }
  console.log(`✓ kelipatan pembulatan sama: ${kelipatanSql} kcal`);

  const KASUS_REDIS = [
    // Jatah menganggur, habis dibagi rata tanpa sisa.
    { label: 'sebar rata pas', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-23', opsi: 'sebar_rata' },
    // Pembagi 3 → pecahan berulang, pembulatan menyisakan selisih.
    { label: 'sebar sisa bulat', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-24', opsi: 'sebar_rata' },
    { label: 'tumpuk bawaan', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-23', opsi: 'tumpuk_satu_hari' },
    { label: 'tumpuk ditunjuk', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-23', opsi: 'tumpuk_satu_hari', tumpuk: '2026-09-25' },
    { label: 'abaikan', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-23', opsi: 'abaikan' },
    { label: 'tanpa hari sisa', uid: UID_BUDGET, pekan: '2026-09-23', hariIni: '2026-09-27', opsi: 'sebar_rata' },
    // Pekan yang jatahnya sudah terlampaui: potongannya menabrak lantai.
    { label: 'kena lantai', uid: UID_LAMPAU, pekan: '2026-09-25', hariIni: '2026-09-25', opsi: 'sebar_rata' },
    { label: 'lantai + tumpuk', uid: UID_LAMPAU, pekan: '2026-09-25', hariIni: '2026-09-25', opsi: 'tumpuk_satu_hari' },
  ];

  let gagalRedis = 0;
  console.log('kasus              SQL perlu  SQL serap  TS serap  SQL sisa  TS sisa  lantai');
  console.log('─'.repeat(88));
  for (const k of KASUS_REDIS) {
    const tumpuk = k.tumpuk ? `date '${k.tumpuk}'` : 'null';
    const mentahH = sql(
      `set request.jwt.claim.sub = '${k.uid}';
       select public.hitung_redistribusi(date '${k.pekan}', '${k.opsi}'::public.opsi_redistribusi,
              ${tumpuk}, date '${k.hariIni}')::text;`,
    );
    const h = JSON.parse(mentahH);

    const mentahB = sql(
      `set request.jwt.claim.sub = '${k.uid}';
       select public.budget_mingguan(date '${k.pekan}', date '${k.hariIni}')::text;`,
    );
    const b = JSON.parse(mentahB);
    const budget = budgetMingguan(
      b.rincian.map((r) => ({
        tanggal: r.tanggal,
        namaTipeHari: r.nama_tipe_hari,
        targetKalori: r.target_kalori,
        targetAsliKalori: r.target_asli_kalori ?? undefined,
        terpakaiKalori: r.terpakai_kalori,
        targetProteinG: r.target_protein_g,
      })),
      k.hariIni,
    );
    // Lantai diambil dari jawaban SQL: batasnya milik SERVER, dan memberi TS
    // angka lain berarti menguji dua aturan yang berbeda.
    const ts = hitungRedistribusi(budget, k.opsi, h.batas_bawah_kalori, k.tumpuk);

    const beda = [];
    const bandingkan = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    bandingkan('opsi', h.opsi, ts.opsi);
    bandingkan('perlu_dipindah', h.perlu_dipindah, ts.perluDipindah);
    bandingkan('terserap', h.terserap, ts.terserap);
    bandingkan('tersisa', h.tersisa, ts.tersisa);
    bandingkan('dibatasi_lantai', h.dibatasi_lantai, ts.dibatasiLantai);
    bandingkan('jumlah hari', h.hari.length, ts.hari.length);
    h.hari.forEach((r, i) => {
      const t = ts.hari[i];
      if (!t) return;
      bandingkan(`hari[${i}].tanggal`, r.tanggal, t.tanggal);
      bandingkan(`hari[${i}].target_lama`, r.target_lama, t.targetLama);
      bandingkan(`hari[${i}].target_baru`, r.target_baru, t.targetBaru);
      bandingkan(`hari[${i}].selisih`, r.selisih, t.selisih);
      bandingkan(`hari[${i}].kena_lantai`, r.kena_lantai, t.kenaLantai);
      // Lantai bukan sekadar penanda: tidak satu pun target baru boleh
      // menembusnya ke bawah.
      if (r.target_baru < h.batas_bawah_kalori) {
        beda.push(`hari[${i}] target ${r.target_baru} menembus lantai ${h.batas_bawah_kalori}`);
      }
      if (r.target_baru % kelipatanSql !== 0) {
        beda.push(`hari[${i}] target ${r.target_baru} bukan kelipatan ${kelipatanSql}`);
      }
    });
    // Tidak boleh ada kalori yang hilang tanpa keterangan.
    if (h.terserap + h.tersisa !== h.perlu_dipindah) {
      beda.push(`terserap + tersisa (${h.terserap + h.tersisa}) ≠ perlu (${h.perlu_dipindah})`);
    }

    if (beda.length > 0) gagalRedis += 1;
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${k.label.padEnd(17)} ${String(h.perlu_dipindah).padStart(9)}  ` +
        `${String(h.terserap).padStart(9)}  ${String(ts.terserap).padStart(8)}  ` +
        `${String(h.tersisa).padStart(8)}  ${String(ts.tersisa).padStart(7)}  ${h.dibatasi_lantai}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  console.log();
  if (gagalRedis > 0) {
    console.error(`✗ ${gagalRedis} kasus BERBEDA (redistribusi kalori mingguan).`);
    process.exit(1);
  }
  console.log(
    `✓ ${KASUS_REDIS.length} kasus cocok — redistribusi di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 9: proteksi protein pada redistribusi ========================
  //
  // Dua jalur penerapan harus menghasilkan keadaan yang sama: `terapkan_
  // redistribusi` di server, dan `terapkanRedistribusi` di memori yang dipakai
  // pratinjau. Kalau keduanya berbeda, pengguna melihat satu angka sebelum
  // menekan dan angka lain sesudahnya. Sekalian dibuktikan bahwa yang bergeser
  // hanya KALORI: `periksaProteksiProtein` membandingkan target protein per
  // hari sebelum dan sesudah, dan hasilnya dicocokkan dengan jawaban server.
  console.log();
  const { terapkanRedistribusi, periksaProteksiProtein } = muatLogikaTs();

  const UID_PROTEIN = '99999999-5555-5555-5555-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_PROTEIN}', 'paritas-protein@contoh.test');`);
  sql(`update public.profiles set fase_aktif = 'Lean Gain' where user_id = '${UID_PROTEIN}';`);
  // Pekan dengan kelebihan yang harus ditutup: Sen–Rab makan di atas target.
  sql(`
    set request.jwt.claim.sub = '${UID_PROTEIN}';
    select public.setel_tipe_hari(date '2026-09-21',
             (select id from public.day_types
               where user_id = '${UID_PROTEIN}' and nama = 'Angkat Beban'));
    select public.setel_tipe_hari(date '2026-09-22',
             (select id from public.day_types
               where user_id = '${UID_PROTEIN}' and nama = 'Beban+Lari'));
    select public.setel_tipe_hari(date '2026-09-23',
             (select id from public.day_types
               where user_id = '${UID_PROTEIN}' and nama = 'Rest'));
    update public.daily_logs set kalori = 3600
      where user_id = '${UID_PROTEIN}' and tanggal = date '2026-09-21';
    update public.daily_logs set kalori = 3800
      where user_id = '${UID_PROTEIN}' and tanggal = date '2026-09-22';
    update public.daily_logs set kalori = 2600
      where user_id = '${UID_PROTEIN}' and tanggal = date '2026-09-23';`);

  const PEKAN = '2026-09-23';
  const keHariBudget = (rincian) =>
    rincian.map((r) => ({
      tanggal: r.tanggal,
      namaTipeHari: r.nama_tipe_hari,
      targetKalori: r.target_kalori,
      targetAsliKalori: r.target_asli_kalori ?? undefined,
      terpakaiKalori: r.terpakai_kalori,
      targetProteinG: r.target_protein_g,
    }));

  const bacaBudget = () =>
    JSON.parse(
      sql(
        `set request.jwt.claim.sub = '${UID_PROTEIN}';
         select public.budget_mingguan(date '${PEKAN}', date '${PEKAN}')::text;`,
      ),
    );

  const sebelumSql = bacaBudget();
  const sebelumTs = keHariBudget(sebelumSql.rincian);
  const budgetSebelum = budgetMingguan(sebelumTs, PEKAN);
  const tawaran = JSON.parse(
    sql(
      `set request.jwt.claim.sub = '${UID_PROTEIN}';
       select public.hitung_redistribusi(date '${PEKAN}', 'sebar_rata'::public.opsi_redistribusi,
              null, date '${PEKAN}')::text;`,
    ),
  );
  const hasilTs = hitungRedistribusi(
    budgetSebelum,
    'sebar_rata',
    tawaran.batas_bawah_kalori,
  );
  // Penerapan DI MEMORI, jalur yang dipakai pratinjau.
  const sesudahTs = terapkanRedistribusi(sebelumTs, hasilTs);

  // Penerapan di SERVER.
  sql(
    `set request.jwt.claim.sub = '${UID_PROTEIN}';
     select public.terapkan_redistribusi(date '${PEKAN}', 'sebar_rata'::public.opsi_redistribusi,
            null, date '${PEKAN}', 'paritas')::text;`,
  );
  const sesudahSql = keHariBudget(bacaBudget().rincian);

  const bedaProteksi = [];
  const cek = (nama, kiri, kanan) => {
    if (kiri !== kanan) bedaProteksi.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
  };
  sesudahSql.forEach((r, i) => {
    const t = sesudahTs[i];
    cek(`sesudah[${r.tanggal}].targetKalori`, r.targetKalori, t.targetKalori);
    cek(`sesudah[${r.tanggal}].targetAsliKalori`, r.targetAsliKalori, t.targetAsliKalori);
    cek(`sesudah[${r.tanggal}].targetProteinG`, r.targetProteinG, t.targetProteinG);
    // Protein per hari tidak boleh bergeser sedikit pun di kedua jalur.
    cek(`protein[${r.tanggal}] tetap`, r.targetProteinG, sebelumTs[i].targetProteinG);
  });

  const proteksiTs = periksaProteksiProtein(sebelumTs, sesudahTs);
  const proteksiSql = JSON.parse(
    sql(
      `set request.jwt.claim.sub = '${UID_PROTEIN}';
       select public.proteksi_protein(date '${PEKAN}', date '${PEKAN}')::text;`,
    ),
  );
  cek('utuh', proteksiSql.utuh, proteksiTs.utuh);
  if (proteksiSql.penjaga_aktif !== true) {
    bedaProteksi.push('pemicu penjaga protein tidak aktif di database');
  }
  // Kalori sebelum/sesudah per hari harus sama di kedua sisi, karena itulah
  // angka yang dipakai untuk MEMPERLIHATKAN bahwa hanya kalori yang bergeser.
  proteksiSql.rincian.forEach((r, i) => {
    const t = proteksiTs.hari[i];
    if (!t) return;
    cek(`proteksi[${r.tanggal}].kaloriSebelum`, r.kalori_rencana, t.kaloriSebelum);
    cek(`proteksi[${r.tanggal}].kaloriSesudah`, r.kalori_berlaku, t.kaloriSesudah);
    cek(`proteksi[${r.tanggal}].proteinG`, Number(r.protein_g), t.proteinG);
    cek(`proteksi[${r.tanggal}].proteinSesudahG`, Number(r.protein_g), t.proteinSesudahG);
  });

  console.log('proteksi protein   SQL utuh  TS utuh  hari digeser  kalori digeser  penjaga');
  console.log('─'.repeat(84));
  console.log(
    `${bedaProteksi.length === 0 ? '✓' : '✗'} penerapan sejalan  ` +
      `${String(proteksiSql.utuh).padStart(8)}  ${String(proteksiTs.utuh).padStart(7)}  ` +
      `${String(proteksiSql.jumlah_diredistribusi).padStart(12)}  ` +
      `${String(proteksiSql.kalori_dipindah).padStart(14)}  ${proteksiSql.penjaga_aktif}`,
  );
  for (const d of bedaProteksi) console.log(`    ↳ ${d}`);

  console.log();
  if (bedaProteksi.length > 0) {
    console.error(`✗ ${bedaProteksi.length} selisih (proteksi protein & penerapan redistribusi).`);
    process.exit(1);
  }
  console.log(
    '✓ Penerapan server & pratinjau menghasilkan keadaan sama, dan protein tidak bergeser di keduanya.',
  );

  // === Bagian 10: estimasi TDEE tiga metode ================================
  //
  // TDEE bukan satu rumus, melainkan tiga yang harus SEPAKAT lintas bahasa:
  // BMR majemuk dari tiga suku, massa tanpa lemak, dan energi berat per hari.
  // Ketiganya memakai pecahan (6,25 · 21,6 · 7.700/hari), jadi presisi float
  // ikut diuji, bukan cuma logikanya. Masukan diambil dari jawaban SQL supaya
  // yang dibandingkan rumusnya, bukan cara masing-masing membaca tabel.
  console.log();
  const { estimasiTdee, pengaliRataRata, KCAL_PER_KG, PENGALI_AKTIVITAS } = muatLogikaTs();

  const bedaKonstanta = [];
  if (Number(sql('select public.kcal_per_kg();')) !== KCAL_PER_KG) {
    bedaKonstanta.push(`kcal_per_kg: SQL ${sql('select public.kcal_per_kg();')} vs TS ${KCAL_PER_KG}`);
  }
  for (const nama of ['Rest', 'Angkat Beban', 'Beban+Lari', 'Padel', 'Yoga']) {
    const sqlPengali = Number(sql(`select public.pengali_aktivitas('${nama}');`));
    const tsPengali = PENGALI_AKTIVITAS[nama] ?? 1.5;
    if (sqlPengali !== tsPengali) {
      bedaKonstanta.push(`pengali ${nama}: SQL ${sqlPengali} vs TS ${tsPengali}`);
    }
  }
  if (bedaKonstanta.length > 0) {
    for (const d of bedaKonstanta) console.error(`✗ ${d}`);
    process.exit(1);
  }
  console.log('✓ konstanta TDEE sama: 7.700 kcal/kg & lima pengali aktivitas');

  const UID_TDEE = '99999999-6666-6666-6666-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_TDEE}', 'paritas-tdee@contoh.test');`);
  sql(`update public.profiles
          set tinggi_cm = 178, jenis_kelamin = 'pria', tanggal_lahir = date '1994-05-10'
        where user_id = '${UID_TDEE}';`);
  // 14 hari dengan berat yang MENANJAK tidak rata dan asupan yang berbeda-beda,
  // supaya rata-ratanya bukan angka bulat dan pembulatannya ikut teruji.
  sql(`
    set request.jwt.claim.sub = '${UID_TDEE}';
    select public.setel_tipe_hari((date '2026-09-10' + i)::date,
             (select id from public.day_types
               where user_id = '${UID_TDEE}'
                 and nama = (array['Rest','Angkat Beban','Beban+Lari','Padel'])[1 + (i % 4)]))
      from generate_series(0, 13) as i;
    update public.daily_logs
       set berat_pagi_kg = 74.00 + (0.07 * (tanggal - date '2026-09-10')),
           sumber_berat = 'manual',
           kalori = 2650 + 37 * ((tanggal - date '2026-09-10') % 5)
     where user_id = '${UID_TDEE}'
       and tanggal between date '2026-09-10' and date '2026-09-23';`);

  const KASUS_TDEE = [
    { label: 'tiga metode', sampai: '2026-09-23', hari: 14, bf: 18 },
    { label: 'tanpa body fat', sampai: '2026-09-23', hari: 14, bf: null },
    { label: 'periode 7 hari', sampai: '2026-09-23', hari: 7, bf: 18 },
    { label: 'body fat rendah', sampai: '2026-09-23', hari: 14, bf: 9.5 },
    { label: 'periode 30 hari', sampai: '2026-09-23', hari: 30, bf: 18 },
  ];

  let gagalTdee = 0;
  console.log('kasus             metode  SQL min/maks    TS min/maks     SQL tengah  TS tengah  keyakinan');
  console.log('─'.repeat(98));
  for (const k of KASUS_TDEE) {
    const bf = k.bf === null ? 'null' : String(k.bf);
    const t = JSON.parse(
      sql(
        `set request.jwt.claim.sub = '${UID_TDEE}';
         select public.estimasi_tdee(date '${k.sampai}', ${k.hari}, ${bf})::text;`,
      ),
    );
    const m = t.masukan;
    const ts = estimasiTdee({
      beratKg: Number(m.berat_kg),
      tinggiCm: m.tinggi_cm === null ? null : Number(m.tinggi_cm),
      usiaTahun: m.usia_tahun,
      jenisKelamin: m.jenis_kelamin,
      persenLemak: m.persen_lemak === null ? null : Number(m.persen_lemak),
      tipeHariMinggu: m.tipe_hari_minggu,
      hariData: m.hari_data,
      rataAsupanKalori: m.rata_asupan_kalori === null ? null : Number(m.rata_asupan_kalori),
      perubahanBeratKg: m.perubahan_berat_kg === null ? null : Number(m.perubahan_berat_kg),
    });

    const beda = [];
    const cek = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    cek('jumlah metode', t.metode.length, ts.metode.length);
    t.metode.forEach((r, i) => {
      const x = ts.metode[i];
      if (!x) return;
      cek(`metode[${i}].nama`, r.nama, x.nama);
      cek(`metode[${i}].nilai`, r.nilai, x.nilai);
      cek(`metode[${i}].berbasisData`, r.berbasis_data, x.berbasisData);
    });
    cek('min', t.min, ts.min);
    cek('maks', t.maks, ts.maks);
    cek('tengah', t.tengah, ts.tengah);
    cek('keyakinan', t.keyakinan, ts.keyakinan);
    // Pengali aktivitas dihitung dua kali dari daftar tipe hari yang sama.
    cek(
      'pengali',
      Number(t.pengali_aktivitas),
      Number(pengaliRataRata(m.tipe_hari_minggu).toFixed(6)),
    );

    if (beda.length > 0) gagalTdee += 1;
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${k.label.padEnd(16)} ${String(t.metode.length).padStart(6)}  ` +
        `${String(`${t.min}–${t.maks}`).padEnd(14)}  ${String(`${ts.min}–${ts.maks}`).padEnd(14)}  ` +
        `${String(t.tengah).padStart(10)}  ${String(ts.tengah).padStart(9)}  ${t.keyakinan}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  console.log();
  if (gagalTdee > 0) {
    console.error(`✗ ${gagalTdee} kasus BERBEDA (estimasi TDEE).`);
    process.exit(1);
  }
  console.log(`✓ ${KASUS_TDEE.length} kasus cocok — estimasi TDEE di SQL dan TypeScript sejalan.`);

  // === Bagian 11: estimasi body fat Navy ===================================
  //
  // Rumusnya memuat DUA logaritma basis 10 dan pembagian berantai, jadi yang
  // diuji di sini bukan logikanya melainkan presisinya: selisih pada desimal
  // ketiga sudah cukup menggeser persen yang ditampilkan. Ditambah tiga jalur
  // penolakan yang harus DIBEDAKAN — pinggang ≤ leher, hasil di luar 3–70%,
  // dan profil yang belum lengkap — karena ketiganya menuntut tindakan berbeda
  // dari pengguna.
  console.log();
  const { estimasiBodyFatNavy, komposisiTubuh, KETIDAKPASTIAN_BF } = muatLogikaTs();

  const bfSql = Number(sql('select public.ketidakpastian_bf();'));
  if (bfSql !== KETIDAKPASTIAN_BF) {
    console.error(`✗ Ketidakpastian BF BERBEDA: SQL ${bfSql} vs TS ${KETIDAKPASTIAN_BF}.`);
    process.exit(1);
  }
  console.log(`✓ ketidakpastian metode Navy sama: ±${bfSql} poin`);

  const UID_BF = '99999999-7777-7777-7777-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_BF}', 'paritas-bf@contoh.test');`);

  // Tanggal ukuran dipatok RELATIF ke hari ini karena `simpan_ukuran` menolak
  // tanggal masa depan menurut jam server.
  const HARI_INI = sql("select (now() at time zone 'Asia/Jakarta')::date;");

  const KASUS_BF = [
    { label: 'pria biasa', jk: 'pria', tinggi: 178, pinggang: 85.4, leher: 38.5 },
    { label: 'pria kurus', jk: 'pria', tinggi: 178, pinggang: 74.2, leher: 36.0 },
    { label: 'pria gemuk', jk: 'pria', tinggi: 172, pinggang: 110.5, leher: 42.5 },
    { label: 'tinggi ekstrem', jk: 'pria', tinggi: 205, pinggang: 96.3, leher: 41.2 },
    { label: 'desimal ganjil', jk: 'pria', tinggi: 177.3, pinggang: 85.37, leher: 38.44 },
    // Pinggang ≤ leher → rumusnya tidak bisa dihitung sama sekali.
    { label: 'pinggang < leher', jk: 'pria', tinggi: 178, pinggang: 50.0, leher: 55.0 },
    // Hasil di bawah batas hidup manusia.
    { label: 'hasil < 3%', jk: 'pria', tinggi: 178, pinggang: 60.0, leher: 30.0 },
    // Hasil di atas yang pernah terukur.
    { label: 'hasil > 70%', jk: 'pria', tinggi: 100, pinggang: 160.0, leher: 25.0 },
    // Profil belum lengkap, dua bentuk.
    { label: 'tanpa jenis kelamin', jk: null, tinggi: 178, pinggang: 85.4, leher: 38.5 },
    { label: 'tanpa tinggi', jk: 'pria', tinggi: null, pinggang: 85.4, leher: 38.5 },
    // Wanita: rumusnya butuh pinggul yang belum dicatat app ini.
    { label: 'wanita tanpa pinggul', jk: 'wanita', tinggi: 165, pinggang: 74.0, leher: 32.0 },
  ];

  let gagalBf = 0;
  console.log('kasus                  SQL persen  TS persen  SQL rentang    TS rentang     kurang');
  console.log('─'.repeat(96));
  for (const k of KASUS_BF) {
    sql(`update public.profiles
            set jenis_kelamin = ${k.jk === null ? 'null' : `'${k.jk}'`},
                tinggi_cm = ${k.tinggi === null ? 'null' : k.tinggi}
          where user_id = '${UID_BF}';`);
    // Satu pencatatan, ditimpa tiap kasus lewat jalur normalnya.
    sql(`
      set request.jwt.claim.sub = '${UID_BF}';
      select public.hapus_ukuran(date '${HARI_INI}');
      select public.simpan_ukuran(date '${HARI_INI}', ${k.pinggang}, null, ${k.leher});`);

    const b = JSON.parse(
      sql(
        `set request.jwt.claim.sub = '${UID_BF}';
         select public.estimasi_body_fat(date '${HARI_INI}')::text;`,
      ),
    );
    const m = b.masukan;
    const ts = estimasiBodyFatNavy({
      jenisKelamin: m.jenis_kelamin,
      tinggiCm: m.tinggi_cm === null ? null : Number(m.tinggi_cm),
      pinggangCm: Number(m.pinggang_cm),
      leherCm: Number(m.leher_cm),
      pinggulCm: m.pinggul_cm === null ? null : Number(m.pinggul_cm),
    });

    const beda = [];
    const cek = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    const angka = (n) => (n === null || n === undefined ? null : Number(n));
    cek('metode', b.metode, ts.metode);
    cek('persen', angka(b.persen), ts.persen);
    cek('ketidakpastian', b.ketidakpastian, ts.ketidakpastian);
    cek('kurang', b.kurang, ts.kurang);
    cek('rentang.bawah', angka(b.rentang?.bawah) ?? null, ts.rentang?.bawah ?? null);
    cek('rentang.atas', angka(b.rentang?.atas) ?? null, ts.rentang?.atas ?? null);
    cek('sensitivitas', angka(b.sensitivitas_pinggang), ts.sensitivitasPinggang);
    // Rentangnya tidak pernah boleh ada tanpa persennya, dan sebaliknya.
    if ((b.persen === null) !== (b.rentang === null)) {
      beda.push('persen & rentang tidak sepakat soal ada/tidaknya');
    }

    if (beda.length > 0) gagalBf += 1;
    const rSql = b.rentang ? `${b.rentang.bawah}–${b.rentang.atas}` : '—';
    const rTs = ts.rentang ? `${ts.rentang.bawah}–${ts.rentang.atas}` : '—';
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${k.label.padEnd(21)} ${String(b.persen ?? '—').padStart(10)}  ` +
        `${String(ts.persen ?? '—').padStart(9)}  ${rSql.padEnd(13)}  ${rTs.padEnd(13)}  ` +
        `${b.kurang ?? '—'}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  // Komposisi tubuh: memecah berat memakai persen yang DITAMPILKAN, bukan nilai
  // mentahnya — "18,2% dari 75 kg" yang menghasilkan massa lemak dari 18,23%
  // akan terbaca sebagai aritmetika yang salah.
  sql(`update public.profiles set jenis_kelamin = 'pria', tinggi_cm = 178
        where user_id = '${UID_BF}';`);
  sql(`
    set request.jwt.claim.sub = '${UID_BF}';
    select public.hapus_ukuran(date '${HARI_INI}');
    select public.simpan_ukuran(date '${HARI_INI}', 85.4, null, 38.5);
    select public.simpan_berat_pagi(date '${HARI_INI}', 75.0);`);
  const bKomp = JSON.parse(
    sql(
      `set request.jwt.claim.sub = '${UID_BF}';
       select public.estimasi_body_fat(date '${HARI_INI}')::text;`,
    ),
  );
  const kompTs = komposisiTubuh(Number(bKomp.persen), Number(bKomp.berat_kg));
  const bedaKomp = [];
  if (Number(bKomp.komposisi.lemak_kg) !== kompTs.lemakKg) {
    bedaKomp.push(`lemak_kg: SQL ${bKomp.komposisi.lemak_kg} vs TS ${kompTs.lemakKg}`);
  }
  if (Number(bKomp.komposisi.bebas_lemak_kg) !== kompTs.bebasLemakKg) {
    bedaKomp.push(
      `bebas_lemak_kg: SQL ${bKomp.komposisi.bebas_lemak_kg} vs TS ${kompTs.bebasLemakKg}`,
    );
  }
  if (bedaKomp.length > 0) gagalBf += 1;
  console.log(
    `${bedaKomp.length === 0 ? '✓' : '✗'} komposisi ${bKomp.persen}% × ${bKomp.berat_kg} kg → ` +
      `SQL ${bKomp.komposisi.lemak_kg}/${bKomp.komposisi.bebas_lemak_kg} kg · ` +
      `TS ${kompTs.lemakKg}/${kompTs.bebasLemakKg} kg`,
  );
  for (const d of bedaKomp) console.log(`    ↳ ${d}`);

  console.log();
  if (gagalBf > 0) {
    console.error(`✗ ${gagalBf} kasus BERBEDA (estimasi body fat Navy).`);
    process.exit(1);
  }
  console.log(
    `✓ ${KASUS_BF.length + 1} kasus cocok — estimasi body fat Navy di SQL dan TypeScript sejalan.`,
  );

  // === Bagian 12: riwayat & delta ukuran ===================================
  //
  // Tiga aturan sekaligus. Yang diuji terutama selang yang panjangnya TIDAK
  // seragam — keadaan normal untuk pencatatan mingguan yang tertunda sehari-dua
  // hari — dan bagian tubuh yang tidak diukur di sebagian tanggal, karena
  // keduanya mengubah pembagi laju per pekan.
  //
  // Satu hal yang TIDAK diuji di sini, dan sebaiknya disebut daripada
  // disamarkan: urutan pembulatan (laju dari selisih yang sudah dibulatkan vs
  // dari nilai mentah) tidak bisa dibedakan lewat jalur ini, karena kolomnya
  // numeric(5,1) — selisih dua nilai tersimpan selalu sudah berdesimal satu.
  // Membalik urutannya di SQL tidak membuat satu pun kasus di bawah berbeda.
  console.log();
  const { ringkasPerubahan, lajuTerkini, statusBatasPinggang, HARI_PER_PEKAN } = muatLogikaTs();

  const pekanSql = Number(sql('select public.hari_per_pekan();'));
  const ambangSql = Number(sql('select public.ambang_pekan_batas();'));
  if (pekanSql !== HARI_PER_PEKAN) {
    console.error(`✗ Hari per pekan BERBEDA: SQL ${pekanSql} vs TS ${HARI_PER_PEKAN}.`);
    process.exit(1);
  }
  console.log(`✓ konstanta riwayat sama: ${pekanSql} hari/pekan, ambang ${ambangSql} pekan`);

  const UID_RIWAYAT = '99999999-8888-8888-8888-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_RIWAYAT}', 'paritas-riwayat@contoh.test');`);

  // Selang SENGAJA tidak seragam (7, 3, 12, 7, 9 hari) dan dua bagian tubuh
  // bolong di sebagian tanggal, supaya jalur "lewati tanggal tanpa pengukuran"
  // ikut terbandingkan.
  const CATATAN = [
    { geser: 38, pinggang: 85.4, dada: 102.0, leher: 38.5, paha: 57.0 },
    { geser: 31, pinggang: 85.1, dada: 101.6, leher: 38.5, paha: null },
    { geser: 28, pinggang: 84.9, dada: null, leher: 38.4, paha: 56.8 },
    { geser: 16, pinggang: 84.4, dada: 101.2, leher: 38.4, paha: null },
    { geser: 9, pinggang: 84.6, dada: null, leher: 38.3, paha: 56.5 },
    { geser: 0, pinggang: 84.2, dada: 100.9, leher: 38.3, paha: 56.3 },
  ];
  for (const c of CATATAN) {
    const n = (v) => (v === null ? 'null' : v);
    sql(`
      set request.jwt.claim.sub = '${UID_RIWAYAT}';
      select public.simpan_ukuran(
        ((now() at time zone 'Asia/Jakarta')::date - ${c.geser})::date,
        ${n(c.pinggang)}, ${n(c.dada)}, ${n(c.leher)}, null, null, ${n(c.paha)}, null);`);
  }

  const BAGIAN = ['pinggang_cm', 'dada_cm', 'leher_cm', 'paha_kiri_cm'];
  let gagalRiwayat = 0;
  console.log('bagian           titik  selang  SQL total  TS total  SQL laju  TS laju');
  console.log('─'.repeat(78));

  const r = JSON.parse(
    sql(
      `set request.jwt.claim.sub = '${UID_RIWAYAT}';
       select public.riwayat_ukuran(null, 12, 4)::text;`,
    ),
  );

  for (const bagian of BAGIAN) {
    const b = r.bagian[bagian];
    const titik = b.titik.map((t) => ({ tanggal: t.tanggal, nilai: Number(t.nilai) }));
    const ts = ringkasPerubahan(titik);
    const tsLaju = lajuTerkini(titik);

    const beda = [];
    const cek = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    const angka = (n) => (n === null || n === undefined ? null : Number(n));

    cek('jumlah selang', b.perubahan.length, ts.perubahan.length);
    b.perubahan.forEach((p, i) => {
      const t = ts.perubahan[i];
      if (!t) return;
      cek(`selang[${i}].dari`, p.dari, t.dari);
      cek(`selang[${i}].ke`, p.ke, t.ke);
      cek(`selang[${i}].nilai_dari`, Number(p.nilai_dari), t.nilaiDari);
      cek(`selang[${i}].nilai_ke`, Number(p.nilai_ke), t.nilaiKe);
      cek(`selang[${i}].selisih`, Number(p.selisih), t.selisih);
      cek(`selang[${i}].jarak_hari`, p.jarak_hari, t.jarakHari);
      cek(`selang[${i}].laju_per_pekan`, Number(p.laju_per_pekan), t.lajuPerPekan);
    });
    cek('total_selisih', angka(b.total_selisih), ts.totalSelisih);
    cek('rentang_hari', b.rentang_hari, ts.rentangHari);
    cek('awal.tanggal', b.awal.tanggal, ts.awal?.tanggal ?? null);
    cek('akhir.nilai', Number(b.akhir.nilai), ts.akhir?.nilai ?? null);
    cek('laju_terkini', angka(b.laju_terkini), tsLaju);
    // Total selisih harus sama dengan jumlah tiap selang; kalau tidak, salah
    // satu dari keduanya salah dan layar memperlihatkan dua cerita berbeda.
    if (ts.totalSelisih !== null) {
      const jumlah = b.perubahan.reduce((n, p) => n + Number(p.selisih), 0);
      if (Math.abs(jumlah - Number(b.total_selisih)) > 0.001) {
        beda.push(`total ${b.total_selisih} ≠ jumlah selang ${jumlah.toFixed(1)}`);
      }
    }

    if (beda.length > 0) gagalRiwayat += 1;
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${bagian.padEnd(15)} ${String(b.titik.length).padStart(5)}  ` +
        `${String(b.perubahan.length).padStart(6)}  ${String(b.total_selisih).padStart(9)}  ` +
        `${String(ts.totalSelisih).padStart(8)}  ${String(b.laju_terkini).padStart(8)}  ${tsLaju}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  // Batas pinggang: empat keadaan, dan yang menentukan adalah perkiraan WAKTU
  // sampai batas tercapai, bukan jaraknya.
  //
  // Deret di atas MENGECIL, jadi lajunya negatif dan batasnya tidak sedang
  // didekati — tiga keadaan bisa diuji darinya, tapi `mendekat` tidak. Untuk itu
  // dipakai pengguna kedua dengan pinggang yang NAIK +0,3 cm/pekan.
  const UID_NAIK = '99999999-9999-8888-8888-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_NAIK}', 'paritas-naik@contoh.test');`);
  for (const [geser, nilai] of [[21, 84.0], [14, 84.3], [7, 84.6], [0, 84.9]]) {
    sql(`
      set request.jwt.claim.sub = '${UID_NAIK}';
      select public.simpan_ukuran(
        ((now() at time zone 'Asia/Jakarta')::date - ${geser})::date, ${nilai}, null, 38.5);`);
  }

  const KASUS_BATAS = [
    { label: 'belum ditetapkan', uid: UID_RIWAYAT, batas: null },
    { label: 'sudah lewat', uid: UID_RIWAYAT, batas: 83.0 },
    { label: 'laju turun → aman', uid: UID_RIWAYAT, batas: 95.0 },
    // Pinggang naik +0,3/pekan, sisa 0,6 cm → 2,0 pekan lagi, di bawah ambang 4.
    { label: 'mendekat', uid: UID_NAIK, batas: 85.5 },
    // Sisa 3,1 cm dengan laju yang sama → 10,4 pekan, masih aman.
    { label: 'laju naik → aman', uid: UID_NAIK, batas: 88.0 },
  ];
  console.log();
  console.log('batas pinggang     SQL keadaan        TS keadaan        SQL pekan  TS pekan');
  console.log('─'.repeat(82));
  for (const k of KASUS_BATAS) {
    sql(`update public.profiles set batas_pinggang_cm = ${k.batas ?? 'null'}
          where user_id = '${k.uid}';`);
    const rr = JSON.parse(
      sql(
        `set request.jwt.claim.sub = '${k.uid}';
         select public.riwayat_ukuran(null, 12, 4)::text;`,
      ),
    );
    const bp = rr.batas_pinggang;
    const titik = rr.bagian.pinggang_cm.titik.map((t) => ({
      tanggal: t.tanggal,
      nilai: Number(t.nilai),
    }));
    const ts = statusBatasPinggang(
      titik[titik.length - 1].nilai,
      k.batas,
      lajuTerkini(titik),
    );

    const beda = [];
    const cek = (nama, kiri, kanan) => {
      if (kiri !== kanan) beda.push(`${nama}: SQL ${kiri} vs TS ${kanan}`);
    };
    const angka = (n) => (n === null || n === undefined ? null : Number(n));
    cek('keadaan', bp.keadaan, ts.keadaan);
    cek('selisih_cm', angka(bp.selisih_cm), ts.selisihCm);
    cek('laju_per_pekan', angka(bp.laju_per_pekan), ts.lajuPerPekan);
    cek('pekan_lagi', angka(bp.pekan_lagi), ts.pekanLagi);

    if (beda.length > 0) gagalRiwayat += 1;
    console.log(
      `${beda.length === 0 ? '✓' : '✗'} ${k.label.padEnd(17)} ${String(bp.keadaan).padEnd(17)}  ` +
        `${String(ts.keadaan).padEnd(16)}  ${String(bp.pekan_lagi).padStart(9)}  ${ts.pekanLagi}`,
    );
    for (const d of beda) console.log(`    ↳ ${d}`);
  }

  console.log();
  if (gagalRiwayat > 0) {
    console.error(`✗ ${gagalRiwayat} kasus BERBEDA (riwayat & delta ukuran).`);
    process.exit(1);
  }
  console.log(
    `✓ ${BAGIAN.length} bagian tubuh & ${KASUS_BATAS.length} keadaan batas cocok — ` +
      'riwayat & delta ukuran di SQL dan TypeScript sejalan.',
  );

  // === Bagian 13: pohon keputusan evaluasi 4 mingguan ======================
  //
  // Delapan belas verdict dari tiga fase, empat arah per sumbu, dan lima
  // kemungkinan jumlah pekan data. Menukar dua cabang saja sudah cukup mengubah
  // verdict untuk sebagian kombinasi — dan tidak ada kasus uji pilihan tangan
  // yang bisa menjamin semua kombinasi itu tersentuh. Karena itu SELURUH
  // 960 kombinasi dijalankan lewat kedua sisi, sekali jalan, lalu dibandingkan
  // satu per satu: kode, penentu, dan keyakinan.
  console.log();
  const { evaluasi4Mingguan, PEKAN_EVALUASI } = muatLogikaTs();

  const pekanSqlEval = Number(sql('select public.pekan_evaluasi();'));
  if (pekanSqlEval !== PEKAN_EVALUASI) {
    console.error(`✗ Pekan evaluasi BERBEDA: SQL ${pekanSqlEval} vs TS ${PEKAN_EVALUASI}.`);
    process.exit(1);
  }

  const semuaSql = JSON.parse(
    sql(`
      select jsonb_agg(
               jsonb_build_object(
                 'fase', f.fase, 'berat', b.a, 'pinggang', p.a, 'kekuatan', k.a, 'pekan', n.n,
                 'hasil', public.kode_evaluasi(f.fase::public.fase_program, b.a, p.a, k.a, n.n)
               ))::text
        from (values ('Lean Gain'), ('Cut'), ('Maintenance')) as f(fase)
        cross join (values ('naik'), ('datar'), ('turun'), ('belum jelas')) as b(a)
        cross join (values ('naik'), ('datar'), ('turun'), ('belum jelas')) as p(a)
        cross join (values ('naik'), ('datar'), ('turun'), ('belum jelas')) as k(a)
        cross join generate_series(0, 4) as n(n);`),
  );

  let gagalEval = 0;
  const contohBeda = [];
  const perKode = new Map();
  for (const baris of semuaSql) {
    const ts = evaluasi4Mingguan({
      fase: baris.fase,
      arahBerat: baris.berat,
      arahPinggang: baris.pinggang,
      arahKekuatan: baris.kekuatan,
      pekanData: baris.pekan,
    });
    const h = baris.hasil;
    const sama = h.kode === ts.kode && h.penentu === ts.penentu && h.keyakinan === ts.keyakinan;
    if (!sama) {
      gagalEval += 1;
      if (contohBeda.length < 5) {
        contohBeda.push(
          `${baris.fase}/${baris.berat}/${baris.pinggang}/${baris.kekuatan}/${baris.pekan}: ` +
            `SQL ${h.kode}·${h.keyakinan} vs TS ${ts.kode}·${ts.keyakinan}`,
        );
      }
    }
    perKode.set(ts.kode, (perKode.get(ts.kode) ?? 0) + 1);
  }

  console.log(
    `${gagalEval === 0 ? '✓' : '✗'} ${semuaSql.length} kombinasi, ${perKode.size} kode verdict tersentuh`,
  );
  for (const d of contohBeda) console.log(`    ↳ ${d}`);

  console.log();
  if (semuaSql.length !== 960) {
    console.error(`✗ Kombinasi yang dijalankan ${semuaSql.length}, seharusnya 960.`);
    process.exit(1);
  }
  if (gagalEval > 0) {
    console.error(`✗ ${gagalEval} kombinasi BERBEDA (pohon keputusan evaluasi).`);
    process.exit(1);
  }
  console.log(
    `✓ 960 kombinasi cocok — kode, penentu, dan keyakinan evaluasi di SQL dan TypeScript sejalan.`,
  );

  // --- Nada notifikasi: pelanggaran_nada (SQL) = pelanggaranNada (TS) -------
  // Kalimat di tabel copy_notifikasi bisa diubah TANPA rilis app; CHECK SQL
  // yang menjaganya harus menolak persis yang ditolak pemeriksa TypeScript.
  console.log();
  const { pelanggaranNada, KATALOG_NOTIFIKASI } = muatLogikaTs();
  const KALIMAT_NADA = [
    'Kalori melebihi target!', 'JANGAN lupa timbang', 'Asupan berlebihan', '(gagal)', 'Awas, protein kurang',
    'Peringatan: tidur pendek', 'Terlalu banyak sat fat', 'kelebihan 300 kcal', 'Timbang pagi, kalau sempat.',
    'pejangan', 'Tidak ada yang gagal hari ini', 'Ringkasan siap', 'Bagus sekali!', 'menggagalkan', '',
  ];
  let gagalNada = 0;
  for (const k of KALIMAT_NADA) {
    const dariSql = sql(`select array_to_json(public.pelanggaran_nada(${`'${k.replaceAll("'", "''")}'`}))::text;`);
    const dariTs = JSON.stringify(pelanggaranNada(k));
    const cocok = dariSql === dariTs;
    if (!cocok) gagalNada += 1;
    console.log(`${cocok ? '✓' : '✗'} "${k}" SQL ${dariSql}  TS ${dariTs}`);
  }
  const barisCopy = JSON.parse(sql(`select json_agg(json_build_object('jenis', jenis, 'nama', nama, 'kapan', kapan,
    'judul', judul, 'isi', isi) order by jenis) from public.copy_notifikasi;`));
  const bedaCopy = KATALOG_NOTIFIKASI.filter((n) => {
    const b = barisCopy.find((x) => x.jenis === n.jenis);
    return !b || b.nama !== n.nama || b.kapan !== n.kapan || b.judul !== n.judul || b.isi !== n.isi;
  });
  if (bedaCopy.length > 0 || barisCopy.length !== KATALOG_NOTIFIKASI.length) gagalNada += 1;
  console.log(`${bedaCopy.length === 0 ? '✓' : '✗'} copy_notifikasi awal = KATALOG_NOTIFIKASI (${barisCopy.length} jenis)` +
    (bedaCopy.length ? ` — beda: ${bedaCopy.map((n) => n.jenis).join(', ')}` : ''));
  if (gagalNada > 0) {
    console.error(`✗ ${gagalNada} ketidakcocokan nada/copy notifikasi antara SQL dan TypeScript.`);
    process.exit(1);
  }
  console.log(`✓ Nada notifikasi: ${KALIMAT_NADA.length} kalimat dinilai sama di SQL dan TypeScript; copy awal sejalan.`);

  // --- Riwayat fase: ganti_fase (SQL) = terapkanGantiFase (TS) --------------
  // Pratinjau di sheet konfirmasi memakai kembaran TS; ia harus menyebut apa
  // yang BENAR-BENAR dilakukan server — ditutup, diganti, tetap, atau ditolak.
  console.log();
  const { terapkanGantiFase, faseSaat, majuHari: majuHariFase } = muatLogikaTs();
  const UID_FASE = '99999999-aaaa-aaaa-aaaa-999999999999';
  sql(`insert into auth.users (id, email) values ('${UID_FASE}', 'paritas-fase@contoh.test');`);
  const bacaRiwayat = () =>
    JSON.parse(
      sql(`select coalesce(json_agg(json_build_object('fase', fase, 'mulai', mulai_tanggal, 'selesai', selesai_tanggal)
             order by mulai_tanggal), '[]') from public.fase_periode where user_id = '${UID_FASE}';`),
    );
  let riwayatFaseTs = bacaRiwayat().map((p) => ({ ...p, beratAwalKg: null }));
  const d0 = riwayatFaseTs[0]?.mulai;
  if (!d0 || riwayatFaseTs.length !== 1) {
    console.error(`✗ Pengguna baru seharusnya punya tepat satu periode fase awal, dapat ${JSON.stringify(riwayatFaseTs)}`);
    process.exit(1);
  }
  const ff = riwayatFaseTs[0].fase;
  const lain = (f) => ['Maintenance', 'Lean Gain', 'Cut'].find((x) => x !== f);
  const LANGKAH = [
    { fase: lain(ff), hari: 10, harap: 'ditutup' },
    { fase: lain(ff), hari: 12, harap: 'tetap' },
    { fase: ff, hari: 10, harap: 'diganti' },
    { fase: 'Maintenance', hari: 5, harap: 'ditolak' },
    { fase: ff === 'Cut' ? 'Lean Gain' : 'Cut', hari: 20, harap: 'ditutup' },
    { fase: ff, hari: 20, harap: 'diganti' },
    { fase: ff, hari: 25, harap: 'tetap' },
    { fase: lain(ff), hari: 8, harap: 'ditolak' },
    { fase: lain(ff), hari: 30, harap: 'ditutup' },
  ];
  let gagalFase = 0;
  for (const l of LANGKAH) {
    const tgl = majuHariFase(d0, l.hari);
    let ditolakSql = false;
    try {
      sql(`set request.jwt.claim.sub = '${UID_FASE}'; select 1 from public.ganti_fase('${l.fase}', date '${tgl}');`, { diam: true });
    } catch {
      ditolakSql = true;
    }
    const ts = terapkanGantiFase(riwayatFaseTs, l.fase, tgl, null);
    if (ts.jenis !== 'ditolak') riwayatFaseTs = ts.riwayat;
    const dariSql = bacaRiwayat().map(({ fase, mulai, selesai }) => `${fase}:${mulai}..${selesai ?? ''}`).join(' | ');
    const dariTs = riwayatFaseTs.map(({ fase, mulai, selesai }) => `${fase}:${mulai}..${selesai ?? ''}`).join(' | ');
    const cocok = dariSql === dariTs && ditolakSql === (ts.jenis === 'ditolak') && ts.jenis === l.harap;
    if (!cocok) gagalFase += 1;
    console.log(`${cocok ? '✓' : '✗'} ${l.fase} pada D+${l.hari} → ${ts.jenis}${cocok ? '' : ` (harap ${l.harap}; SQL ${ditolakSql ? 'ditolak' : dariSql}; TS ${dariTs})`}`);
  }
  // Fase pada tiap tanggal: fase_pada_tanggal (SQL) = faseSaat (TS), dari
  // sebelum periode pertama sampai sesudah periode berjalan.
  const faseAktifSql = sql(`select fase_aktif from public.profiles where user_id = '${UID_FASE}';`);
  const tanggalUji = Array.from({ length: 45 }, (_, i) => majuHariFase(d0, i - 5));
  const faseDariSql = JSON.parse(
    sql(`set request.jwt.claim.sub = '${UID_FASE}';
         select json_agg(public.fase_pada_tanggal(t::date) order by t)
           from unnest(array[${tanggalUji.map((t) => `'${t}'`).join(',')}]) as t;`),
  );
  const bedaTanggal = tanggalUji.filter((t, i) => faseDariSql[i] !== faseSaat(riwayatFaseTs, t, faseAktifSql));
  if (bedaTanggal.length > 0) gagalFase += 1;
  console.log(`${bedaTanggal.length === 0 ? '✓' : '✗'} fase_pada_tanggal = faseSaat untuk ${tanggalUji.length} tanggal` +
    (bedaTanggal.length ? ` — beda: ${bedaTanggal.slice(0, 3).join(', ')}` : ''));
  const faseProfil = sql(`select fase_aktif from public.profiles where user_id = '${UID_FASE}';`);
  const faseTs = riwayatFaseTs.find((p) => p.selesai === null)?.fase;
  if (faseProfil !== faseTs) gagalFase += 1;
  console.log(`${faseProfil === faseTs ? '✓' : '✗'} profiles.fase_aktif (${faseProfil}) = periode berjalan TS (${faseTs})`);
  if (gagalFase > 0) {
    console.error(`✗ ${gagalFase} langkah ganti fase berbeda antara SQL dan TypeScript.`);
    process.exit(1);
  }
  console.log(`✓ Riwayat fase: ${LANGKAH.length} langkah ganti fase sama di SQL dan TypeScript (ditutup, diganti, tetap, ditolak).`);
} finally {
  hentikanPostgres();
}
