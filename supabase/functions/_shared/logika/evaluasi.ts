// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import type { ArahMetrik, HasilEvaluasi, InputEvaluasi } from './tipe.ts';

/**
 * Evaluasi 4 mingguan: arah BERAT × PINGGANG × KEKUATAN → satu rekomendasi.
 *
 * Kenapa tiga sumbu dan bukan berat saja: berat naik bisa berarti otot
 * bertambah atau lemak bertambah, dan timbangan tidak bisa membedakannya sama
 * sekali. Pinggang memberi tahu ke mana massanya pergi, kekuatan memberi tahu
 * apakah latihannya masih menghasilkan. Baru ketiganya bersama-sama menjawab
 * pertanyaan yang sebenarnya: apakah empat pekan ini berjalan seperti yang
 * direncanakan.
 *
 * Empat pekan dipilih karena lebih pendek dari itu didominasi kebisingan:
 * rata-rata 7 hari masih bergoyang antarpekan, dan satu pengukuran pinggang
 * yang meleset 1 cm bisa membalik kesimpulan dua pekan.
 *
 * Hasilnya SELALU deskriptif, tidak pernah menghakimi, dan tidak pernah
 * menyentuh dosis obat — itu batas yang ditetapkan PRD untuk seluruh keluaran
 * coach.
 */

/** Panjang periode evaluasi, dalam pekan. */
export const PEKAN_EVALUASI = 4;

export function evaluasi4Mingguan(input: InputEvaluasi): HasilEvaluasi {
  const keyakinan = nilaiKeyakinan(input);

  // Tanpa arah berat, dua sumbu sisanya tidak bisa ditafsirkan: pinggang turun
  // berarti hal berbeda saat berat naik dan saat berat turun.
  if (input.arahBerat === 'belum jelas') {
    return {
      kode: 'data-kurang',
      judul: 'Belum bisa dinilai',
      ringkas: `Arah berat belum terbaca dari ${input.pekanData} pekan data yang ada.`,
      rekomendasi:
        'Timbang tiap pagi sampai genap empat pekan. Tanpa arah berat, pinggang dan kekuatan tidak bisa ditafsirkan — pinggang turun berarti hal yang berbeda saat berat naik dan saat berat turun.',
      penentu: 'Data berat belum cukup',
      keyakinan: 'rendah',
    };
  }

  const hasil =
    input.fase === 'Lean Gain'
      ? evaluasiLeanGain(input)
      : input.fase === 'Cut'
        ? evaluasiCut(input)
        : evaluasiMaintenance(input);

  return { ...hasil, keyakinan };
}

type Inti = Omit<HasilEvaluasi, 'keyakinan'>;

function evaluasiLeanGain(i: InputEvaluasi): Inti {
  if (i.arahBerat === 'turun') {
    return {
      kode: 'lg-belum-surplus',
      judul: 'Belum ada surplus',
      ringkas: 'Fase Lean Gain, tapi berat justru turun selama empat pekan.',
      rekomendasi:
        'Naikkan target kalori sekitar 150–200 kkal per hari dan ukur ulang setelah dua pekan. Kalau asupan tercatat sudah di atas target, kemungkinan besar pencatatannya yang kurang lengkap, bukan targetnya yang salah.',
      penentu: 'Berat turun saat fase menargetkan naik',
    };
  }

  if (i.arahBerat === 'datar') {
    if (i.arahKekuatan === 'naik') {
      return {
        kode: 'lg-rekomposisi',
        judul: 'Rekomposisi, bukan stagnasi',
        ringkas: 'Berat datar tapi kekuatan naik — massanya bertukar, bukan diam.',
        rekomendasi:
          'Ini hasil yang baik meski timbangan tidak bergerak. Pertahankan asupan dan latihan seperti sekarang; kalau memang ingin menambah massa lebih cepat, naikkan kalori perlahan sambil terus mengawasi pinggang.',
        penentu: 'Kekuatan naik sementara berat datar',
      };
    }
    return {
      kode: 'lg-stagnan',
      judul: 'Belum bergerak',
      ringkas: 'Berat datar dan kekuatan belum naik selama empat pekan.',
      rekomendasi:
        'Naikkan target kalori sekitar 150 kkal per hari. Periksa juga apakah beban latihan memang bertambah — surplus tanpa tambahan beban cenderung berakhir sebagai lemak.',
      penentu: 'Berat dan kekuatan sama-sama datar',
    };
  }

  // Berat naik — yang menentukan sekarang ke mana massanya pergi.
  if (i.arahPinggang === 'naik') {
    if (i.arahKekuatan === 'naik') {
      return {
        kode: 'lg-naik-campur',
        judul: 'Naik, sebagian lemak',
        ringkas: 'Berat dan kekuatan naik, tapi pinggang ikut naik.',
        rekomendasi:
          'Surplusnya berjalan, hanya terlalu besar. Turunkan sekitar 100–150 kkal per hari dan ukur ulang dua pekan lagi — laju yang lebih pelan menjaga proporsi otot terhadap lemak tetap lebih baik.',
        penentu: 'Pinggang ikut naik bersama berat',
      };
    }
    return {
      kode: 'lg-lemak-dominan',
      judul: 'Kenaikan didominasi lemak',
      ringkas: 'Pinggang naik sementara kekuatan tidak bertambah.',
      rekomendasi:
        'Turunkan ke Maintenance dulu dan periksa program latihannya: surplus hanya menghasilkan otot kalau bebannya memang naik. Beralih ke Cut sekarang juga pilihan yang sah bila pinggang sudah mendekati batas Anda.',
      penentu: 'Pinggang naik tanpa kenaikan kekuatan',
    };
  }

  if (i.arahKekuatan === 'naik') {
    return {
      kode: 'lg-bersih',
      judul: 'Lean gain berjalan bersih',
      ringkas: 'Berat dan kekuatan naik, pinggang tidak ikut.',
      rekomendasi:
        'Ini hasil terbaik yang bisa diharapkan dari empat pekan Lean Gain. Jangan ubah apa pun; teruskan target dan program yang sama, dan evaluasi lagi empat pekan berikutnya.',
      penentu: 'Berat & kekuatan naik tanpa pinggang naik',
    };
  }

  return {
    kode: 'lg-naik-tanpa-kekuatan',
    judul: 'Berat naik, kekuatan belum',
    ringkas: 'Pinggang aman, tapi kekuatan belum ikut bergerak.',
    rekomendasi:
      'Pertahankan asupan dan fokuskan perhatian ke latihan: tambahkan beban atau repetisi secara bertahap. Empat pekan tanpa kenaikan kekuatan biasanya soal program, bukan soal kalori.',
    penentu: 'Kekuatan belum naik meski berat naik',
  };
}

function evaluasiCut(i: InputEvaluasi): Inti {
  if (i.arahBerat === 'naik') {
    return {
      kode: 'cut-belum-defisit',
      judul: 'Belum ada defisit',
      ringkas: 'Fase Cut, tapi berat naik selama empat pekan.',
      rekomendasi:
        'Periksa kelengkapan pencatatan lebih dulu — minyak masak dan kudapan yang terlewat gampang menambah 200–300 kkal sehari. Kalau catatannya sudah lengkap, turunkan target sekitar 200 kkal per hari.',
      penentu: 'Berat naik saat fase menargetkan turun',
    };
  }

  if (i.arahBerat === 'datar') {
    return {
      kode: 'cut-defisit-tipis',
      judul: 'Defisitnya terlalu tipis',
      ringkas: 'Berat tidak bergerak selama empat pekan Cut.',
      rekomendasi:
        'Turunkan target sekitar 150–200 kkal per hari, atau tambah aktivitas harian di luar latihan. Protein tetap dipertahankan — ia yang menjaga otot selama defisit.',
      penentu: 'Berat datar selama fase Cut',
    };
  }

  if (i.arahKekuatan === 'turun') {
    return {
      kode: 'cut-terlalu-agresif',
      judul: 'Defisitnya terlalu dalam',
      ringkas: 'Berat turun, tapi kekuatan ikut turun.',
      rekomendasi:
        'Kurangi defisitnya sekitar 150 kkal per hari dan pastikan protein mencapai target. Kekuatan yang turun selama Cut adalah tanda paling awal bahwa yang hilang bukan hanya lemak.',
      penentu: 'Kekuatan turun bersama berat',
    };
  }

  if (i.arahPinggang === 'turun') {
    return {
      kode: 'cut-berjalan',
      judul: 'Cut berjalan seperti seharusnya',
      ringkas: 'Berat dan pinggang turun, kekuatan bertahan.',
      rekomendasi:
        'Jangan ubah apa pun. Teruskan target dan program yang sama, dan evaluasi lagi empat pekan berikutnya.',
      penentu: 'Berat & pinggang turun, kekuatan bertahan',
    };
  }

  return {
    kode: 'cut-pinggang-belum-ikut',
    judul: 'Berat turun, pinggang belum',
    ringkas: 'Berat turun tapi pinggang belum ikut mengecil.',
    rekomendasi:
      'Empat pekan masih pendek untuk pinggang; teruskan dulu dan periksa apakah titik ukurnya konsisten. Kalau dua evaluasi berturut-turut menunjukkan pola yang sama, yang hilang mungkin lebih banyak air dan glikogen ketimbang lemak.',
    penentu: 'Pinggang belum mengikuti berat',
  };
}

function evaluasiMaintenance(i: InputEvaluasi): Inti {
  if (i.arahBerat === 'naik') {
    return {
      kode: 'mt-melayang-naik',
      judul: 'Melayang naik',
      ringkas: 'Fase Maintenance, tapi berat naik selama empat pekan.',
      rekomendasi:
        'Turunkan target sekitar 100 kkal per hari. Maintenance yang melayang naik biasanya bukan keputusan, melainkan target yang belum disesuaikan setelah berat berubah.',
      penentu: 'Berat naik saat fase menargetkan datar',
    };
  }

  if (i.arahBerat === 'turun') {
    return {
      kode: 'mt-melayang-turun',
      judul: 'Melayang turun',
      ringkas: 'Fase Maintenance, tapi berat turun selama empat pekan.',
      rekomendasi:
        'Naikkan target sekitar 100 kkal per hari, kecuali penurunan ini memang Anda inginkan — dalam hal itu fase yang perlu diganti, bukan targetnya.',
      penentu: 'Berat turun saat fase menargetkan datar',
    };
  }

  if (i.arahPinggang === 'turun' && i.arahKekuatan === 'naik') {
    return {
      kode: 'mt-rekomposisi',
      judul: 'Rekomposisi sedang terjadi',
      ringkas: 'Berat datar, pinggang mengecil, kekuatan naik.',
      rekomendasi:
        'Ini keadaan terbaik yang bisa dicapai tanpa mengubah berat sama sekali. Jangan ubah apa pun, dan jangan tergoda membaca timbangan yang diam sebagai tidak ada kemajuan.',
      penentu: 'Pinggang turun & kekuatan naik pada berat datar',
    };
  }

  if (i.arahKekuatan === 'turun') {
    return {
      kode: 'mt-kekuatan-turun',
      judul: 'Berat stabil, kekuatan turun',
      ringkas: 'Beratnya terjaga tapi kekuatan menurun.',
      rekomendasi:
        'Periksa protein, tidur, dan konsistensi latihan lebih dulu — ketiganya lebih sering jadi sebab daripada kalori saat berat sendiri tidak berubah.',
      penentu: 'Kekuatan turun pada berat datar',
    };
  }

  return {
    kode: 'mt-stabil',
    judul: 'Stabil',
    ringkas: 'Berat, pinggang, dan kekuatan sama-sama bertahan.',
    rekomendasi:
      'Maintenance berjalan sesuai maksudnya. Kalau Anda ingin bergerak lagi, inilah saat yang tepat memilih fase berikutnya secara sadar.',
    penentu: 'Ketiga sumbu bertahan',
  };
}

/**
 * Keyakinan turun bila datanya kurang dari empat pekan ATAU ada sumbu yang
 * arahnya belum terbaca. Keduanya melemahkan kesimpulan dengan cara berbeda,
 * jadi keduanya ikut dihitung.
 */
function nilaiKeyakinan(i: InputEvaluasi): HasilEvaluasi['keyakinan'] {
  const belumJelas = [i.arahBerat, i.arahPinggang, i.arahKekuatan].filter(
    (a: ArahMetrik) => a === 'belum jelas',
  ).length;

  if (i.pekanData >= PEKAN_EVALUASI && belumJelas === 0) return 'tinggi';
  if (i.pekanData >= PEKAN_EVALUASI - 1 && belumJelas <= 1) return 'sedang';
  return 'rendah';
}
