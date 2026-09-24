/**
 * Gerbang rilis: `npm run cek:rilis`, WAJIB lulus sebelum build TestFlight.
 *
 * Satu perintah untuk semua yang harus benar sebelum app sampai ke pengguna:
 * tipe, penjaga desain, penjaga logika per fitur, lalu paritas menyeluruh
 * (`cek:paritas-semua`: migrasi & RLS, SQL = @recomp/logika, Edge Function,
 * batas nilai, format laporan). Semua langkah tetap dijalankan walau satu
 * gagal, supaya satu kali jalan memperlihatkan semuanya.
 *
 * Aturan tambahan khusus rilis:
 *   • pohon kerja git harus bersih: yang diperiksa harus persis yang dirilis;
 *   • paritas tidak boleh dijalankan `--cepat` (tanpa Postgres): rilis tanpa
 *     bukti sisi database bukan rilis yang sudah diperiksa.
 * Hasilnya ditulis ke `laporan/rilis.json` bersama commit-nya.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const LANGKAH = [
  'typecheck',
  'cek:desain-semua',
  'cek:bf', 'cek:ukuran', 'cek:percakapan', 'cek:evaluasi', 'cek:medis', 'cek:satuan', 'cek:prompt',
  'cek:sumber', 'cek:latihan', 'cek:webhook', 'cek:akun', 'cek:fase', 'cek:privasi', 'cek:ekspor', 'cek:lab',
  // Paritas terakhir: paling lama, dan laporannya ikut ditulis.
  'cek:paritas-semua',
];
const GARIS = '═'.repeat(64);

const git = (...a) => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
const commit = git('rev-parse', '--short', 'HEAD') || null;
const kotor = git('status', '--porcelain', '--untracked-files=no');

const hasil = [];
for (const nama of LANGKAH) {
  console.log(`\n${GARIS}\n▶ ${nama}\n${GARIS}`);
  const mulai = Date.now();
  const r = spawnSync('npm', ['run', '-s', nama], { stdio: 'inherit' });
  hasil.push({ nama, lulus: r.status === 0, durasiMs: Date.now() - mulai });
}

const gagal = hasil.filter((h) => !h.lulus);
const syarat = [{ nama: 'pohon kerja bersih (tanpa perubahan belum di-commit)', lulus: kotor.length === 0 }];
console.log(`\n${GARIS}\nGerbang rilis${commit ? ` · commit ${commit}` : ''}`);
for (const h of hasil) console.log(`  ${h.lulus ? '✓' : '✗'} ${h.nama.padEnd(20)} ${(h.durasiMs / 1000).toFixed(1)} dtk`);
for (const s of syarat) console.log(`  ${s.lulus ? '✓' : '✗'} ${s.nama}`);
const tidakLulus = [...gagal.map((h) => h.nama), ...syarat.filter((s) => !s.lulus).map((s) => s.nama)];
console.log(
  tidakLulus.length
    ? `\nHASIL: JANGAN RILIS (${tidakLulus.length} belum lulus: ${tidakLulus.join(', ')})`
    : '\nHASIL: SIAP RILIS',
);
console.log(GARIS);

mkdirSync('laporan', { recursive: true });
writeFileSync(
  'laporan/rilis.json',
  `${JSON.stringify({ diperiksaPada: new Date().toISOString(), commit, bersih: kotor.length === 0, siap: tidakLulus.length === 0, langkah: hasil }, null, 2)}\n`,
);
console.log('Laporan: laporan/rilis.json (paritas rinci: laporan/paritas.json)');
process.exit(tidakLulus.length ? 1 : 0);
