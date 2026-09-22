/**
 * Membuktikan aturan "sisa" di SQL dan di TypeScript menghasilkan angka SAMA.
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
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  return execFileSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-h', PGROOT, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-tAc', query],
    { encoding: 'utf8' },
  ).trim();
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
  copyFileSync('src/lib/format.ts', join(kerja, 'format.ts'));
  copyFileSync('src/types/domain.ts', join(kerja, 'domain.ts'));

  // Alias `@/…` tidak ada di luar proyek, jadi diarahkan ke berkas tetangga.
  writeFileSync(
    join(kerja, 'makro.ts'),
    readFileSync('src/lib/makro.ts', 'utf8').replace("@/types/domain", "./domain"),
  );

  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['makro.ts', 'format.ts', 'domain.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'makro.js'));
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
    console.error(`✗ ${gagal} kasus BERBEDA antara SQL dan TypeScript.`);
    process.exit(1);
  }
  console.log(`✓ ${KASUS.length} kasus cocok — aturan sisa di SQL dan TypeScript sejalan.`);
} finally {
  hentikanPostgres();
}
