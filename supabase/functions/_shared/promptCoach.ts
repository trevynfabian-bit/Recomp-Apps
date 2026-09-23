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
 *   • setiap angka yang dikembalikan fungsi membawa `sumber`-nya;
 *   • angkanya datang dari LOGIKA BERSAMA `@recomp/logika`, bukan dari kode
 *     kedua yang ditulis khusus untuk coach. Dua implementasi aturan yang sama
 *     pasti menyimpang, dan yang paling mahal bukan selisih angkanya melainkan
 *     hilangnya kepercayaan: chat mengatakan satu hal, layar mengatakan hal
 *     lain, dan pengguna tidak punya cara menentukan mana yang benar.
 *
 * Termasuk PEMFORMATANNYA. Setiap angka dikirim ke model beserta bentuk
 * tampilnya (`nilai_format`) yang dibuat `formatAngka`/`formatDesimal` — jadi
 * model tidak pernah perlu memformat sendiri, dan "2850" tidak akan muncul di
 * tengah layar yang seluruh angkanya "2.850".
 */
import {
  bandingkanTargetTdee,
  formatAngka,
  formatDesimal,
  hitungMakro,
  rincianKumulatif,
} from '../../../packages/logika/src/index.ts';
import type {
  BudgetMingguan,
  Fase,
  MacroProgress,
} from '../../../packages/logika/src/tipe.ts';

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
 * Bentuk tampil sebuah angka, dibuat pemformat BERSAMA.
 *
 * Satuan menentukan ketelitiannya: kalori & gram ditulis bulat, kilogram dan
 * sentimeter satu desimal, persen satu desimal. Itu bukan selera — itu
 * ketelitian alat ukurnya, dan menulis "74,53 kg" mengaku punya presisi yang
 * timbangannya tidak punya.
 */
export function formatNilai(nilai: number, unit: string): string {
  if (unit === 'kg' || unit === 'cm' || unit === '%') return formatDesimal(nilai, 1);
  return formatAngka(nilai);
}

/**
 * Petakan blok budget dari SQL ke bentuk yang dipakai @recomp/logika.
 *
 * Ini PEMETAAN, bukan perhitungan ulang: angkanya diambil apa adanya dari
 * jawaban `budget_mingguan`, lalu diserahkan ke fungsi bersama untuk turunannya.
 * `npm run cek:paritas` sudah membuktikan kedua sisi menghasilkan angka yang
 * sama, jadi menurunkan sisanya di sini tidak menambah sumber kebenaran baru.
 */
export function keBudgetBersama(konteks: KonteksCoach): BudgetMingguan | null {
  const b = konteks.budget as {
    minggu_mulai?: string;
    budget_total?: number;
    terpakai?: number;
    sisa?: number;
    hari_tersisa?: number;
    target_mendatang?: number;
    sisa_per_hari?: number | null;
    rencana_per_hari?: number | null;
    rincian?: {
      tanggal: string;
      nama_tipe_hari: string | null;
      target_kalori: number;
      target_asli_kalori: number | null;
      target_protein_g: number;
      terpakai_kalori: number;
      status: 'lampau' | 'hari ini' | 'mendatang';
      selisih: number | null;
    }[];
  };
  if (!Array.isArray(b.rincian) || b.rincian.length === 0) return null;

  const rincian = b.rincian.map((h) => ({
    tanggal: h.tanggal,
    namaTipeHari: h.nama_tipe_hari ?? 'Tanpa tipe hari',
    targetKalori: h.target_kalori,
    targetAsliKalori: h.target_asli_kalori ?? undefined,
    terpakaiKalori: h.terpakai_kalori,
    targetProteinG: h.target_protein_g,
    status: h.status,
    selisih: h.selisih,
  }));

  return {
    mingguMulai: b.minggu_mulai ?? rincian[0].tanggal,
    budgetTotal: b.budget_total ?? 0,
    terpakai: b.terpakai ?? 0,
    sisa: b.sisa ?? 0,
    hariTersisa: b.hari_tersisa ?? 0,
    targetMendatang: b.target_mendatang ?? 0,
    sisaPerHari: b.sisa_per_hari ?? null,
    rencanaPerHari: b.rencana_per_hari ?? null,
    rincian,
  };
}

/**
 * Susun makro hari ini dari target & konsumsi yang ada di konteks.
 *
 * HANYA kalori dan protein. Lemak dan lemak jenuh punya targetnya di konteks,
 * tapi KONSUMSI-nya tidak — dan mengirimnya dengan `terpakai: 0` akan membuat
 * coach berkata "lemak jenuhmu masih 0 g hari ini", yang bukan kesimpulan dari
 * data melainkan dari kekosongan data. Karbo memang tidak ditargetkan
 * (`MacroProgress.target` boleh null), jadi ia juga tidak ikut.
 */
export function makroHariIni(konteks: KonteksCoach): MacroProgress[] {
  const t = konteks.target_hari_ini as {
    target_kalori?: number;
    target_protein_g?: number;
  } | null;
  if (!t) return [];

  const hari = (
    konteks.budget as {
      rincian?: { tanggal: string; terpakai_kalori: number; terpakai_protein_g: number }[];
    }
  ).rincian?.find((h) => h.tanggal === konteks.hari_ini);
  if (!hari) return [];

  const makro: MacroProgress[] = [];
  if (typeof t.target_kalori === 'number') {
    makro.push({
      key: 'kalori',
      label: 'Kalori',
      terpakai: hari.terpakai_kalori,
      target: t.target_kalori,
      unit: 'kcal',
    });
  }
  if (typeof t.target_protein_g === 'number') {
    makro.push({
      key: 'protein',
      label: 'Protein',
      terpakai: hari.terpakai_protein_g,
      target: t.target_protein_g,
      unit: 'g',
    });
  }
  return makro;
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
    name: 'ambil_sisa_makro_hari_ini',
    description:
      'Sisa kalori & protein hari ini, dihitung dengan aturan yang sama dengan ' +
      'panel di layar Hari Ini. Menyebut juga bila targetnya sudah terlampaui.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'ambil_kumulatif_budget',
    description:
      'Sisa jatah pekan ini hari demi hari (kumulatif). Pakai ini untuk menjawab ' +
      '"setelah hari ini tinggal berapa"; hari yang belum berjalan diproyeksikan ' +
      'dari targetnya dan ditandai proyeksi.',
    strict: true,
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'bandingkan_target_tdee',
    description:
      'Bandingkan target kalori hari ini dengan perkiraan TDEE menurut fase yang ' +
      'sedang dijalani. Deskriptif — menyebut arah dan besarnya, bukan menyuruh.',
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
      // Bentuk tampilnya ikut dikirim, jadi model tidak pernah memformat sendiri.
      return {
        ok: true,
        data: { ...angka, nilai_format: formatNilai(angka.nilai, angka.unit) },
      };
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

    case 'ambil_sisa_makro_hari_ini': {
      const makro = makroHariIni(konteks);
      if (makro.length === 0) {
        return { ok: false, alasan: 'Target atau catatan hari ini belum ada.' };
      }
      // `hitungMakro` memutlakkan angkanya dan membawa tandanya di
      // `terlampaui`; itu dipertahankan apa adanya supaya coach tidak
      // menafsirkan "sisa 150" sebagai kurang padahal artinya lebih.
      return {
        ok: true,
        data: {
          sumber: 'manual',
          makro: makro.map((m) => {
            const h = hitungMakro(m, 'sisa');
            return {
              key: m.key,
              label: m.label,
              unit: m.unit,
              target: m.target,
              terpakai: m.terpakai,
              sisa: h.nilaiUtama,
              sisa_format: formatNilai(h.nilaiUtama, m.unit),
              terlampaui: h.terlampaui,
              progres: h.progres,
            };
          }),
        },
      };
    }

    case 'ambil_kumulatif_budget': {
      const budget = keBudgetBersama(konteks);
      if (!budget) return { ok: false, alasan: 'Rincian budget pekan ini belum ada.' };
      return {
        ok: true,
        data: {
          sumber: 'manual',
          baris: rincianKumulatif(budget).map((b) => ({
            tanggal: b.tanggal,
            nama_tipe_hari: b.namaTipeHari,
            proyeksi: b.proyeksi,
            nilai_kalori: b.nilaiKalori,
            kumulatif: b.kumulatif,
            sisa_berjalan: b.sisaBerjalan,
            sisa_berjalan_format: formatNilai(b.sisaBerjalan, 'kcal'),
            terpakai_sampai_sini: b.terpakaiSampaiSini,
          })),
        },
      };
    }

    case 'bandingkan_target_tdee': {
      const target = (konteks.target_hari_ini as { target_kalori?: number } | null)
        ?.target_kalori;
      const tengah = (konteks.tdee as { tengah?: number | null }).tengah ?? null;
      if (typeof target !== 'number') {
        return { ok: false, alasan: 'Target kalori hari ini belum ada.' };
      }
      if (tengah === null) {
        return { ok: false, alasan: 'Perkiraan TDEE belum bisa dihitung.' };
      }
      return {
        ok: true,
        data: {
          // TDEE adalah estimasi, jadi perbandingannya juga estimasi — dan itu
          // ditandai di sini, bukan diserahkan ke kalimat model.
          sumber: 'estimasi',
          target_kalori: target,
          tdee_tengah: tengah,
          bacaan: bandingkanTargetTdee(target, tengah, konteks.fase as Fase),
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
