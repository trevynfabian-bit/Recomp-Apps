/**
 * Edge Function: estimasi makanan dari foto.
 *
 * Menerima satu foto makanan, mengembalikan tebakan makro beserta tingkat
 * keyakinan. Bentuk keluarannya sengaja sama persis dengan `HasilAnalisisFoto`
 * di `src/mocks/fotoAi.ts`, jadi layar Fase 1 tinggal menukar sumber datanya.
 *
 * Fitur ini yang PALING MAHAL di seluruh app (PRD menaruhnya di Fase 4 justru
 * karena itu), sehingga ada tiga penjaga biaya di sini:
 *   1. Wajib sesi login yang sah — bukan endpoint terbuka.
 *   2. Ukuran gambar dibatasi sebelum dikirim ke model.
 *   3. `effort` dapat disetel lewat environment; bawaannya `medium`, bukan `max`.
 *
 * Bentuk permintaannya diperiksa terhadap tipe SDK resmi oleh `npm run
 * cek:edge` — langsung pada berkas ini, bukan pada salinannya.
 */
// Versi SDK DIPATOK, dan sama dengan devDependency proyek: `npm run cek:edge`
// memeriksa berkas ini terhadap tipe SDK yang terpasang, jadi keduanya harus
// versi yang sama agar pemeriksaannya berarti. Impor tanpa versi akan ikut
// berubah perilakunya pada penyebaran berikutnya tanpa satu baris kode pun
// berubah.
import Anthropic from 'npm:@anthropic-ai/sdk@0.127.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

/** Batas ukuran gambar setelah di-decode. Lebih besar dari ini ditolak. */
const MAKS_BYTE_GAMBAR = 5 * 1024 * 1024; // 5 MB

const TIPE_GAMBAR_DIIZINKAN = ['image/jpeg', 'image/png', 'image/webp'] as const;
type TipeGambar = (typeof TIPE_GAMBAR_DIIZINKAN)[number];

/**
 * Skema hasil. `strict: true` pada definisi tool menjamin `tool_use.input`
 * benar-benar sesuai skema ini, jadi tidak perlu mem-parsing teks bebas.
 */
const SKEMA_HASIL = {
  type: 'object',
  properties: {
    nama_makanan: {
      type: 'string',
      description: 'Nama makanan dalam Bahasa Indonesia, sesingkat mungkin tapi jelas.',
    },
    kalori: { type: 'integer', description: 'Perkiraan kalori total, kcal.' },
    protein_g: { type: 'number', description: 'Perkiraan protein, gram.' },
    lemak_g: { type: 'number', description: 'Perkiraan lemak total, gram.' },
    karbo_g: { type: 'number', description: 'Perkiraan karbohidrat, gram.' },
    sat_fat_g: { type: 'number', description: 'Perkiraan lemak jenuh, gram.' },
    keyakinan: {
      type: 'string',
      enum: ['rendah', 'sedang', 'tinggi'],
      description:
        'tinggi bila porsi & bahan jelas terlihat; rendah bila tertutup, ' +
        'campuran, atau ukurannya sulit ditaksir.',
    },
    catatan: {
      type: 'string',
      description:
        'Satu kalimat: asumsi porsi yang dipakai, atau apa yang membuat tebakan ini tidak pasti.',
    },
  },
  required: [
    'nama_makanan',
    'kalori',
    'protein_g',
    'lemak_g',
    'karbo_g',
    'sat_fat_g',
    'keyakinan',
    'catatan',
  ],
  additionalProperties: false,
} as const;

const INSTRUKSI = `Anda menaksir kandungan gizi makanan dari foto untuk aplikasi
pelacak body recomposition milik satu orang.

Cara kerja:
- Taksir untuk PORSI YANG TERLIHAT di foto, bukan porsi standar resep.
- Pakai takaran rumahan Indonesia sebagai acuan bila membantu (centong nasi,
  potong ayam, sendok makan minyak).
- Selalu panggil tool \`catat_estimasi_makanan\` untuk menjawab. Jangan menjawab
  dengan teks biasa.
- Setel \`keyakinan\` dengan jujur. Foto dari atas dengan porsi jelas boleh
  \`tinggi\`; makanan bersaus, tertumpuk, atau tanpa pembanding ukuran sebaiknya
  \`rendah\`. Angka yang ditandai rendah akan diperiksa ulang oleh pengguna.
- Bila foto jelas BUKAN makanan, tetap panggil tool dengan semua angka 0,
  \`keyakinan\` = "rendah", dan jelaskan di \`catatan\`.

Anda hanya menaksir gizi. Jangan memberi saran medis, dosis obat, atau
rekomendasi diet.`;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return balas({ pesan: 'Gunakan POST' }, 405);
  }

  // --- Penjaga 1: wajib sesi login yang sah --------------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return balas({ pesan: 'Tidak ada sesi login' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: sesi, error: galatSesi } = await supabase.auth.getUser();
  if (galatSesi || !sesi?.user) {
    return balas({ pesan: 'Sesi tidak sah' }, 401);
  }

  // --- Baca & validasi masukan ---------------------------------------------
  let badan: { gambar_base64?: string; tipe_gambar?: string };
  try {
    badan = await req.json();
  } catch {
    return balas({ pesan: 'Badan permintaan bukan JSON yang sah' }, 400);
  }

  const { gambar_base64: gambar, tipe_gambar: tipe } = badan;
  if (!gambar || typeof gambar !== 'string') {
    return balas({ pesan: 'Field gambar_base64 wajib diisi' }, 400);
  }
  if (!tipe || !TIPE_GAMBAR_DIIZINKAN.includes(tipe as TipeGambar)) {
    return balas(
      { pesan: `tipe_gambar harus salah satu dari: ${TIPE_GAMBAR_DIIZINKAN.join(', ')}` },
      400,
    );
  }

  // --- Penjaga 2: batas ukuran sebelum menghubungi model --------------------
  // Panjang base64 kira-kira 4/3 ukuran aslinya; dihitung tanpa men-decode.
  const perkiraanByte = Math.floor((gambar.length * 3) / 4);
  if (perkiraanByte > MAKS_BYTE_GAMBAR) {
    return balas(
      {
        pesan: `Gambar terlalu besar (${Math.round(perkiraanByte / 1024 / 1024)} MB). ` +
          `Batasnya ${MAKS_BYTE_GAMBAR / 1024 / 1024} MB — kecilkan dulu di perangkat.`,
      },
      413,
    );
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY belum disetel di secret Edge Function');
    return balas({ pesan: 'Layanan estimasi belum dikonfigurasi' }, 503);
  }

  const anthropic = new Anthropic({ apiKey });

  // --- Penjaga 3: effort dapat disetel; bawaannya medium, bukan max --------
  const effort = (Deno.env.get('ESTIMASI_EFFORT') ?? 'medium') as
    | 'low'
    | 'medium'
    | 'high';

  try {
    const respons = await anthropic.beta.messages.create({
      // Model bawaan dipilih karena membaca foto jauh lebih teliti pada effort
      // yang sama; tetap bisa ditimpa lewat environment tanpa menyebar ulang.
      model: Deno.env.get('ESTIMASI_MODEL') ?? 'claude-opus-5-5',
      // Thinking ikut dihitung dalam batas ini walau teksnya tidak dikembalikan.
      max_tokens: 16000,
      // Pada model bawaan thinking selalu menyala; `adaptive` setara dengan
      // tidak mengirimnya, dan bentuk `disabled`/`budget_tokens` ditolak 400.
      thinking: { type: 'adaptive' },
      // Effort disetel eksplisit: nilai bawaan API berbeda antar model, dan
      // mengandalkannya berarti pergantian model diam-diam mengubah biaya.
      output_config: { effort },
      // Penolakan salah dari pengaman (mis. foto makanan yang terbaca keliru
      // sebagai hal lain) dialihkan ke model pengganti di sisi server, bukan
      // langsung jadi pesan "tidak bisa dianalisis".
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUKSI,
      tools: [
        {
          name: 'catat_estimasi_makanan',
          description: 'Catat hasil taksiran gizi untuk makanan pada foto.',
          input_schema: SKEMA_HASIL,
          // Menjamin `input` benar-benar sesuai skema, jadi tidak perlu
          // mem-parsing atau memvalidasi teks bebas di sisi kita.
          strict: true,
        },
      ],
      // `auto` + instruksi eksplisit, bukan tool_choice paksa: model bawaan
      // menolak tool_choice `any`/`tool` dengan 400. Karena `auto` tidak
      // menjamin panggilan, kasus tanpa tool_use ditangani di bawah.
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: tipe as TipeGambar, data: gambar },
            },
            { type: 'text', text: 'Taksir kandungan gizi makanan pada foto ini.' },
          ],
        },
      ],
    });

    // Model bisa menolak karena alasan keamanan; itu bukan kegagalan server.
    // Sampai di sini berarti seluruh rantai fallback ikut menolak.
    if (respons.stop_reason === 'refusal') {
      return balas(
        { pesan: 'Foto ini tidak bisa dianalisis. Coba foto lain atau catat manual.' },
        422,
      );
    }

    const blokTool = respons.content.find((b) => b.type === 'tool_use');
    if (!blokTool || blokTool.type !== 'tool_use') {
      // Model menjawab teks biasa alih-alih memanggil tool.
      return balas(
        { pesan: 'Model tidak mengembalikan hasil terstruktur. Coba lagi atau catat manual.' },
        502,
      );
    }

    const hasil = blokTool.input as Record<string, unknown>;

    return balas(
      {
        nama_makanan: String(hasil.nama_makanan ?? ''),
        kalori: bulatkan(hasil.kalori, 0),
        protein_g: bulatkan(hasil.protein_g, 1),
        lemak_g: bulatkan(hasil.lemak_g, 1),
        karbo_g: bulatkan(hasil.karbo_g, 1),
        sat_fat_g: bulatkan(hasil.sat_fat_g, 1),
        keyakinan: hasil.keyakinan,
        catatan: String(hasil.catatan ?? ''),
        // Dibawa ke klien supaya pemakaian token bisa dipantau dari log app.
        pemakaian: {
          input: respons.usage.input_tokens,
          output: respons.usage.output_tokens,
        },
      },
      200,
    );
  } catch (galat) {
    if (galat instanceof Anthropic.RateLimitError) {
      return balas({ pesan: 'Layanan sedang sibuk. Coba lagi sebentar lagi.' }, 429);
    }
    if (galat instanceof Anthropic.AuthenticationError) {
      console.error('ANTHROPIC_API_KEY ditolak provider');
      return balas({ pesan: 'Layanan estimasi belum dikonfigurasi' }, 503);
    }
    if (galat instanceof Anthropic.APIError) {
      console.error('Galat API provider:', galat.status, galat.message);
      return balas({ pesan: 'Gagal menganalisis foto. Coba lagi.' }, 502);
    }
    console.error('Galat tak terduga:', galat);
    return balas({ pesan: 'Gagal menganalisis foto. Coba lagi.' }, 500);
  }
});

/** Bulatkan angka dari model; nilai tak masuk akal dijadikan 0. */
function bulatkan(nilai: unknown, desimal: number): number {
  const n = typeof nilai === 'number' ? nilai : Number(nilai);
  if (!Number.isFinite(n) || n < 0) return 0;
  const faktor = 10 ** desimal;
  return Math.round(n * faktor) / faktor;
}

function balas(isi: unknown, status: number): Response {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
