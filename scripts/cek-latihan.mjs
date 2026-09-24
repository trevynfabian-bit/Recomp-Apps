/**
 * Memeriksa hitungan latihan Hevy: e1RM Epley, rangkuman set, volume, pekan.
 *
 * Aturan PRD yang paling mudah hilang diam-diam: e1RM HANYA untuk set ≤ 12
 * repetisi. Rumus yang "berfungsi" untuk 15 repetisi tetap menghasilkan angka
 * — angka yang salah, dan tidak ada yang akan tahu. Batas itu, set berat
 * badan, dan pembulatan setengah (yang harus sama dengan `numeric` SQL) diuji
 * dengan angka yang bisa dihitung tangan.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const kerja = mkdtempSync(join(tmpdir(), 'latihan-'));
for (const b of readdirSync('packages/logika/src')) copyFileSync(join('packages/logika/src', b), join(kerja, b));
execFileSync(join(process.cwd(), 'node_modules', '.bin', 'tsc'),
  ['latihan.ts', '--module', 'commonjs', '--target', 'es2022', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
  { cwd: kerja, stdio: 'pipe' });
const { arahKekuatan, e1rmEpley, formatBeban, MAKS_REPS_E1RM, ringkasLatihan, ringkasPekan, ringkasSesi } =
  require(join(kerja, 'keluar', 'latihan.js'));

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}

console.log('e1RM Epley');
{
  const kasus = [
    [100, 1, 100], // satu repetisi = bebannya sendiri
    [100, 5, 116.7], // 100 × 35/30 = 116,67
    [80, 8, 101.3], // 80 × 38/30 = 101,33
    [82.5, 7, 101.8], // 101,75 tepat — setengah dibulatkan ke atas, seperti numeric SQL
    [60, 10, 80], // 60 × 40/30 = 80
    [32.5, 12, 45.5], // batas atas: 32,5 × 42/30 = 45,5
    [6.75, 8, 8.6], // 8,55 tepat — di pecahan biasa tersimpan 8,549… dan jatuh ke 8,5
  ];
  for (const [b, r, harap] of kasus) {
    const h = e1rmEpley(b, r);
    cek(`${b} kg × ${r} → ${harap}`, h === harap, `hasil ${h}`);
  }
  cek(`batas repetisi ${MAKS_REPS_E1RM}`, MAKS_REPS_E1RM === 12);
  cek('13 repetisi → tidak diperkirakan', e1rmEpley(60, 13) === null);
  cek('15 repetisi → tidak diperkirakan', e1rmEpley(10, 15) === null);
  cek('berat badan (null) → tidak diperkirakan', e1rmEpley(null, 8) === null);
  cek('beban 0 → tidak diperkirakan', e1rmEpley(0, 8) === null);
  cek('0 repetisi → tidak diperkirakan', e1rmEpley(100, 0) === null);
  cek('repetisi pecahan → tidak diperkirakan', e1rmEpley(100, 5.5) === null);
  // Kontrol negatif pembulatan: cara naif memang meleset untuk kasus ini, jadi
  // uji di atas benar-benar membedakan kedua cara.
  const naif = Math.round(6.75 * (1 + 8 / 30) * 10) / 10;
  cek(`kontrol: rumus pecahan naif memang meleset untuk 6,75 × 8 (${naif})`, naif === 8.5);
}

console.log('\nRangkuman latihan');
{
  const seragam = ringkasLatihan({ latihan: 'OHP', sets: [1, 2, 3].map((i) => ({ set_ke: i, beban_kg: 50, reps: 8 })) });
  cek(`set seragam: "${seragam.set}"`, seragam.set === '3 × 8 · 50 kg');
  const campur = ringkasLatihan({
    latihan: 'Bench',
    // Urutan sengaja diacak: rangkuman harus mengikuti set_ke, bukan urutan data.
    sets: [{ set_ke: 3, beban_kg: 82.5, reps: 7 }, { set_ke: 1, beban_kg: 60, reps: 10 }, { set_ke: 2, beban_kg: 80, reps: 8 }],
  });
  cek(`set campur urut set_ke: "${campur.set}"`, campur.set === '60 kg × 10, 80 kg × 8, 82,5 kg × 7');
  cek(`e1RM terbaik dari set terbaik: ${campur.e1rmKg} (${campur.setTerbaik})`,
    campur.e1rmKg === 101.8 && campur.setTerbaik === '82,5 kg × 7');
  cek(`volume: ${campur.volumeKg}`, campur.volumeKg === 600 + 640 + 577.5);
  const lateral = ringkasLatihan({ latihan: 'Lateral', sets: [1, 2, 3].map((i) => ({ set_ke: i, beban_kg: 10, reps: 15 })) });
  cek('semua set > 12 repetisi → tanpa e1RM, volume tetap dihitung', lateral.e1rmKg === null && lateral.volumeKg === 450);
  const dip = ringkasLatihan({ latihan: 'Dip', sets: [{ set_ke: 1, beban_kg: null, reps: 12 }, { set_ke: 2, beban_kg: null, reps: 10 }] });
  cek(`berat badan: "${dip.set}", tanpa e1RM & volume`, dip.set === 'BB × 12, BB × 10' && dip.e1rmKg === null && dip.volumeKg === 0);
  cek('format beban: bulat tanpa ",0", pecahan satu desimal, ribuan bertitik',
    formatBeban(80) === '80 kg' && formatBeban(82.5) === '82,5 kg' && formatBeban(1200) === '1.200 kg');
}

console.log('\nRingkasan sesi & pekan');
{
  const sesi = {
    id: 's', mulai: '2026-09-23T00:00:00Z', nama: 'Push', durasi_menit: 60,
    latihan: [
      { latihan: 'Bench', sets: [[60, 10], [80, 8], [82.5, 7], [82.5, 6]].map(([b, r], i) => ({ set_ke: i + 1, beban_kg: b, reps: r })) },
      { latihan: 'Dip', sets: [{ set_ke: 1, beban_kg: null, reps: 10 }] },
    ],
  };
  const r = ringkasSesi(sesi);
  cek(`sesi: ${r.jumlahLatihan} latihan, ${r.jumlahSet} set, ${r.volumeKg} kg`,
    r.jumlahLatihan === 2 && r.jumlahSet === 5 && r.volumeKg === 2312.5);

  // Rabu 23 Sep 2026. Pekan Senin 21 – Minggu 27, menurut Asia/Jakarta.
  const s = (id, mulai) => ({ ...sesi, id, mulai });
  const daftar = [
    s('senin-dini', '2026-09-20T17:30:00Z'), // Senin 21 pukul 00.30 WIB — MASUK (di UTC masih Minggu)
    s('minggu-lalu', '2026-09-20T16:30:00Z'), // Minggu 20 pukul 23.30 WIB — tidak masuk
    s('rabu', '2026-09-23T01:00:00Z'),
    s('minggu-malam', '2026-09-27T16:59:00Z'), // Minggu 27 pukul 23.59 WIB — masuk
    s('senin-depan', '2026-09-27T17:00:00Z'), // Senin 28 pukul 00.00 WIB — tidak masuk
  ];
  const p = ringkasPekan(daftar, '2026-09-23');
  cek(`pekan menurut kalender Jakarta: ${p.jumlahSesi} sesi`, p.jumlahSesi === 3);
  cek(`volume pekan = 3 × volume sesi (${p.volumeKg})`, p.volumeKg === 3 * 2312.5);
  cek('pekan kosong → 0 sesi, 0 kg', JSON.stringify(ringkasPekan([], '2026-09-23')) === '{"jumlahSesi":0,"volumeKg":0}');
}

console.log('\nArah kekuatan (keterangan awam)');
{
  const set = (beban, reps) => ({ set_ke: 1, beban_kg: beban, reps, jarak_km: null, durasi_detik: null, tipe: 'normal' });
  const sesi = (id, mulai, latihan) => ({ id, mulai, nama: id, durasi_menit: 60, latihan: latihan.map(([n, b, r]) => ({ latihan: n, sets: [set(b, r)] })) });
  const data = [
    sesi('b', '2026-09-15T07:00:00+07:00', [['Bench', 80, 8], ['Squat', 100, 5], ['OHP', 50, 8], ['Dip', null, 10]]),
    sesi('a', '2026-09-08T07:00:00+07:00', [['Bench', 77.5, 8], ['Squat', 105, 5], ['OHP', 50, 8], ['Curl', 20, 10]]),
  ];
  const h = arahKekuatan(data);
  const per = Object.fromEntries(h.gerakan.map((g) => [g.latihan, g]));
  cek('urutan waktu dipakai, bukan urutan larik (Bench 77,5 → 80 naik)', per.Bench?.arah === 'naik' && per.Bench.awalKg < per.Bench.akhirKg);
  cek('turun terbaca (Squat 105 → 100)', per.Squat?.arah === 'turun' && per.Squat.selisihKg === -5.8, JSON.stringify(per.Squat));
  cek('sama persis → datar', per.OHP?.arah === 'datar');
  cek('gerakan satu sesi (Curl) & tanpa e1RM (Dip) tidak ikut', !per.Curl && !per.Dip && h.gerakan.length === 3);
  cek('urutan: naik, turun, datar', h.gerakan.map((g) => g.arah).join(',') === 'naik,turun,datar');
  const kecil = arahKekuatan([sesi('x', '2026-09-01T07:00:00+07:00', [['Row', 100, 5]]), sesi('y', '2026-09-08T07:00:00+07:00', [['Row', 101.5, 5]])]);
  cek('di bawah ambang 2% → datar', kecil.gerakan[0]?.arah === 'datar');
  cek('seri naik = turun → kalimat stabil', h.kalimat?.startsWith('Kekuatan cenderung stabil'), h.kalimat);
  cek('tanpa gerakan berulang → kalimat null', arahKekuatan([data[0]]).kalimat === null);
}

console.log(gagal === 0 ? '\n✓ Latihan: e1RM hanya ≤ 12 repetisi & dibulatkan seperti SQL, pekan menurut Jakarta' : `\n✗ ${gagal} pemeriksaan gagal`);
process.exit(gagal === 0 ? 0 : 1);
