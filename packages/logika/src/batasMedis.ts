import type { KategoriMedis, PenolakanMedis } from './tipe';

/**
 * Batas medis AI Coach.
 *
 * PRD menetapkan satu larangan tegas: coach tidak memberi dosis obat. Di sini
 * larangan itu diperluas sedikit ke dua tetangganya yang sama berbahayanya —
 * mendiagnosis penyakit dan meresepkan — karena ketiganya gagal dengan cara
 * yang sama: jawaban yang terdengar meyakinkan pada pertanyaan yang seharusnya
 * dijawab orang yang memeriksa tubuh penanyanya.
 *
 * Pemeriksaan dilakukan di KLIEN, sebelum pertanyaannya dikirim ke mana pun.
 * Dua alasannya: penolakan jadi pasti, tidak bergantung pada model yang mungkin
 * sedang menurut dan mungkin tidak; dan pertanyaan kesehatan yang sensitif
 * tidak perlu meninggalkan perangkat hanya untuk ditolak.
 *
 * Sisi yang paling penting justru yang TIDAK ditolak. Aplikasi ini memang
 * membicarakan protein, kalori, dan suplemen makanan sepanjang hari; pendeteksi
 * yang terlalu bersemangat akan menolak pertanyaan wajar dan membuat seluruh
 * fiturnya tidak bisa dipakai. Karena itu pemicunya dijaga spesifik dan diuji
 * dari dua arah.
 */

/** Disclaimer tetap; ditampilkan di layar Coach, bukan hanya saat menolak. */
export const DISCLAIMER_COACH =
  'Coach membaca data Anda dan membicarakan latihan serta gizi. Ia bukan tenaga medis: untuk obat, gejala, atau kondisi kesehatan, yang menjawab harus dokter yang memeriksa Anda.';

/** Nama obat & terapi yang paling sering ditanyakan dosisnya di konteks ini. */
const OBAT = [
  'obat',
  'dosis',
  'resep',
  'antibiotik',
  'insulin',
  'metformin',
  'steroid',
  'anabolik',
  'testosteron',
  'trt',
  'clomid',
  'nolvadex',
  'ozempic',
  'semaglutide',
  'liraglutide',
  'sibutramin',
  'orlistat',
  'diuretik',
  'suntik',
  'infus',
];

/** Kata yang menandakan permintaan diagnosis, bukan sekadar menyebut gejala. */
const DIAGNOSIS = [
  'diagnosa',
  'diagnosis',
  'saya sakit apa',
  'penyakit apa',
  'apakah saya kena',
  'apakah saya terkena',
  'gejala apa',
  'kanker',
  'tumor',
  'diabetes',
  'hipertensi',
  'tiroid',
  'pcos',
];

/**
 * Kata yang menandakan permintaan TAKARAN, dipakai bersama daftar obat.
 * "pakai" sengaja tidak masuk: ia sama seringnya dipakai untuk MENYEBUT obat
 * yang sedang dijalani ("saya sedang pakai obat dari dokter") seperti untuk
 * menanyakan takarannya, dan salah kategori membuat penolakannya menjawab
 * pertanyaan yang tidak diajukan.
 */
const MINTA_TAKARAN = ['berapa', 'takaran', 'dosis', 'minum', 'konsumsi', 'aman'];

/**
 * Periksa apakah sebuah pertanyaan melewati batas medis.
 * Mengembalikan `null` bila aman dijawab coach.
 */
export function periksaBatasMedis(pertanyaan: string): PenolakanMedis | null {
  const teks = ` ${pertanyaan.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;

  const obat = cariPemicu(teks, OBAT);
  if (obat !== null) {
    // Menyebut obat + meminta takaran = permintaan dosis. Menyebut obat saja
    // (mis. "saya sedang minum obat dari dokter, apa perlu ubah target?")
    // tetap ditolak, tapi dengan alasan yang berbeda dan lebih lunak.
    const mintaTakaran = cariPemicu(teks, MINTA_TAKARAN) !== null;
    return susun(mintaTakaran ? 'dosis-obat' : 'resep', obat);
  }

  const diagnosis = cariPemicu(teks, DIAGNOSIS);
  if (diagnosis !== null) return susun('diagnosis', diagnosis);

  return null;
}

/**
 * Klitik & akhiran yang lazim menempel di bahasa Indonesia.
 *
 * Tanpa ini, "obatnya" dan "dosisnya" lolos sementara "obat" dan "dosis"
 * ditolak — dan bentuk berakhiran itu justru yang paling sering diketik orang.
 */
const AKHIRAN = '(?:nya|ku|mu|lah|kah)?';

/**
 * Cari pemicu sebagai KATA UTUH (boleh berakhiran), bukan potongan kata lain.
 * Batas kata penting: "sobat" tidak boleh terbaca sebagai "obat".
 */
function cariPemicu(teksBerpadding: string, daftar: string[]): string | null {
  for (const kata of daftar) {
    const pola = new RegExp(`(?<![\\p{L}\\p{N}])${kata.replace(/ /g, '\\s+')}${AKHIRAN}(?![\\p{L}\\p{N}])`, 'u');
    if (pola.test(teksBerpadding)) return kata;
  }
  return null;
}

function susun(kategori: KategoriMedis, pemicu: string): PenolakanMedis {
  const bisaDibantu = [
    'Menghitung kalori, protein, dan sisa jatah harian Anda',
    'Membaca tren berat, ukuran tubuh, dan kekuatan Anda',
    'Menyiapkan ringkasan data untuk dibawa ke dokter Anda',
  ];

  if (kategori === 'dosis-obat') {
    return {
      kategori,
      pemicu,
      judul: 'Ini di luar batas saya',
      alasan:
        'Saya tidak memberi dosis atau aturan pakai obat — termasuk yang dijual bebas. Takaran yang tepat bergantung pada berat badan, fungsi ginjal dan hati, obat lain yang sedang Anda pakai, dan riwayat kesehatan Anda; tidak satu pun dari itu bisa saya periksa.',
      bisaDibantu,
    };
  }

  if (kategori === 'diagnosis') {
    return {
      kategori,
      pemicu,
      judul: 'Ini pertanyaan untuk dokter',
      alasan:
        'Saya tidak bisa menyimpulkan penyakit dari angka di app ini. Data berat, ukuran, dan asupan berguna untuk dibawa ke pemeriksaan, tapi ia tidak menggantikan pemeriksaan itu sendiri.',
      bisaDibantu,
    };
  }

  return {
    kategori,
    pemicu,
    judul: 'Soal obat, dokter Anda yang menjawab',
    alasan:
      'Saya tidak memberi saran mengenai obat, termasuk apakah sebuah obat perlu dilanjutkan, dihentikan, atau diganti. Kalau obat yang Anda pakai memengaruhi nafsu makan atau berat, dokter yang meresepkannya perlu tahu — dan ia yang memutuskan.',
    bisaDibantu,
  };
}

// ---------------------------------------------------------------------------
// Pemeriksaan JAWABAN
// ---------------------------------------------------------------------------

/**
 * Obat & terapi yang tidak boleh diberi takaran atau anjuran di jawaban coach.
 *
 * Sama dengan `OBAT` di atas KECUALI kata "dosis" dan "resep". Di pertanyaan,
 * dua kata itu tanda permintaan medis; di jawaban, "dosis kreatin 5 g" adalah
 * kalimat gizi biasa, dan menolaknya akan membuang jawaban yang benar.
 */
const OBAT_JAWABAN = OBAT.filter((k) => k !== 'dosis' && k !== 'resep');

/**
 * Takaran obat: angka + satuan farmasi. Gram SENGAJA tidak termasuk — gram
 * adalah satuan makanan & suplemen yang dibicarakan app ini sepanjang hari.
 */
const POLA_TAKARAN =
  /\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|μg|ml|cc|iu|unit|tablet|kapsul|butir|tetes|ampul|suntikan)(?![\p{L}])/iu;

/** Frekuensi minum/suntik: "2x sehari", "dua kali seminggu". */
const POLA_FREKUENSI =
  /(?:\d+|satu|dua|tiga|empat|sekali)\s?(?:x|kali)\s?(?:sehari|seminggu|sepekan|per\s?hari|per\s?minggu)/iu;

/** Kata kerja anjuran: jawaban yang MENYURUH memulai, mengubah, atau menghentikan. */
const ANJURAN = [
  'coba',
  'cobalah',
  'mulai',
  'mulailah',
  'gunakan',
  'pakailah',
  'minumlah',
  'tambahkan',
  'hentikan',
  'berhenti',
  'stop',
  'kurangi',
  'naikkan',
  'turunkan',
  'ganti',
];

/** Rujukan ke tenaga medis; kalimat yang memuatnya mengarahkan, bukan menganjurkan. */
const RUJUKAN_MEDIS = ['dokter', 'apoteker', 'tenaga medis', 'tenaga kesehatan'];

/** Kata kerja yang menyatakan seseorang MENGIDAP sesuatu. */
const MENGIDAP = ['menderita', 'mengidap', 'terkena', 'kena'];

/** Nama penyakit — bagian daftar DIAGNOSIS yang berupa kata benda, plus kerabatnya. */
const PENYAKIT = [
  'diabetes',
  'prediabetes',
  'hipertensi',
  'tiroid',
  'hipotiroid',
  'hipertiroid',
  'pcos',
  'kanker',
  'tumor',
  'anemia',
  'resistensi insulin',
  'gagal ginjal',
];

const SAPAAN = ['anda', 'kamu'];

/**
 * Kata anjuran yang BEKERJA pada obat: kata kerjanya diikuti nama obat dalam
 * paling banyak tiga kata ("hentikan metformin", "coba kurangi dosis obat").
 * Kedekatan itu yang membedakan anjuran dari kalimat yang kebetulan memuat
 * keduanya — "coba catat juga kapan Anda minum obat" bukan anjuran minum obat.
 */
const POLA_ANJURAN_OBAT = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${ANJURAN.join('|')})(?:lah)?` +
    `(?:\\s+[\\p{L}\\p{N}]+){0,3}?\\s+` +
    `(${OBAT_JAWABAN.map((k) => k.replace(/ /g, '\\s+')).join('|')})${AKHIRAN}(?![\\p{L}\\p{N}])`,
  'u',
);

function cariAnjuranObat(teksBerpadding: string): string | null {
  const m = POLA_ANJURAN_OBAT.exec(teksBerpadding);
  return m ? m[1] : null;
}

/**
 * Periksa JAWABAN coach sebelum sampai ke pengguna.
 *
 * Pemeriksaan pertanyaan (`periksaBatasMedis`) hanya menjaga pintu masuk.
 * Pertanyaan yang sepenuhnya wajar — "kenapa berat saya turun cepat?" — bisa
 * saja dijawab model dengan menyebut obat dan takarannya, dan tidak ada
 * pemeriksaan pertanyaan yang bisa menangkap itu. Karena itu jawabannya juga
 * diperiksa, per kalimat, untuk tiga hal yang dilarang PRD dan tetangganya:
 *
 *   • dosis-obat — nama obat bersama takaran farmasi atau frekuensi minum;
 *   • diagnosis  — "Anda (mungkin) menderita/mengidap <penyakit>";
 *   • resep      — anjuran memulai/mengubah/menghentikan obat TANPA merujuk
 *                  ke dokter di kalimat yang sama.
 *
 * Yang sengaja LOLOS: menyebut obat tanpa takaran ("obat dari dokter Anda bisa
 * memengaruhi nafsu makan"), merujuk ke dokter ("tanyakan metformin ke dokter
 * Anda"), dan takaran suplemen dalam gram ("kreatin 5 g"). Positif palsu di
 * sini membuang jawaban yang benar dan menggantinya dengan penolakan atas
 * pertanyaan yang tidak pernah melanggar apa pun.
 */
export function periksaJawabanMedis(jawaban: string): PenolakanMedis | null {
  // Dipecah per kalimat: nama obat di satu kalimat dan "2x sehari" untuk
  // latihan di kalimat lain bukan takaran obat.
  const kalimat = jawaban.split(/(?<=[.!?])\s+|\n+/u);

  for (const k of kalimat) {
    const teks = ` ${k.toLowerCase().replace(/[^\p{L}\p{N}\s.,]/gu, ' ')} `;
    const obat = cariPemicu(teks, OBAT_JAWABAN);

    if (obat !== null && (POLA_TAKARAN.test(k) || POLA_FREKUENSI.test(k))) {
      return susun('dosis-obat', obat);
    }

    const obatDianjurkan = cariAnjuranObat(teks);
    if (obatDianjurkan !== null && cariPemicu(teks, RUJUKAN_MEDIS) === null) {
      return susun('resep', obatDianjurkan);
    }

    const penyakit = cariPemicu(teks, PENYAKIT);
    if (
      penyakit !== null &&
      cariPemicu(teks, SAPAAN) !== null &&
      cariPemicu(teks, MENGIDAP) !== null
    ) {
      return susun('diagnosis', penyakit);
    }
  }
  return null;
}
