/**
 * Memeriksa inti endpoint chat AI Coach tanpa kunci API dan tanpa database.
 *
 * Dua kelompok pemeriksaan, dan keduanya menjaga hal yang gagal TANPA PESAN
 * KESALAHAN apa pun:
 *
 * 1. Bentuk prompt. Prompt caching Anthropic mencocokkan PREFIKS, jadi satu
 *    byte yang berubah di blok aturan membatalkan seluruh cache. Tidak ada
 *    error, tidak ada peringatan — yang terlihat hanya tagihan yang naik dan
 *    `cache_read_input_tokens` yang selalu nol. Karena itu di sini blok aturan
 *    dibandingkan byte demi byte antara dua konteks yang berbeda.
 *
 * 2. Sifat endpoint yang tidak bisa diuji tanpa kunci API, tapi bisa dibaca
 *    dari sumbernya: kunci tidak boleh ada di bundel app, JWT pengguna harus
 *    diteruskan supaya RLS berlaku, batas medis harus diperiksa ulang di
 *    server, riwayat harus diurutkan dengan `urutan`, dan `budget_tokens`
 *    tidak boleh dipakai pada model yang menolaknya.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

function muatInti() {
  const kerja = mkdtempSync(join(tmpdir(), 'coach-'));
  copyFileSync('supabase/functions/_shared/promptCoach.ts', join(kerja, 'promptCoach.ts'));
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['promptCoach.ts', '--module', 'commonjs', '--target', 'es2022',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return require(join(kerja, 'keluar', 'promptCoach.js'));
}

const {
  ATURAN_COACH,
  MAKS_TOKEN_COACH,
  MODEL_COACH,
  NAMA_TOOLS,
  TOOLS_COACH,
  jalankanTool,
  susunKonteks,
  susunSystem,
} = muatInti();

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

/** Dua konteks yang BERBEDA isinya; strukturnya sama dengan `konteks_coach`. */
function konteksTiruan(n) {
  return {
    hari_ini: n === 1 ? '2026-09-23' : '2026-10-07',
    fase: n === 1 ? 'Lean Gain' : 'Cut',
    profil: { tinggi_cm: 178, jenis_kelamin: 'pria', usia_tahun: 32 },
    angka: [
      {
        kunci: 'berat_rata_7_hari',
        nilai: n === 1 ? 74.5 : 73.1,
        unit: 'kg',
        sumber: 'manual',
        dasar: { jumlah_timbangan: 7, jendela_hari: 7 },
      },
      {
        kunci: 'sisa_budget_pekan',
        nilai: n === 1 ? 8200 : -350,
        unit: 'kcal',
        sumber: 'manual',
        dasar: { hari_tersisa: 3 },
      },
      {
        kunci: 'tdee',
        nilai: n === 1 ? 2680 : 2610,
        unit: 'kcal',
        sumber: 'estimasi',
        dasar: { keyakinan: 'sedang' },
      },
    ],
    tren: {
      deret: [{ tanggal: '2026-09-23', rata_rata_kg: 74.5, berat_harian_kg: 74.9 }],
      arah: { arah: 'naik', perubahan_kg: 0.3 },
      kecukupan: { cukup_arah: true },
    },
    budget: {
      rincian: [{ tanggal: '2026-09-23', target_kalori: 2450, terpakai_kalori: 2600 }],
      laju: { status: 'lebih cepat' },
    },
    target_hari_ini: { nama_tipe_hari: 'Rest', target_kalori: 2450 },
    ukuran: {
      bagian: { pinggang_cm: { titik: [{ tanggal: '2026-09-23', nilai: 85.4 }], laju_terkini: 0.2 } },
      batas_pinggang: { keadaan: 'mendekat', pekan_lagi: 2 },
    },
    body_fat: { persen: 16.4, kurang: null },
    tdee: { tengah: 2680, keyakinan: 'sedang' },
    evaluasi_terakhir: null,
    ringkasan_terakhir: null,
    aturan: { wajib_rata_rata_7_hari: true },
  };
}

const a = konteksTiruan(1);
const b = konteksTiruan(2);

console.log('\nModel & batas');
cek(`model ${MODEL_COACH}`, MODEL_COACH === 'claude-opus-5');
cek(`max_tokens ${MAKS_TOKEN_COACH} longgar tapi tidak nol`, MAKS_TOKEN_COACH >= 2000);

console.log('\nBentuk prompt: prefiks cache harus STABIL');
const sysA = susunSystem(a);
const sysB = susunSystem(b);
cek('blok aturan lebih dulu, konteks sesudahnya', sysA.length === 2);
cek(
  'blok aturan byte-identik walau konteksnya berbeda',
  sysA[0].text === sysB[0].text && sysA[0].text === ATURAN_COACH,
);
cek('blok aturan ditandai cache', sysA[0].cache_control?.type === 'ephemeral');
cek('blok konteks TIDAK ditandai cache', sysA[1].cache_control === undefined);
cek('blok konteks memang berbeda antar permintaan', sysA[1].text !== sysB[1].text);

console.log('\nTidak ada data pengguna di blok aturan');
// Bukti terkuatnya sudah ada di atas: blok aturan byte-identik untuk dua konteks
// yang berbeda, jadi ia TIDAK MUNGKIN memuat data pengguna. Menambah pemindaian
// angka di sini justru salah — blok aturan memang memuat contoh format angka
// ("2.850 kcal, 74,5 kg"), dan pemindaian angka akan menuduhnya bocor padahal
// yang terjadi cuma kebetulan nilainya sama dengan data tiruan.
//
// Yang masih layak diperiksa tersendiri adalah tanggal: contoh format tidak
// butuh tanggal, jadi satu tanggal di blok aturan hampir pasti berarti "hari
// ini" terselip ke sana — dan itu membatalkan cache setiap tengah malam.
cek('tanggal tidak ada di blok aturan', !/\d{4}-\d{2}-\d{2}/.test(ATURAN_COACH));
cek(
  'blok aturan tetap identik untuk konteks yang kosong sama sekali',
  susunSystem({ ...a, angka: [], tren: {}, budget: {}, ukuran: {}, hari_ini: '2027-01-01' })[0]
    .text === ATURAN_COACH,
);
cek(
  'aturan menyebut rata-rata 7 hari & larangan dosis',
  /rata-rata 7 hari/i.test(ATURAN_COACH) && /dosis/i.test(ATURAN_COACH),
);
cek(
  'aturan menyebut bahwa coach tidak menghitung sendiri',
  /tidak menghitung sendiri/i.test(ATURAN_COACH),
);

console.log('\nBlok konteks membawa sumber tiap angka');
const teksKonteks = susunKonteks(a);
cek('sumber "estimasi" ikut terbawa', teksKonteks.includes('"sumber":"estimasi"'));
cek('sumber "manual" ikut terbawa', teksKonteks.includes('"sumber":"manual"'));
cek('keadaan batas pinggang ikut terbawa', teksKonteks.includes('mendekat'));
cek(
  'konteks menyuruh memanggil fungsi alih-alih menebak',
  /jangan menebak/i.test(teksKonteks),
);

console.log('\nSkema fungsi memenuhi syarat strict');
for (const t of TOOLS_COACH) {
  cek(`${t.name}: strict`, t.strict === true);
  cek(`${t.name}: additionalProperties false`, t.input_schema.additionalProperties === false);
  cek(`${t.name}: required ada`, Array.isArray(t.input_schema.required));
  cek(
    `${t.name}: tiap properti wajib disebut di required`,
    Object.keys(t.input_schema.properties).every((k) => t.input_schema.required.includes(k)),
  );
  cek(`${t.name}: punya deskripsi`, (t.description ?? '').length > 20);
}
cek(`empat fungsi tersedia: ${NAMA_TOOLS.join(', ')}`, NAMA_TOOLS.length === 4);

console.log('\nFungsi dijawab dari konteks, bukan dihitung ulang');
{
  const r = jalankanTool('ambil_angka', { kunci: 'berat_rata_7_hari' }, a);
  cek('ambil_angka mengembalikan angka beserta sumbernya', r.ok && r.data.sumber === 'manual');
  cek('nilainya sama dengan yang ada di konteks', r.ok && r.data.nilai === 74.5);

  const est = jalankanTool('ambil_angka', { kunci: 'tdee' }, a);
  cek('TDEE tetap bertanda estimasi', est.ok && est.data.sumber === 'estimasi');

  // Kunci yang tidak ada TIDAK boleh mengembalikan nol: "sisa budget 0 kcal"
  // adalah kalimat yang salah dengan cara yang berbahaya.
  const kosong = jalankanTool('ambil_angka', { kunci: 'berat_hari_ini' }, a);
  cek('kunci yang tidak ada → ok:false, bukan nol', !kosong.ok);
  cek(
    'alasannya menyebut kunci yang tersedia',
    !kosong.ok && kosong.alasan.includes('berat_rata_7_hari'),
  );

  // Dan tidak ada kunci mana pun yang menawarkan timbangan HARIAN.
  cek(
    'tidak ada kunci timbangan harian di konteks',
    !a.angka.some((x) => /harian|hari_ini|pagi/.test(x.kunci)),
  );

  const deret = jalankanTool('ambil_deret_berat', {}, a);
  cek('deret berat membawa catatan mana yang boleh dikutip', deret.ok && /titik grafik/.test(deret.data.catatan));
  cek('deret berat bersumber manual', deret.ok && deret.data.sumber === 'manual');

  const budget = jalankanTool('ambil_rincian_budget', {}, a);
  cek('rincian budget terbawa apa adanya', budget.ok && budget.data.rincian.length === 1);

  const ukuran = jalankanTool('ambil_riwayat_ukuran', { bagian: 'pinggang_cm' }, a);
  cek('riwayat ukuran membawa laju terkini', ukuran.ok && ukuran.data.laju_terkini === 0.2);

  const tiada = jalankanTool('ambil_riwayat_ukuran', { bagian: 'pinggul_cm' }, a);
  cek('bagian yang belum diukur → ok:false', !tiada.ok);

  const asing = jalankanTool('fungsi_karangan', {}, a);
  cek('fungsi tak dikenal → ok:false', !asing.ok);

  // Konteks tanpa data: fungsinya harus jujur, bukan mengembalikan array kosong
  // yang terbaca seperti "tidak ada perubahan".
  const sepi = { ...a, angka: [], tren: {}, budget: {}, ukuran: {} };
  cek('tanpa deret → ok:false', !jalankanTool('ambil_deret_berat', {}, sepi).ok);
  cek('tanpa rincian budget → ok:false', !jalankanTool('ambil_rincian_budget', {}, sepi).ok);
}

console.log('\nSifat endpoint yang dibaca dari sumbernya');
{
  const mentah = readFileSync('supabase/functions/coach-chat/index.ts', 'utf8');
  // Komentar dibuang lebih dulu: berkas ini MENJELASKAN kenapa kunci tidak boleh
  // masuk ke `EXPO_PUBLIC_*`, dan pemindaian mentah akan menuduh penjelasannya
  // sebagai pelanggaran.
  const src = mentah.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  cek(
    'kunci API dibaca dari env Edge Function, bukan dari bundel app',
    src.includes("Deno.env.get('ANTHROPIC_API_KEY')") && !/EXPO_PUBLIC/.test(src),
  );
  cek(
    'JWT pengguna diteruskan ke klien Supabase supaya RLS berlaku',
    src.includes('Authorization: otorisasi'),
  );
  cek(
    'batas medis diperiksa ULANG di server dengan aturan yang sama',
    src.includes('periksaBatasMedis') && src.includes('batasMedis.ts'),
  );
  cek(
    'riwayat diurutkan dengan `urutan`, bukan `waktu`',
    src.includes("order('urutan'") && !src.includes("order('waktu'"),
  );
  cek(
    'budget_tokens tidak dipakai (ditolak 400 pada model ini)',
    !src.includes('budget_tokens'),
  );
  cek('penolakan keamanan diperiksa sebelum membaca isi balasan', src.includes("'refusal'"));
  cek(
    'streaming dipakai supaya tidak menabrak timeout HTTP',
    src.includes('messages.stream') && src.includes('finalMessage'),
  );
  cek(
    'hasil fungsi dikembalikan dalam SATU pesan user',
    src.includes("{ role: 'user', content: hasil }"),
  );
  cek('putaran fungsi dibatasi', src.includes('MAKS_PUTARAN_TOOL'));
  cek(
    'kunci API tidak pernah ikut ke jawaban maupun log',
    !/console\.(log|error)\([^)]*kunciAi/.test(src),
  );
}

console.log(
  gagal === 0
    ? '\n✓ Prompt coach: prefiks cache stabil, fungsi jujur soal data yang tidak ada, endpoint menjaga kunci & RLS'
    : `\n✗ ${gagal} pemeriksaan gagal`,
);
process.exit(gagal === 0 ? 0 : 1);
