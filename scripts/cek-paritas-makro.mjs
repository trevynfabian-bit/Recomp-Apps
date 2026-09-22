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

  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['makro.ts', 'format.ts', 'tipe.ts', 'deteksiTipeHari.ts', 'tren.ts',
     '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return {
    ...require(join(kerja, 'keluar', 'makro.js')),
    ...require(join(kerja, 'keluar', 'deteksiTipeHari.js')),
    ...require(join(kerja, 'keluar', 'tren.js')),
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
} finally {
  hentikanPostgres();
}
