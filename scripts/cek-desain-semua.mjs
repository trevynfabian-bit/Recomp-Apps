/**
 * Menjalankan ketiga penjaga desain berurutan (`cek:desain`, `cek:hardcode`,
 * `cek:kontras`) lalu menutup dengan SATU ringkasan gabungan: hasil tiap
 * penjaga, total, dan daftar yang gagal. Semua penjaga tetap dijalankan
 * walau yang pertama gagal, supaya satu kali jalan memperlihatkan semuanya.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PENJAGA = [
  ['cek:desain', 'scripts/cek-desain.mjs'],
  ['cek:hardcode', 'scripts/cek-hardcode.mjs'],
  ['cek:kontras', 'scripts/cek-kontras.mjs'],
];
const GARIS = '═'.repeat(60);
/** Daftar gagal gabungan dipotong; rincian lengkap ada di keluaran tiap penjaga. */
const MAKS_DAFTAR = 20;

const dir = mkdtempSync(join(tmpdir(), 'cek-desain-'));
const berkas = join(dir, 'ringkasan.jsonl');
const keluar = {};
for (const [nama, skrip] of PENJAGA) {
  console.log(`\n${GARIS}\n▶ ${nama}\n${GARIS}`);
  const r = spawnSync(process.execPath, [skrip], {
    stdio: 'inherit',
    env: { ...process.env, CEK_RINGKASAN_BERKAS: berkas },
  });
  keluar[nama] = r.status ?? 1;
}

let hasil = [];
try {
  hasil = readFileSync(berkas, 'utf8').trim().split('\n').filter(Boolean).map((b) => JSON.parse(b));
} catch {
  // Penjaga yang mogok sebelum mencetak ringkasan tidak menulis apa pun; ditangani di bawah.
}
rmSync(dir, { recursive: true, force: true });

console.log(`\n${GARIS}\nRingkasan gabungan penjaga desain`);
let totalLulus = 0;
let totalGagal = 0;
const semuaGagal = [];
for (const [nama] of PENJAGA) {
  const r = hasil.find((h) => h.nama === nama);
  if (!r) {
    // Mogok (galat sintaks, berkas hilang): dihitung gagal, bukan dilewati.
    console.log(`  ✗ ${nama.padEnd(13)} tidak selesai (kode keluar ${keluar[nama]})`);
    totalGagal += 1;
    semuaGagal.push(`${nama} › tidak selesai`);
    continue;
  }
  const lulus = r.gagal === 0 && keluar[nama] === 0;
  console.log(`  ${lulus ? '✓' : '✗'} ${nama.padEnd(13)} ${r.lulus}/${r.lulus + r.gagal} lulus`);
  totalLulus += r.lulus;
  totalGagal += r.gagal;
  semuaGagal.push(...r.daftarGagal.map((g) => `${nama} › ${g}`));
}
console.log(`  Total: ${totalLulus} lulus, ${totalGagal} gagal dari ${totalLulus + totalGagal} pemeriksaan`);
const gagal = totalGagal > 0 || Object.values(keluar).some((k) => k !== 0);
if (gagal) {
  console.log(`\nHASIL: GAGAL`);
  for (const g of semuaGagal.slice(0, MAKS_DAFTAR)) console.log(`  ✗ ${g}`);
  if (semuaGagal.length > MAKS_DAFTAR) console.log(`  … dan ${semuaGagal.length - MAKS_DAFTAR} lagi`);
  console.log('Rincian ada di keluaran tiap penjaga di atas.');
} else {
  console.log('\nHASIL: LULUS, semua penjaga desain hijau');
}
console.log(GARIS);
process.exit(gagal ? 1 : 0);
