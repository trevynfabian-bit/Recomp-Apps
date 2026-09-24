/**
 * Runner paritas menyeluruh: `npm run cek:paritas-semua`.
 *
 * Aturan domain hidup di dua tempat (`@recomp/logika` dan Supabase
 * PostgreSQL, plus salinan logika untuk Edge Function). PRD menyebut enam
 * penjaga paritas; ditambah `db:cek` karena sisi SQL-nya baru terbukti bila
 * migrasinya jalan. Runner ini menjalankan SEMUANYA walau satu gagal, lalu:
 *
 *   • mencetak satu ringkasan: tiap penjaga lulus/gagal, durasinya, dan baris
 *     yang gagal (✗ / GAGAL / ERROR) supaya penyebabnya terbaca tanpa menggulir;
 *   • menulis laporan mesin `laporan/paritas.json` (waktu, commit, per penjaga)
 *     — bentuk yang sama dengan data tiruan halaman Laporan paritas;
 *   • keluar dengan kode 1 bila satu saja gagal.
 *
 * `--cepat` melewatkan penjaga yang butuh Postgres (`db:cek`, `cek:paritas`),
 * untuk mesin tanpa Postgres; laporannya menandai keduanya `dilewati`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PENJAGA = [
  { nama: 'db:cek', perlu: 'postgres', tentang: 'Migrasi jalan dua kali, uji SQL & RLS' },
  { nama: 'cek:paritas', perlu: 'postgres', tentang: 'Aturan SQL = @recomp/logika, tipe baris = kolom' },
  { nama: 'cek:edge', perlu: null, tentang: 'Edge Function: tipe SDK, deno check, salinan logika sama' },
  { nama: 'cek:target', perlu: null, tentang: 'Rentang & aturan target = database, kalimat galat data' },
  { nama: 'cek:widget', perlu: null, tentang: 'Widget layar kunci = ringkasan server' },
  { nama: 'cek:ringkasan', perlu: null, tentang: 'Poin ringkasan mingguan = aturan bersama' },
  { nama: 'cek:impor', perlu: null, tentang: 'Pengurai impor & batas = CHECK database' },
];

const cepat = process.argv.includes('--cepat');
const GARIS = '═'.repeat(64);
const POLA_GAGAL = /(^|\s)(✗|GAGAL|ERROR)(\s|:|$)/;

const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || null;
const dijalankanPada = new Date().toISOString();
const hasil = [];

for (const p of PENJAGA) {
  if (cepat && p.perlu === 'postgres') {
    hasil.push({ ...p, keadaan: 'dilewati', durasiMs: 0, barisGagal: [] });
    continue;
  }
  console.log(`\n${GARIS}\n▶ ${p.nama} — ${p.tentang}\n${GARIS}`);
  const mulai = Date.now();
  const r = spawnSync('npm', ['run', '-s', p.nama], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const keluaran = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(keluaran);
  const lulus = r.status === 0;
  hasil.push({
    ...p,
    keadaan: lulus ? 'lulus' : 'gagal',
    durasiMs: Date.now() - mulai,
    // Baris penyebab, dipangkas; rincian lengkap ada di keluaran di atas.
    barisGagal: lulus
      ? []
      : keluaran
          .split('\n')
          .filter((b) => POLA_GAGAL.test(b))
          .slice(0, 8)
          .map((b) => b.trim().slice(0, 200)),
  });
}

const gagal = hasil.filter((h) => h.keadaan === 'gagal');
const lebar = Math.max(...hasil.map((h) => h.nama.length));
console.log(`\n${GARIS}\nRingkasan paritas menyeluruh${commit ? ` · commit ${commit}` : ''}`);
for (const h of hasil) {
  const tanda = h.keadaan === 'lulus' ? '✓' : h.keadaan === 'gagal' ? '✗' : '–';
  const waktu = h.keadaan === 'dilewati' ? 'dilewati (tanpa Postgres)' : `${(h.durasiMs / 1000).toFixed(1)} dtk`;
  console.log(`  ${tanda} ${h.nama.padEnd(lebar)}  ${waktu}`);
}
if (gagal.length) {
  console.log(`\nHASIL: GAGAL (${gagal.length} dari ${hasil.length} penjaga)`);
  for (const h of gagal) {
    console.log(`  ✗ ${h.nama}`);
    for (const b of h.barisGagal.length ? h.barisGagal : ['(tidak ada baris ✗; lihat keluarannya di atas)']) console.log(`      ${b}`);
  }
} else {
  const dilewati = hasil.filter((h) => h.keadaan === 'dilewati').length;
  console.log(`\nHASIL: LULUS${dilewati ? ` (${dilewati} penjaga dilewati)` : ''}`);
}
console.log(GARIS);

mkdirSync('laporan', { recursive: true });
writeFileSync(
  'laporan/paritas.json',
  `${JSON.stringify(
    {
      dijalankanPada,
      commit,
      cepat,
      penjaga: hasil.map(({ nama, tentang, keadaan, durasiMs, barisGagal }) => ({ nama, tentang, keadaan, durasiMs, barisGagal })),
    },
    null,
    2,
  )}\n`,
);
console.log('Laporan: laporan/paritas.json');
process.exit(gagal.length ? 1 : 0);
