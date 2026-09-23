/**
 * Inti yang bisa diuji dari endpoint chat AI Coach.
 *
 * Dipisah dari `index.ts` dengan sengaja: berkas ini MURNI — tidak menyentuh
 * jaringan, tidak membaca env, tidak memanggil Supabase. Dengan begitu aturan
 * yang paling mudah rusak bisa diuji tanpa kunci API dan tanpa database:
 *
 *   • bagian system yang STABIL harus byte-identik antar permintaan, karena
 *     prompt caching Anthropic mencocokkan PREFIKS. Satu timestamp yang
 *     terselip di sana membatalkan seluruh cache tanpa pesan kesalahan apa pun
 *     — yang terlihat hanya tagihan yang naik;
 *   • konteks data yang berubah tiap permintaan harus berada SESUDAH titik
 *     cache, bukan sebelum;
 *   • coach tidak menghitung sendiri. Ia memanggil fungsi, dan angkanya datang
 *     dari konteks yang app sudah hitung — jadi angka di chat dijamin sama
 *     dengan angka di layar lain;
 *   • setiap angka yang dikembalikan fungsi membawa `sumber`-nya.
 */

/**
 * Model dan batasnya. Opus 5 memakai adaptive thinking (bawaan, tidak perlu
 * disetel) dan `budget_tokens` sudah dihapus — mengirimnya akan ditolak 400.
 */
export const MODEL_COACH = 'claude-opus-5';

/** Streaming dipakai, jadi max_tokens boleh longgar tanpa risiko timeout HTTP. */
export const MAKS_TOKEN_COACH = 8000;

/**
 * Aturan coach — bagian system yang TIDAK BOLEH berubah antar permintaan.
 *
 * Isinya hanya aturan dan cara kerja, tanpa satu pun angka milik pengguna.
 * Itu bukan kerapian: begitu ada data pengguna di sini, prefiks cache berubah
 * setiap kali datanya berubah, dan caching-nya tidak pernah kena.
 */
export const ATURAN_COACH = `Kamu adalah coach body recomposition di dalam app pribadi milik SATU pengguna.

CARA KERJA ANGKA
- Kamu TIDAK menghitung sendiri. Setiap angka yang kamu sebut harus berasal dari
  hasil pemanggilan fungsi atau dari blok KONTEKS yang diberikan.
- Kalau angka yang dibutuhkan tidak ada di sana, katakan datanya belum ada.
  Jangan memperkirakan, jangan membulatkan dari ingatan.
- Setiap angka punya field "sumber": manual (diketik pengguna), sinkron (dari
  perangkat), atau estimasi (hasil rumus). Saat menyebut angka bersumber
  estimasi, sebut juga bahwa ia estimasi.

BERAT BADAN
- Pakai RATA-RATA 7 HARI, selalu. Timbangan satu hari naik-turun karena air dan
  isi perut, dan menafsirkannya sebagai perubahan tubuh itu keliru.
- Timbangan harian memang ada di deret grafik, tapi jangan dikutip sebagai
  "berat kamu sekarang".

BATAS
- Kamu bukan tenaga medis. Jangan memberi dosis obat, jangan mendiagnosis,
  jangan meresepkan. Untuk obat, gejala, atau kondisi kesehatan, yang menjawab
  harus dokter yang memeriksa pengguna.

GAYA
- Bahasa Indonesia, ringkas, langsung. Satu gagasan per paragraf.
- Angka ditulis gaya Indonesia: 2.850 kcal, 74,5 kg.
- Jangan menyemangati berlebihan dan jangan menakut-nakuti. Sebut apa yang
  datanya tunjukkan, lalu satu langkah yang bisa diambil.`;

/** Bentuk konteks yang dikirim `konteks_coach` di SQL; hanya yang dipakai di sini. */
export type KonteksCoach = {
  hari_ini: string;
  fase: string;
  profil: Record<string, unknown>;
  angka: {
    kunci: string;
    nilai: number;
    unit: string;
    sumber: 'manual' | 'sinkron' | 'estimasi';
    dasar: Record<string, unknown>;
  }[];
  tren: Record<string, unknown>;
  budget: Record<string, unknown>;
  target_hari_ini: Record<string, unknown> | null;
  ukuran: Record<string, unknown>;
  body_fat: Record<string, unknown>;
  tdee: Record<string, unknown>;
  evaluasi_terakhir: Record<string, unknown> | null;
  ringkasan_terakhir: Record<string, unknown> | null;
  aturan: Record<string, unknown>;
};

/** Satu blok system; bentuknya sama dengan yang diminta Messages API. */
export type BlokSystem = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

/**
 * Susun bagian `system` permintaan.
 *
 * URUTANNYA adalah inti fungsi ini: blok aturan (stabil, ditandai cache) lebih
 * dulu, blok konteks (berubah tiap permintaan) sesudahnya. Membalik urutannya
 * membuat cache tidak pernah kena — dan tidak ada pesan kesalahan yang
 * memberitahu; yang terlihat hanya `cache_read_input_tokens` yang selalu nol.
 */
export function susunSystem(konteks: KonteksCoach): BlokSystem[] {
  return [
    { type: 'text', text: ATURAN_COACH, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: susunKonteks(konteks) },
  ];
}

/**
 * Blok KONTEKS: data pengguna yang berlaku saat ini.
 *
 * Angkanya ditulis sebagai JSON, bukan dirangkai jadi kalimat. Kalimat akan
 * memaksa model menyalin angka dari prosa, dan salah salin itu tidak bisa
 * dideteksi siapa pun. JSON juga membawa `sumber` tiap angka apa adanya.
 */
export function susunKonteks(konteks: KonteksCoach): string {
  return [
    `KONTEKS (tanggal ${konteks.hari_ini}, fase ${konteks.fase})`,
    'Angka yang boleh dikutip — masing-masing dengan sumbernya:',
    JSON.stringify(konteks.angka),
    'Target hari ini:',
    JSON.stringify(konteks.target_hari_ini),
    'Keadaan batas pinggang:',
    JSON.stringify((konteks.ukuran as { batas_pinggang?: unknown }).batas_pinggang ?? null),
    'Laporan terakhir yang sudah kamu sampaikan (jangan diulang apa adanya):',
    JSON.stringify({
      evaluasi: konteks.evaluasi_terakhir,
      ringkasan: konteks.ringkasan_terakhir,
    }),
    'Rincian lain tersedia lewat fungsi. Panggil fungsinya, jangan menebak.',
  ].join('\n');
}

/**
 * Fungsi yang bisa dipanggil coach.
 *
 * Semuanya dijawab dari KONTEKS yang sudah diambil, bukan dari query baru.
 * Dua akibatnya disengaja: tidak ada round-trip tambahan di tengah percakapan,
 * dan seluruh jawaban dalam satu balasan memakai satu snapshot data yang sama —
 * jadi dua angka dalam satu paragraf tidak mungkin berasal dari dua waktu.
 *
 * `strict: true` membuat server memvalidasi argumennya terhadap skema, jadi
 * input yang tidak sah tidak pernah sampai ke kode ini. `additionalProperties`
 * false + `required` adalah syarat mode itu.
 */
export const TOOLS_COACH = [
  {
    name: 'ambil_angka',
    description:
      'Ambil satu angka yang boleh dikutip beserta sumber & dasarnya. Pakai ini ' +
      'alih-alih menghitung atau mengingat. Kunci yang tersedia ada di blok KONTEKS.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        kunci: {
          type: 'string',
          description: 'Kunci angka, mis. berat_rata_7_hari, sisa_budget_pekan, tdee.',
        },
      },
      required: ['kunci'],
      additionalProperties: false,
    },
  },
  {
    name: 'ambil_rincian_budget',
    description:
      'Rincian budget kalori pekan ini hari demi hari: target, terpakai, selisih, ' +
      'dan status tiap hari. Pakai ini bila pertanyaannya tentang pola harian.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'ambil_deret_berat',
    description:
      'Deret rata-rata 7 hari beserta timbangan hariannya, untuk melihat arah. ' +
      'Timbangan harian di sini adalah titik grafik, bukan "berat sekarang".',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'ambil_riwayat_ukuran',
    description:
      'Riwayat satu bagian tubuh beserta perubahan & laju per pekannya.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        bagian: {
          type: 'string',
          description:
            'Nama kolom bagian tubuh: pinggang_cm, dada_cm, leher_cm, ' +
            'lengan_kiri_cm, lengan_kanan_cm, paha_kiri_cm, paha_kanan_cm.',
        },
      },
      required: ['bagian'],
      additionalProperties: false,
    },
  },
];

/** Hasil satu pemanggilan fungsi; selalu JSON, selalu membawa asal angkanya. */
export type HasilTool = { ok: true; data: unknown } | { ok: false; alasan: string };

/**
 * Jalankan satu fungsi terhadap konteks.
 *
 * Fungsi yang tidak menemukan datanya mengembalikan `ok: false` beserta
 * alasannya, BUKAN nol atau string kosong. Nol akan dikutip coach sebagai
 * angka sungguhan, dan "sisa budget 0 kcal" adalah kalimat yang salah dengan
 * cara yang berbahaya.
 */
export function jalankanTool(
  nama: string,
  input: Record<string, unknown>,
  konteks: KonteksCoach,
): HasilTool {
  switch (nama) {
    case 'ambil_angka': {
      const kunci = String(input.kunci ?? '');
      const angka = konteks.angka.find((a) => a.kunci === kunci);
      if (!angka) {
        return {
          ok: false,
          alasan: `Angka "${kunci}" belum tersedia. Kunci yang ada: ${konteks.angka
            .map((a) => a.kunci)
            .join(', ')}.`,
        };
      }
      return { ok: true, data: angka };
    }

    case 'ambil_rincian_budget': {
      const rincian = (konteks.budget as { rincian?: unknown }).rincian;
      if (!Array.isArray(rincian) || rincian.length === 0) {
        return { ok: false, alasan: 'Rincian budget pekan ini belum ada.' };
      }
      return {
        ok: true,
        data: { sumber: 'manual', rincian, laju: (konteks.budget as { laju?: unknown }).laju },
      };
    }

    case 'ambil_deret_berat': {
      const deret = (konteks.tren as { deret?: unknown }).deret;
      if (!Array.isArray(deret) || deret.length === 0) {
        return { ok: false, alasan: 'Belum ada timbangan untuk membentuk deret.' };
      }
      return {
        ok: true,
        data: {
          sumber: 'manual',
          catatan:
            'rata_rata_kg adalah angka yang boleh dikutip; berat_harian_kg hanya titik grafik.',
          deret,
          arah: (konteks.tren as { arah?: unknown }).arah,
          kecukupan: (konteks.tren as { kecukupan?: unknown }).kecukupan,
        },
      };
    }

    case 'ambil_riwayat_ukuran': {
      const bagian = String(input.bagian ?? '');
      const semua = (konteks.ukuran as { bagian?: Record<string, unknown> }).bagian ?? {};
      const isi = semua[bagian];
      if (!isi) {
        return {
          ok: false,
          alasan: `Bagian "${bagian}" belum pernah diukur. Yang ada: ${Object.keys(semua).join(', ') || 'belum ada'}.`,
        };
      }
      return { ok: true, data: { sumber: 'manual', bagian, ...(isi as object) } };
    }

    default:
      return { ok: false, alasan: `Fungsi "${nama}" tidak dikenal.` };
  }
}

/** Nama semua fungsi yang tersedia; dipakai pemeriksaan & pencatatan widget. */
export const NAMA_TOOLS = TOOLS_COACH.map((t) => t.name);
