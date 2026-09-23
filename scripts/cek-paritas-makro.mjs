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

function sql(query) {
  const keluaran = execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-h', PGROOT, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', query],
    { encoding: 'utf8' },
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

  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['makro.ts', 'format.ts', 'tipe.ts', 'deteksiTipeHari.ts', 'tren.ts', 'koridor.ts',
     'budget.ts', 'redistribusi.ts',
     '--module', 'commonjs', '--target', 'es2022',
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
} finally {
  hentikanPostgres();
}
