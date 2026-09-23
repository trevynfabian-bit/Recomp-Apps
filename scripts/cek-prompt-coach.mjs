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
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Kompilasi inti prompt BESERTA paket logika bersamanya, dengan struktur
 * direktori yang sama seperti di repo — impor relatifnya menembus dua tingkat ke
 * `packages/logika/src`, dan itu bagian dari yang diuji: kalau salinan kedua
 * aturan muncul di dalam promptCoach.ts, impor itu tidak lagi dibutuhkan dan
 * pemeriksaan di bawah akan menemukan selisihnya.
 */
function muatInti() {
  const kerja = mkdtempSync(join(tmpdir(), 'coach-'));
  mkdirSync(join(kerja, 'supabase/functions/_shared'), { recursive: true });
  mkdirSync(join(kerja, 'packages/logika/src'), { recursive: true });
  copyFileSync(
    'supabase/functions/_shared/promptCoach.ts',
    join(kerja, 'supabase/functions/_shared/promptCoach.ts'),
  );
  for (const berkas of readdirSync('packages/logika/src')) {
    copyFileSync(join('packages/logika/src', berkas), join(kerja, 'packages/logika/src', berkas));
  }
  execFileSync(
    join(process.cwd(), 'node_modules', '.bin', 'tsc'),
    ['supabase/functions/_shared/promptCoach.ts',
     '--module', 'commonjs', '--target', 'es2022',
     // Impor bergaya Deno memakai akhiran `.ts`; tsc menulis ulang jadi `.js`
     // saat emit, jadi satu sumber yang sama bisa dijalankan Deno dan Node.
     '--rewriteRelativeImportExtensions',
     '--outDir', join(kerja, 'keluar'), '--skipLibCheck'],
    { cwd: kerja, stdio: 'pipe' },
  );
  return {
    inti: require(join(kerja, 'keluar/supabase/functions/_shared/promptCoach.js')),
    logika: require(join(kerja, 'keluar/packages/logika/src/index.js')),
  };
}

const { inti, logika } = muatInti();
const {
  ATURAN_COACH,
  MAKS_TOKEN_COACH,
  MODEL_COACH,
  NAMA_TOOLS,
  TOOLS_COACH,
  formatNilai,
  jalankanTool,
  keBudgetBersama,
  makroHariIni,
  susunKonteks,
  susunSystem,
} = inti;

let gagal = 0;
function cek(label, lulus, detail = '') {
  console.log(`${lulus ? '  ok  ' : ' GAGAL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!lulus) gagal += 1;
}

/** Dua konteks yang BERBEDA isinya; strukturnya sama dengan `konteks_coach`. */
function konteksTiruan(n) {
  return {
    hari_ini: n === 1 ? '2026-09-23' : '2026-09-24',
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
      minggu_mulai: '2026-09-21',
      budget_total: 18200,
      terpakai: 10000,
      sisa: 8200,
      hari_tersisa: 4,
      target_mendatang: 9800,
      sisa_per_hari: 2050,
      rencana_per_hari: 2450,
      // Sepekan penuh: tiga hari berjalan, empat hari mendatang. Bentuknya sama
      // dengan `rincian` dari `budget_mingguan`.
      rincian: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
        tanggal: `2026-09-${21 + i}`,
        nama_tipe_hari: 'Rest',
        target_kalori: i < 3 ? [2850, 3100, 2450][i] : 2450,
        target_asli_kalori: null,
        target_protein_g: 165,
        terpakai_kalori: i < 3 ? [3600, 3800, 2600][i] : 0,
        terpakai_protein_g: i < 3 ? [180, 190, 150][i] : 0,
        status: i < 2 ? 'lampau' : i === 2 ? 'hari ini' : 'mendatang',
        selisih: i < 3 ? [750, 700, 150][i] : null,
      })),
      laju: { status: 'lebih cepat' },
    },
    target_hari_ini: {
      nama_tipe_hari: 'Rest',
      target_kalori: 2450,
      target_protein_g: 165,
      target_lemak_g: 75,
      batas_sat_fat_g: 22,
    },
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
cek(`model ${MODEL_COACH}`, MODEL_COACH === 'claude-opus-5-5');
// Thinking selalu menyala pada model ini dan IKUT dihitung dalam max_tokens,
// walaupun teksnya tidak dikembalikan. Batas yang pas untuk jawaban saja akan
// memotong jawaban di tengah kalimat.
cek(
  `max_tokens ${MAKS_TOKEN_COACH} menyisakan ruang untuk thinking`,
  MAKS_TOKEN_COACH >= 16000,
);
cek(`effort disetel eksplisit: ${inti.UPAYA_COACH}`, inti.UPAYA_COACH === 'medium');
cek('beta fallback server tercatat', inti.BETA_FALLBACK === 'server-side-fallback-2026-07-01');

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
cek(`tujuh fungsi tersedia: ${NAMA_TOOLS.join(', ')}`, NAMA_TOOLS.length === 7);

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
  cek('rincian budget terbawa apa adanya (tujuh hari)', budget.ok && budget.data.rincian.length === 7);

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

console.log('\nAngkanya datang dari LOGIKA BERSAMA, bukan salinan kedua');
{
  const { bandingkanTargetTdee, formatAngka, formatDesimal, hitungMakro, rincianKumulatif } =
    logika;

  // Pemformatan. Kalau coach memformat sendiri, "2850" akan muncul di tengah
  // layar yang seluruh angkanya "2.850" — dan tidak ada tes yang menangkapnya
  // kecuali yang ini.
  cek('format kcal = formatAngka', formatNilai(2850, 'kcal') === formatAngka(2850));
  cek('format kg = formatDesimal 1 digit', formatNilai(74.5, 'kg') === formatDesimal(74.5, 1));
  cek('format cm = formatDesimal 1 digit', formatNilai(85.4, 'cm') === formatDesimal(85.4, 1));
  cek('format % = formatDesimal 1 digit', formatNilai(16.4, '%') === formatDesimal(16.4, 1));
  cek('kcal ditulis gaya Indonesia', formatNilai(18200, 'kcal') === '18.200');
  cek('kg ditulis dengan koma', formatNilai(74.5, 'kg') === '74,5');

  const angka = jalankanTool('ambil_angka', { kunci: 'sisa_budget_pekan' }, a);
  cek(
    'ambil_angka menyertakan bentuk tampil dari pemformat bersama',
    angka.ok && angka.data.nilai_format === formatAngka(8200),
  );

  // Kumulatif: SQL sengaja TIDAK menghitungnya (lihat migrasi endpoint budget),
  // jadi ini satu-satunya sumbernya — dan harus persis `rincianKumulatif`.
  const kum = jalankanTool('ambil_kumulatif_budget', {}, a);
  const kumLangsung = rincianKumulatif(keBudgetBersama(a));
  cek('kumulatif punya tujuh baris', kum.ok && kum.data.baris.length === 7);
  cek(
    'tiap baris kumulatif sama dengan rincianKumulatif',
    kum.ok &&
      kum.data.baris.every(
        (b, i) =>
          b.kumulatif === kumLangsung[i].kumulatif &&
          b.sisa_berjalan === kumLangsung[i].sisaBerjalan &&
          b.terpakai_sampai_sini === kumLangsung[i].terpakaiSampaiSini &&
          b.proyeksi === kumLangsung[i].proyeksi,
      ),
  );
  cek(
    'hari mendatang ditandai proyeksi, hari berjalan tidak',
    kum.ok && kum.data.baris[6].proyeksi === true && kum.data.baris[0].proyeksi === false,
  );
  cek(
    'sisa berjalan ikut diformat',
    kum.ok && kum.data.baris[0].sisa_berjalan_format === formatAngka(kumLangsung[0].sisaBerjalan),
  );

  // Perbandingan target vs TDEE: kalimatnya milik paket bersama, bukan disusun
  // ulang di sini — dua penyusun kalimat pasti berbeda tanda bacanya.
  const banding = jalankanTool('bandingkan_target_tdee', {}, a);
  cek(
    'bacaan target vs TDEE sama dengan bandingkanTargetTdee',
    banding.ok && banding.data.bacaan === bandingkanTargetTdee(2450, 2680, 'Lean Gain'),
  );
  cek('perbandingan TDEE ditandai estimasi', banding.ok && banding.data.sumber === 'estimasi');
  cek(
    'bacaannya menyebut fase yang sedang dijalani',
    banding.ok && /Lean Gain/.test(banding.data.bacaan),
  );

  // Sisa makro: aturan "sisa vs terpakai" dan pembulatannya milik hitungMakro.
  const makro = jalankanTool('ambil_sisa_makro_hari_ini', {}, a);
  const makroLangsung = makroHariIni(a).map((m) => hitungMakro(m, 'sisa'));
  cek('dua makro dilaporkan (kalori & protein)', makro.ok && makro.data.makro.length === 2);
  cek(
    'tiap makro sama dengan hitungMakro',
    makro.ok &&
      makro.data.makro.every(
        (m, i) =>
          m.sisa === makroLangsung[i].nilaiUtama && m.terlampaui === makroLangsung[i].terlampaui,
      ),
  );
  // Hari ini terpakai 2.600 dari target 2.450 → terlampaui, dan sisanya
  // dilaporkan sebagai 150 (mutlak) dengan penanda terlampaui — bukan −150 yang
  // bisa terbaca sebagai "masih ada".
  cek(
    'target yang terlampaui ditandai, bukan dilaporkan negatif',
    makro.ok && makro.data.makro[0].terlampaui === true && makro.data.makro[0].sisa === 150,
  );
  cek(
    'sisa makro ikut diformat',
    makro.ok && makro.data.makro[0].sisa_format === formatAngka(150),
  );

  // Lemak & lemak jenuh TIDAK dilaporkan: targetnya ada di konteks tapi
  // konsumsinya tidak, dan mengirim 0 akan jadi kesimpulan dari kekosongan data.
  cek(
    'makro tanpa data konsumsi tidak dilaporkan',
    makro.ok && !makro.data.makro.some((m) => m.key === 'satFat' || m.key === 'lemak'),
  );

  // Pemetaan budget adalah PEMETAAN, bukan perhitungan ulang.
  const b = keBudgetBersama(a);
  cek('total & sisa diambil apa adanya dari SQL', b.budgetTotal === 18200 && b.sisa === 8200);
  cek(
    'sisa per hari tidak dihitung ulang di klien',
    b.sisaPerHari === a.budget.sisa_per_hari,
  );
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
  cek(
    'thinking tidak dimatikan (ditolak 400 pada model ini)',
    !/type:\s*'disabled'/.test(src),
  );
  cek(
    'tool_choice paksa tidak dipakai (any/tool ditolak 400 pada model ini)',
    !/tool_choice:\s*\{\s*type:\s*'(any|tool)'/.test(src),
  );
  cek(
    'effort dikirim eksplisit, bukan mengandalkan nilai bawaan',
    src.includes('output_config: { effort: UPAYA_COACH }'),
  );
  cek(
    'fallback server dinyalakan lewat endpoint beta',
    src.includes('beta.messages.stream') &&
      src.includes("fallbacks: 'default'") &&
      src.includes('betas: [BETA_FALLBACK]'),
  );
  cek(
    'teks dibaca menurut jenis blok, bukan posisi',
    src.includes("blok.type === 'text'") && !/content\[0\]/.test(src),
  );
  cek(
    'blok balasan dikembalikan UTUH ke riwayat dalam satu permintaan',
    src.includes("pesan.push({ role: 'assistant', content: balasan.content })"),
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

console.log('\nKebijakan model sama di SEMUA Edge Function');
{
  // Fungsi foto makanan juga membaca lewat model. Dua fungsi dengan kebijakan
  // model berbeda berarti satu bagian app diam-diam berjalan di model lama
  // sementara yang lain sudah pindah — dan tidak ada yang akan menyadarinya.
  const foto = readFileSync('supabase/functions/estimasi-makanan-foto/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  cek(
    `fungsi foto memakai model bawaan yang sama (${MODEL_COACH})`,
    foto.includes(`?? '${MODEL_COACH}'`),
  );
  cek(
    'fungsi foto menyalakan fallback server',
    foto.includes('beta.messages.create') &&
      foto.includes("fallbacks: 'default'") &&
      foto.includes("betas: ['server-side-fallback-2026-07-01']"),
  );
  cek('fungsi foto menyetel effort eksplisit', foto.includes('output_config: { effort }'));
  cek(
    'fungsi foto tidak mematikan thinking maupun memaksa tool',
    !/type:\s*'disabled'/.test(foto) && !/tool_choice:\s*\{\s*type:\s*'(any|tool)'/.test(foto),
  );
  cek(
    'fungsi foto menangani balasan tanpa panggilan tool',
    foto.includes("b.type === 'tool_use'") && foto.includes('!blokTool'),
  );
}

console.log(
  gagal === 0
    ? '\n✓ Prompt coach: prefiks cache stabil, fungsi jujur soal data yang tidak ada, endpoint menjaga kunci & RLS'
    : `\n✗ ${gagal} pemeriksaan gagal`,
);
process.exit(gagal === 0 ? 0 : 1);
