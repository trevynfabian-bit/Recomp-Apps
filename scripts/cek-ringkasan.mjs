/**
 * Memeriksa ringkasan mingguan tanpa kunci API dan tanpa database.
 *
 * Yang dijaga di sini semuanya gagal DIAM-DIAM kalau rusak:
 *
 * 1. Kosakata yang sama di dua bahasa. Kunci poin di CHECK SQL dan label di
 *    TypeScript; batas pertanyaan lanjutan di SQL dan di penyaring. Kunci yang
 *    hanya dikenal satu sisi berarti kartu tanpa label, atau baris yang ditolak
 *    database padahal lolos penyaring.
 * 2. Pemeriksa angka narasi. Kalau terlalu longgar, angka karangan model lolos
 *    ke kartu Senin pagi; kalau terlalu ketat, SETIAP narasi ditolak dan semua
 *    pengguna diam-diam menerima narasi cadangan. Keduanya diuji dengan kontrol
 *    negatif.
 * 3. Narasi cadangan HARUS lolos pemeriksanya sendiri, untuk semua bentuk data.
 *    Cadangan yang gagal diperiksa adalah cadangan yang tidak pernah bisa
 *    menyelamatkan apa pun.
 * 4. Apa yang DIPERLIHATKAN ke model selalu lolos pemeriksa: model yang
 *    menyalin persis tidak boleh dihukum.
 * 5. Sifat endpoint yang hanya bisa dibaca dari sumbernya.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function muat() {
  const kerja = mkdtempSync(join(tmpdir(), 'ringkasan-'));
  // Seluruh `_shared`, termasuk salinan logika yang dipakai Edge Function —
  // yang diuji di sini harus kode yang SAMA dengan yang di-deploy.
  cpSync('supabase/functions/_shared', join(kerja, 'supabase/functions/_shared'), { recursive: true });
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['supabase/functions/_shared/promptRingkasan.ts',
     '--module', 'commonjs', '--target', 'es2022',
     '--rewriteRelativeImportExtensions',
     // rootDir dipatok: tanpa itu tsc menyimpulkan akar dari berkas yang
     // dikompilasi, dan jalur keluaran di bawah ikut bergeser.
     '--rootDir', '.', '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return {
    inti: require(join(kerja, 'keluar/supabase/functions/_shared/promptRingkasan.js')),
    logika: require(join(kerja, 'keluar/supabase/functions/_shared/logika/index.js')),
  };
}

const { inti, logika } = muat();
const {
  angkaYangBoleh,
  bacaanCadangan,
  judulRingkasan,
  keRingkasanTampil,
  KUNCI_POIN,
  LABEL_POIN,
  MAKS_JUDUL,
  MAKS_LANJUTAN,
  periksaAngkaBacaan,
  saringLanjutan,
  tampilkanPoin,
} = logika;
const { bacaJawaban, susunPermintaan, pesanPerbaikan, SKEMA_RINGKASAN } = inti;

let gagal = 0;
function cek(nama, lulus, rincian = '') {
  console.log(`${lulus ? '✓' : '✗'} ${nama}${!lulus && rincian ? ` — ${rincian}` : ''}`);
  if (!lulus) gagal += 1;
}
const sama = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
console.log('Kosakata SQL ↔ TypeScript');
{
  const sql = readFileSync('supabase/migrations/20260922003200_ringkasan_mingguan_terjadwal.sql', 'utf8');
  const blok = sql.match(/\(e ->> 'kunci'\) not in\s*\(([^)]*)\)/);
  const kunciSql = blok ? [...blok[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
  cek(
    `kunci poin sama: ${kunciSql.join(', ')}`,
    sama([...kunciSql].sort(), [...KUNCI_POIN].sort()),
    `SQL ${kunciSql} vs TS ${KUNCI_POIN}`,
  );
  cek('setiap kunci punya label kartu', KUNCI_POIN.every((k) => typeof LABEL_POIN[k] === 'string'));
  const maks = sql.match(/maks_lanjutan_ringkasan\(\)[\s\S]*?select (\d+);/);
  cek(
    `batas pertanyaan lanjutan sama (${maks?.[1]})`,
    Number(maks?.[1]) === MAKS_LANJUTAN,
    `SQL ${maks?.[1]} vs TS ${MAKS_LANJUTAN}`,
  );
}

// ---------------------------------------------------------------------------
// Data contoh: pengguna A dari uji SQL (Lean Gain).
const A = {
  periode: { dari: '2026-09-14', sampai: '2026-09-20' },
  fase: 'Lean Gain',
  cukup: true,
  kurang: [],
  poin: [
    { kunci: 'berat_rata', nilai: 74.4, unit: 'kg', delta: 0.4, pembanding: 'pekan_lalu',
      arah_nilai: 'naik', arah: 'sesuai', sumber: 'sinkron',
      dasar: { jumlah_timbangan: 7, jumlah_timbangan_lalu: 7, rata_lalu: 74, ambang: 0.2 } },
    { kunci: 'asupan_rata', nilai: 2900, unit: 'kcal', delta: 183, pembanding: 'target',
      arah_nilai: null, arah: 'berlawanan', sumber: 'estimasi',
      dasar: { hari_tercatat: 5, hari_bertarget: 5, rata_target: 2717, entri_manual: 4,
               entri_estimasi: 1, ambang: 100 } },
    { kunci: 'protein_rata', nilai: 160, unit: 'g', delta: -12, pembanding: 'target',
      arah_nilai: null, arah: 'berlawanan', sumber: 'estimasi',
      dasar: { hari_tercatat: 5, rata_target: 172, ambang: 10 } },
    { kunci: 'pinggang', nilai: 85.6, unit: 'cm', delta: 0.3, pembanding: 'pengukuran_sebelumnya',
      arah_nilai: 'datar', arah: 'sesuai', sumber: 'manual',
      dasar: { tanggal: '2026-09-19', tanggal_pembanding: '2026-09-15', nilai_pembanding: 85.3,
               ambang: 0.5 } },
    { kunci: 'latihan', nilai: 3, unit: 'sesi', delta: 1, pembanding: 'pekan_lalu',
      arah_nilai: null, arah: 'netral', sumber: 'sinkron', dasar: { jumlah_lalu: 2 } },
  ],
};

console.log('\nBentuk tampil kartu');
{
  const t = A.poin.map(tampilkanPoin);
  cek('berat "74,4 kg"', t[0].nilai === '74,4 kg', t[0].nilai);
  cek('delta berat "+0,4 kg dari pekan lalu"', t[0].delta === '+0,4 kg dari pekan lalu', t[0].delta);
  cek('asupan "2.900 kcal" (pemisah ribuan titik)', t[1].nilai === '2.900 kcal', t[1].nilai);
  cek('delta negatif memakai tanda minus', t[2].delta === '−12 g dari target', t[2].delta);
  cek('label dari LABEL_POIN', t[3].label === 'Pinggang');
  const nolTampil = tampilkanPoin({ ...A.poin[0], delta: 0.04 });
  cek('delta yang TAMPIL nol tidak ditulis "+0,0"', nolTampil.delta === 'sama dengan pekan lalu', nolTampil.delta);
  const tanpa = tampilkanPoin({ ...A.poin[0], delta: null, arah: null });
  cek('tanpa pembanding → tanpa delta & tanpa arah', tanpa.delta === undefined && tanpa.arah === undefined);
  const r = keRingkasanTampil({ ...A, bacaan: 'x', lanjutan: [] });
  cek('lanjutan kosong tidak dirender', r.lanjutan === undefined);
  const asing = keRingkasanTampil({ ...A, poin: [...A.poin, { ...A.poin[0], kunci: 'lemak' }], bacaan: 'x' });
  cek('kunci tak dikenal dilewati, bukan kartu tanpa label', asing.poin.length === A.poin.length);
  const judul = judulRingkasan({ dari: '2026-12-28', sampai: '2027-01-03' });
  cek(`judul lintas tahun muat kolom (${judul.length} ≤ ${MAKS_JUDUL})`, judul.length <= MAKS_JUDUL, judul);
}

console.log('\nPemeriksa angka narasi');
{
  const baik =
    'Rata-rata berat Anda 74,4 kg, naik 0,4 kg dari pekan sebelumnya, sejalan dengan Lean Gain. ' +
    'Asupan rata-rata 2.900 kcal pada 5 hari tercatat, 183 kcal di atas target 2.717 kcal. ' +
    'Pekan 14–20 September 2026. Pinggang 85,6 cm sejak 15 September.';
  cek('narasi yang menyalin angka tampil lolos', periksaAngkaBacaan(baik, A).length === 0,
    String(periksaAngkaBacaan(baik, A)));

  // Kontrol negatif — tiap kasus harus TERTANGKAP.
  const kasus = [
    ['angka dibulatkan', 'Berat Anda sekitar 75 kg.', '75'],
    // 74 dan 4 masing-masing SAH di data ini (rata-rata lalu 74,0; hitungan
    // hari) — justru itu yang membuat kasus ini kontrol negatif yang berarti.
    ['desimal gaya Inggris', 'Berat Anda 74.4 kg.', '74.4'],
    ['ribuan gaya Inggris', 'Asupan 2,900 kcal.', '2,900'],
    ['tanggal numerik', 'Sejak 15.09.2026.', '15.09.2026'],
    ['angka dikarang', 'Coba naikkan ke 3.000 kcal.', '3.000'],
    ['selisih baru dihitung sendiri', 'Selisihnya 184 kcal.', '184'],
    ['hitungan di atas sepekan', 'Sudah 8 hari berturut-turut.', '8'],
    ['persen yang tidak diberikan', 'Protein tercapai 93,0% dari target.', '93,0'],
  ];
  for (const [nama, teks, harap] of kasus) {
    const hasil = periksaAngkaBacaan(teks, A);
    cek(`tertangkap: ${nama}`, hasil.includes(harap), `hasil ${JSON.stringify(hasil)}`);
  }
  const boleh = angkaYangBoleh(A);
  cek('hitungan hari 0–7 boleh', [0, 3, 7].every((n) => boleh.has(n)));
  // Set menganggap NaN === NaN: satu NaN di himpunan meloloskan SEMUA bentuk salah.
  const dataRusak = { ...A, poin: [{ ...A.poin[0], dasar: { rata_lalu: Number.NaN } }] };
  cek('himpunan angka tidak pernah memuat NaN',
    !boleh.has(Number.NaN) && !angkaYangBoleh(dataRusak).has(Number.NaN));
  cek('bentuk salah tetap tertangkap walau data rusak',
    periksaAngkaBacaan('Berat 74.4 kg', dataRusak).includes('74.4'));
}

console.log('\nNarasi cadangan lolos pemeriksanya sendiri, untuk semua bentuk data');
{
  let jumlah = 0;
  let lolos = 0;
  const contohGagal = [];
  const deltaUji = [null, 0, 0.04, 0.3, -0.3, 1.25, -2];
  for (const fase of ['Lean Gain', 'Cut', 'Maintenance']) {
    for (const dBerat of deltaUji) {
      for (const dAsupan of [null, 0, 40, -250, 1234]) {
        for (const dProtein of [null, 0, 15, -12]) {
          for (const tanpa of [[], ['pinggang'], ['latihan'], ['berat_rata'], ['asupan_rata', 'protein_rata']]) {
            const poin = A.poin
              .filter((p) => !tanpa.includes(p.kunci))
              .map((p) => {
                if (p.kunci === 'berat_rata') {
                  return { ...p, delta: dBerat,
                    arah_nilai: dBerat === null ? null : Math.abs(dBerat) < 0.2 ? 'datar' : dBerat > 0 ? 'naik' : 'turun' };
                }
                if (p.kunci === 'pinggang') {
                  return { ...p, delta: dBerat === null ? null : -dBerat,
                    arah_nilai: dBerat === null ? null : Math.abs(dBerat) <= 0.5 ? 'datar' : -dBerat > 0 ? 'naik' : 'turun' };
                }
                if (p.kunci === 'asupan_rata') return { ...p, delta: dAsupan };
                if (p.kunci === 'protein_rata') return { ...p, delta: dProtein };
                return p;
              });
            const kurang = [
              ...(tanpa.includes('berat_rata') ? ['berat'] : []),
              ...(tanpa.includes('asupan_rata') ? ['asupan'] : []),
            ];
            const data = { ...A, fase, poin, kurang };
            const teks = bacaanCadangan(data);
            const asing = periksaAngkaBacaan(teks, data);
            jumlah += 1;
            if (
              asing.length === 0 &&
              teks.trim().length > 0 &&
              !/NaN|undefined|null/.test(teks) &&
              // Cadangan juga harus lolos batas medis — ia dipakai justru saat
              // model gagal, termasuk gagal karena menyebut obat.
              logika.periksaJawabanMedis(teks) === null
            ) lolos += 1;
            else if (contohGagal.length < 3) contohGagal.push({ teks, asing });
          }
        }
      }
    }
  }
  cek(`${lolos}/${jumlah} kombinasi lolos`, lolos === jumlah, JSON.stringify(contohGagal));

  // Tanpa data sama sekali pun tetap kalimat, bukan string kosong.
  const kosong = bacaanCadangan({ ...A, poin: [], kurang: ['berat', 'asupan', 'pinggang'] });
  cek('data kosong tetap menghasilkan kalimat netral', kosong.includes('belum ada'), kosong);
}

console.log('\nYang diperlihatkan ke model selalu lolos pemeriksa');
{
  const permintaan = JSON.parse(susunPermintaan(A));
  const tampil = [];
  for (const p of permintaan.poin) {
    tampil.push(p.nilai_tampil);
    if (p.selisih_tampil) tampil.push(p.selisih_tampil);
    for (const [k, v] of Object.entries(p.dasar)) if (k.endsWith('_tampil')) tampil.push(v);
  }
  tampil.push(permintaan.periode_tampil);
  const asing = tampil.flatMap((t) => periksaAngkaBacaan(t, A));
  cek(`${tampil.length} bentuk tampil, semuanya boleh disalin`, asing.length === 0, String(asing));
  cek('angka mentah tidak diperlihatkan', !/"nilai":\s*\d/.test(susunPermintaan(A)));
  cek('ambang tidak diperlihatkan sebagai angka yang bisa dikutip',
    !JSON.stringify(permintaan).includes('ambang'));
}

console.log('\nMembaca jawaban model');
{
  const baik = JSON.stringify({
    bacaan: 'Rata-rata berat naik 0,4 kg, sejalan dengan Lean Gain. Asupan 183 kcal di atas target.',
    lanjutan: [
      'Kenapa asupan saya di atas target?',
      'Kenapa asupan saya di atas target?',
      'Bagaimana menambah protein?',
      'Apakah 3.000 kcal terlalu banyak?',
      'Berapa dosis metformin yang aman?',
      'Bagaimana pinggang saya dibanding bulan lalu?',
      'Satu lagi?',
    ],
  });
  const h = bacaJawaban(baik, A);
  cek('jawaban sah diterima', h.ok, JSON.stringify(h));
  cek(
    'lanjutan: duplikat, angka asing, dan pertanyaan yang akan ditolak batas medis dibuang; paling banyak 3',
    h.ok && sama(h.lanjutan, [
      'Kenapa asupan saya di atas target?',
      'Bagaimana menambah protein?',
      'Bagaimana pinggang saya dibanding bulan lalu?',
    ]),
    JSON.stringify(h.ok && h.lanjutan),
  );

  const karang = bacaJawaban(JSON.stringify({ bacaan: 'Berat Anda sekitar 75 kg, naik tipis minggu ini dari sebelumnya.', lanjutan: [] }), A);
  cek('narasi dengan angka karangan ditolak & angkanya disebut', !karang.ok && karang.alasan === 'angka-asing'
    && karang.asing.includes('75'), JSON.stringify(karang));
  cek('pesan perbaikan menyebut angkanya', !karang.ok && pesanPerbaikan(karang).includes('75'));
  const medis = bacaJawaban(JSON.stringify({
    bacaan: 'Berat naik sesuai rencana. Hentikan metformin selama fase ini supaya nafsu makan kembali.',
    lanjutan: [],
  }), A);
  cek('narasi yang menganjurkan obat ditolak walau tanpa angka', !medis.ok && medis.alasan === 'medis',
    JSON.stringify(medis));
  cek('pesan perbaikan medis tidak mengulang isi yang dilarang',
    !medis.ok && !/metformin/i.test(pesanPerbaikan(medis)));
  cek('bukan JSON ditolak', bacaJawaban('Berikut ringkasannya', A).alasan === 'bukan-json');
  cek('terlalu pendek ditolak', bacaJawaban('{"bacaan":"Oke.","lanjutan":[]}', A).alasan === 'panjang');
  cek('bentuk salah ditolak', bacaJawaban('{"bacaan":5,"lanjutan":[]}', A).alasan === 'bentuk');
  cek('skema: dua field wajib, tanpa field tambahan',
    sama(SKEMA_RINGKASAN.required, ['bacaan', 'lanjutan']) && SKEMA_RINGKASAN.additionalProperties === false);
  cek('saringLanjutan menerima masukan bukan array tanpa melempar', sama(saringLanjutan('x', A), []));
}

console.log('\nSifat endpoint yang dibaca dari sumbernya');
{
  const src = readFileSync('supabase/functions/ringkasan-mingguan/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const jadwal = readFileSync('supabase/jadwal/ringkasan_mingguan.sql', 'utf8');
  cek('model dari satu sumber (MODEL_COACH), bukan string kedua',
    src.includes('model: MODEL_COACH') && !/model:\s*'claude-/.test(src));
  cek('effort eksplisit & keluaran terstruktur',
    src.includes('effort: UPAYA_RINGKASAN') && src.includes("format: { type: 'json_schema', schema: SKEMA_RINGKASAN }"));
  cek('fallback server lewat endpoint beta',
    src.includes('beta.messages') && src.includes("fallbacks: 'default'") && src.includes('betas: [BETA_FALLBACK]'));
  cek('tidak ada budget_tokens / thinking mati / tool_choice paksa',
    !src.includes('budget_tokens') && !/type:\s*'disabled'/.test(src) && !src.includes('tool_choice'));
  cek('penolakan diperiksa sebelum isi dibaca', src.indexOf("'refusal'") < src.indexOf('bacaJawaban(teks'));
  cek('teks dibaca menurut jenis blok', src.includes("blok.type === 'text'") && !/content\[0\]/.test(src));
  cek('kunci API & service role dari env, tidak dari bundel app',
    src.includes("Deno.env.get('ANTHROPIC_API_KEY')") &&
      src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')") && !/EXPO_PUBLIC/.test(src));
  cek('rahasia jadwal dibandingkan waktu-tetap', src.includes('rahasiaCocok(rahasiaDiberikan, rahasia)'));
  cek('jalur jadwal menyebut pengguna di setiap kueri',
    src.includes('p_user_id: userId') && src.includes(".eq('user_id', userId)"));
  cek('jalur pengguna meneruskan JWT', src.includes('Authorization: otorisasi'));
  cek('id pengguna tidak dicatat ke log',
    !/console\.(log|warn|error)\([^)]*(pengguna_id|userId)/.test(src));
  cek('nama header rahasia sama di jadwal & endpoint',
    jadwal.includes("'x-jadwal-rahasia'") && src.includes("req.headers.get('x-jadwal-rahasia')"));
  cek('jadwal memanggil fungsi yang benar', jadwal.includes("'/functions/v1/ringkasan-mingguan'"));
  cek('jadwal tidak menyimpan kunci service role', !/service_role/i.test(jadwal.replace(/^--.*$/gm, '')));
  cek('jadwal membaca rahasia dari Vault, bukan literal',
    jadwal.includes('vault.decrypted_secrets') && !/'Bearer ey/.test(jadwal));
}

console.log(
  gagal === 0
    ? '\n✓ Ringkasan mingguan: kosakata SQL/TS sama, angka karangan tertangkap, cadangan selalu lolos, endpoint menjaga kunci'
    : `\n✗ ${gagal} pemeriksaan gagal`,
);
process.exit(gagal === 0 ? 0 : 1);
