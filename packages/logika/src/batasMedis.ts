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
