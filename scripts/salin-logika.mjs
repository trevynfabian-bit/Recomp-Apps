/**
 * Salin `@recomp/logika` ke `supabase/functions/_shared/logika/` untuk Deno.
 *
 * Kenapa salinan, bukan impor langsung dari `packages/logika/src`:
 *
 * 1. Deno menolak impor relatif TANPA akhiran (`from './format'`), padahal itu
 *    bentuk yang dipakai paket ini untuk Metro, Next.js, dan tsc. `deno check`
 *    gagal dengan "Maybe add a '.ts' extension" — dan Edge Function yang gagal
 *    diperiksa juga gagal di-deploy. Menambah akhiran di paket aslinya memaksa
 *    setiap konsumen lain (termasuk web dashboard di repo lain) mengubah
 *    tsconfig-nya.
 * 2. Bundler Edge Function bekerja dari `supabase/functions`. Berkas di luar
 *    direktori itu tidak dijamin ikut terbawa saat deploy.
 *
 * Salinan ini TURUNAN MESIN, bukan kode kedua: satu-satunya perubahan adalah
 * akhiran `.ts` pada impor relatif. `node scripts/salin-logika.mjs --periksa`
 * (bagian dari `npm run cek:edge`) gagal bila salinannya tertinggal dari
 * sumbernya, jadi keduanya tidak bisa diam-diam menyimpang.
 *
 * Pemakaian:
 *   node scripts/salin-logika.mjs            tulis ulang salinan
 *   node scripts/salin-logika.mjs --periksa  gagal bila salinan tidak sama
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SUMBER = 'packages/logika/src';
const TUJUAN = 'supabase/functions/_shared/logika';
const periksa = process.argv.includes('--periksa');

const KEPALA =
  '// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh\n' +
  '// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.\n';

/** Tambahkan `.ts` pada setiap impor/ekspor relatif yang belum berakhiran. */
function ubahImpor(isi) {
  return isi.replace(
    /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]+?)\2/g,
    (utuh, awal, kutip, jalur) =>
      /\.(ts|tsx|js|mjs|json)$/.test(jalur) ? utuh : `${awal}${kutip}${jalur}.ts${kutip}`,
  );
}

const hasil = new Map();
for (const berkas of readdirSync(SUMBER).filter((b) => b.endsWith('.ts')).sort()) {
  hasil.set(berkas, KEPALA + ubahImpor(readFileSync(join(SUMBER, berkas), 'utf8')));
}

if (periksa) {
  const ada = existsSync(TUJUAN) ? readdirSync(TUJUAN).filter((b) => b.endsWith('.ts')).sort() : [];
  const beda = [];
  for (const [berkas, isi] of hasil) {
    const jalur = join(TUJUAN, berkas);
    if (!existsSync(jalur)) beda.push(`${berkas} (belum disalin)`);
    else if (readFileSync(jalur, 'utf8') !== isi) beda.push(`${berkas} (tertinggal)`);
  }
  for (const berkas of ada) if (!hasil.has(berkas)) beda.push(`${berkas} (tidak ada lagi di sumber)`);
  if (beda.length > 0) {
    console.log(`✗ Salinan logika untuk Edge Function tidak sama dengan sumbernya: ${beda.join(', ')}`);
    console.log('  Jalankan `npm run salin:logika` lalu commit hasilnya.');
    process.exit(1);
  }
  console.log(`✓ Salinan logika untuk Edge Function sama dengan sumbernya (${hasil.size} berkas).`);
} else {
  rmSync(TUJUAN, { recursive: true, force: true });
  mkdirSync(TUJUAN, { recursive: true });
  for (const [berkas, isi] of hasil) writeFileSync(join(TUJUAN, berkas), isi);
  console.log(`✓ ${hasil.size} berkas disalin ke ${TUJUAN}`);
}
