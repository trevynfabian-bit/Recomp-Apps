/**
 * Memeriksa penataan riwayat percakapan AI Coach.
 *
 * Yang dijaga: zona waktu (semua tanggal dinormalisasi ke Asia/Jakarta, bukan
 * ke zona perangkat), batas "Hari ini"/"Kemarin" yang melintasi tengah malam,
 * pengelompokan yang harus mengikuti urutan pesan, dan pemotongan judul yang
 * tidak boleh memutus kata di tengah.
 *
 * Kasus tengah malam itu yang paling mudah salah dan paling sulit terlihat:
 * pesan pukul 23.30 WIB adalah 16.30 UTC, dan pesan pukul 00.30 WIB keesokan
 * harinya adalah 17.30 UTC di tanggal yang SAMA menurut UTC. Implementasi yang
 * memakai zona perangkat akan menyatukan keduanya dalam satu kelompok.
 */
import { copyFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function muatLogika() {
  const kerja = mkdtempSync(join(tmpdir(), 'percakapan-'));
  for (const berkas of ['tipe.ts', 'format.ts', 'percakapan.ts']) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['percakapan.ts', 'format.ts', 'tipe.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return {
    ...require(join(kerja, 'keluar', 'format.js')),
    ...require(join(kerja, 'keluar', 'percakapan.js')),
  };
}

const {
  formatJam,
  formatRentangTanggal,
  judulPercakapan,
  kelompokkanPerTanggal,
  labelTanggalRelatif,
  tanggalDariWaktu,
  MAKS_JUDUL,
} = muatLogika();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('\nZona waktu');
// 16.30 UTC = 23.30 WIB pada 21 September.
cek(
  `16.30 UTC 21 Sep → ${tanggalDariWaktu('2026-09-21T16:30:00Z')} ${formatJam('2026-09-21T16:30:00Z')} WIB`,
  tanggalDariWaktu('2026-09-21T16:30:00Z') === '2026-09-21' &&
    formatJam('2026-09-21T16:30:00Z') === '23.30',
);
// 17.30 UTC di tanggal UTC yang sama = 00.30 WIB tanggal BERIKUTNYA.
cek(
  `17.30 UTC 21 Sep → ${tanggalDariWaktu('2026-09-21T17:30:00Z')} ${formatJam('2026-09-21T17:30:00Z')} WIB`,
  tanggalDariWaktu('2026-09-21T17:30:00Z') === '2026-09-22' &&
    formatJam('2026-09-21T17:30:00Z') === '00.30',
);
cek(
  'jam memakai titik, bukan titik dua (gaya Indonesia)',
  !formatJam('2026-09-22T07:14:00+07:00').includes(':'),
  formatJam('2026-09-22T07:14:00+07:00'),
);
cek('waktu tidak sah menghasilkan string kosong, bukan "Invalid Date"',
  formatJam('bukan-tanggal') === '' && tanggalDariWaktu('bukan-tanggal') === '');

console.log('\nLabel tanggal');
cek('hari ini', labelTanggalRelatif('2026-09-22', '2026-09-22') === 'Hari ini');
cek('kemarin', labelTanggalRelatif('2026-09-21', '2026-09-22') === 'Kemarin');
cek(
  `lebih lama → tanggal panjang (${labelTanggalRelatif('2026-09-15', '2026-09-22')})`,
  labelTanggalRelatif('2026-09-15', '2026-09-22') === 'Selasa, 15 September',
);
// Batas bulan: 1 September, kemarinnya 31 Agustus.
cek(
  'kemarin melintasi batas bulan',
  labelTanggalRelatif('2026-08-31', '2026-09-01') === 'Kemarin',
);

console.log('\nPengelompokan per tanggal');
const PESAN = [
  { id: 'a', peran: 'pengguna', teks: 'tanya 1', waktu: '2026-09-20T02:00:00Z' }, // 09.00 WIB 20 Sep
  { id: 'b', peran: 'coach', teks: 'jawab 1', waktu: '2026-09-20T02:00:30Z' },
  { id: 'c', peran: 'pengguna', teks: 'tanya 2', waktu: '2026-09-21T16:30:00Z' }, // 23.30 WIB 21 Sep
  { id: 'd', peran: 'pengguna', teks: 'tanya 3', waktu: '2026-09-21T17:30:00Z' }, // 00.30 WIB 22 Sep
];
const kel = kelompokkanPerTanggal(PESAN, '2026-09-22');
cek(
  `tiga kelompok dari empat pesan (${kel.map((k) => k.label).join(' | ')})`,
  kel.length === 3,
);
cek(
  'tengah malam WIB memisahkan kelompok meski tanggal UTC-nya sama',
  kel[1].idPesan.join() === 'c' && kel[2].idPesan.join() === 'd',
);
cek(
  'label kelompok terakhir "Hari ini"',
  kel[2].label === 'Hari ini' && kel[1].label === 'Kemarin',
);
cek('pesan berurutan di hari sama digabung', kel[0].idPesan.join() === 'a,b');
cek('tanpa pesan → tanpa kelompok', kelompokkanPerTanggal([], '2026-09-22').length === 0);

console.log('\nJudul percakapan');
cek(
  'diambil dari pertanyaan pengguna, bukan jawaban coach',
  judulPercakapan([
    { id: '1', peran: 'coach', teks: 'Halo, ada yang bisa saya bantu?', waktu: '' },
    { id: '2', peran: 'pengguna', teks: 'Laju saya wajar?', waktu: '' },
  ]) === 'Laju saya wajar?',
);
const panjang = judulPercakapan([
  {
    id: '1',
    peran: 'pengguna',
    teks: 'Kenapa berat saya naik padahal kalori sudah defisit selama dua minggu penuh?',
    waktu: '',
  },
]);
cek(
  `judul panjang dipotong (${panjang.length} karakter): "${panjang}"`,
  panjang.length <= MAKS_JUDUL + 1 && panjang.endsWith('…') && !panjang.includes('  '),
);
cek(
  'pemotongan tidak memutus kata di tengah',
  /\s\S*…$/.test(panjang) === false || panjang.slice(0, -1).split(' ').pop().length > 0,
  panjang,
);
cek(
  'tanpa pesan pengguna → judul cadangan',
  judulPercakapan([{ id: '1', peran: 'coach', teks: 'halo', waktu: '' }]) === 'Percakapan baru',
);
cek(
  'spasi berlebih dirapikan',
  judulPercakapan([{ id: '1', peran: 'pengguna', teks: '  Laju   saya\n wajar? ', waktu: '' }]) ===
    'Laju saya wajar?',
);

console.log('\nRentang tanggal periode');
cek(
  `satu bulan → "${formatRentangTanggal('2026-09-15', '2026-09-21')}"`,
  formatRentangTanggal('2026-09-15', '2026-09-21') === '15–21 September',
);
cek(
  `lintas bulan → "${formatRentangTanggal('2026-09-29', '2026-10-05')}"`,
  formatRentangTanggal('2026-09-29', '2026-10-05') === '29 September – 5 Oktober',
);
cek(
  `lintas tahun → "${formatRentangTanggal('2026-12-28', '2027-01-03')}"`,
  formatRentangTanggal('2026-12-28', '2027-01-03') === '28 Desember 2026 – 3 Januari 2027',
);
cek(
  'bulan tidak diulang saat sama',
  (formatRentangTanggal('2026-09-15', '2026-09-21').match(/September/g) || []).length === 1,
);

console.log(gagal === 0 ? '\n✓ Semua pemeriksaan percakapan lulus' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
