import { arahKekuatan, evaluasi4Mingguan, judulPercakapan, periksaBatasMedis, ringkasArahKekuatan } from '@recomp/logika';
import { mockSesiLatihan } from './latihan';

/**
 * Sumbu kekuatan diturunkan dari sesi tiruan yang SAMA dengan layar Latihan,
 * bukan ditulis tangan: angka "x dari y gerakan naik" di evaluasi dan jawaban
 * Coach harus sama dengan kartu Arah kekuatan.
 */
const KEKUATAN = ringkasArahKekuatan(arahKekuatan(mockSesiLatihan()));
import type { PenolakanMedis } from '@recomp/logika';
import type {
  Percakapan,
  PesanCoach,
  RujukanData,
  WidgetCoach,
} from '@/types/domain';

/**
 * Percakapan tiruan AI Coach.
 *
 * Isinya sengaja memperlihatkan aturan main coach yang ditetapkan PRD, bukan
 * sekadar basa-basi: jawabannya memakai RATA-RATA 7 HARI (bukan berat hari
 * ini), menyebut angka mana yang estimasi, dan tidak pernah menyentuh dosis
 * obat. Layout yang diuji dengan jawaban pendek "Halo!" akan terlihat baik-baik
 * saja sampai jawaban aslinya datang dengan lima kalimat dan tiga angka.
 */
export const mockPercakapan: PesanCoach[] = [
  {
    // Dibuat coach sendiri Senin pagi, sebelum pengguna bertanya apa pun.
    id: 'm0',
    peran: 'coach',
    teks: '',
    waktu: '2026-09-22T06:00:00+07:00',
    ringkasan: {
      periode: { dari: '2026-09-15', sampai: '2026-09-21' },
      poin: [
        {
          label: 'Rata-rata berat',
          nilai: '74,4 kg',
          delta: '+0,3 kg dari pekan lalu',
          arah: 'sesuai',
          sumber: 'manual',
        },
        {
          label: 'Rata-rata asupan',
          nilai: '2.910 kkal',
          delta: '+60 kkal dari target',
          arah: 'netral',
          sumber: 'estimasi',
        },
        {
          label: 'Protein harian',
          nilai: '168 g',
          delta: '−12 g dari target',
          arah: 'berlawanan',
          sumber: 'estimasi',
        },
        {
          label: 'Pinggang',
          nilai: '85,2 cm',
          delta: '+0,4 cm',
          arah: 'berlawanan',
          sumber: 'manual',
        },
      ],
      bacaan:
        'Laju berat Anda pas di tengah koridor Lean Gain, dan asupan hanya 60 kkal di atas ' +
        'target — pekan yang berjalan sesuai rencana.\n\nDua hal yang pantas diawasi: protein ' +
        'kurang 12 g sehari, dan pinggang naik 0,4 cm — lebih cepat dari tiga pekan sebelumnya. ' +
        'Kalau laju pinggang bertahan, batas 86,0 cm tercapai sekitar dua pekan lagi.',
      lanjutan: [
        'Kenapa pinggang naik lebih cepat pekan ini?',
        'Bagaimana cara menutup kekurangan protein?',
      ],
    },
  },
  {
    // Jatuh di hari yang sama karena 22 September sekaligus batas empat pekan.
    id: 'm0b',
    peran: 'coach',
    teks: '',
    waktu: '2026-09-22T06:01:00+07:00',
    evaluasi: {
      periode: { dari: '2026-08-25', sampai: '2026-09-21' },
      sumbu: [
        { label: 'Berat', nilai: '+1,1 kg rata-rata 7 hari', arah: 'naik', sumber: 'manual' },
        { label: 'Pinggang', nilai: '+0,9 cm', arah: 'naik', sumber: 'manual' },
        { label: 'Kekuatan', nilai: KEKUATAN.teks, arah: KEKUATAN.arah, sumber: 'sinkron' },
      ],
      hasil: evaluasi4Mingguan({
        fase: 'Lean Gain',
        arahBerat: 'naik',
        arahPinggang: 'naik',
        arahKekuatan: KEKUATAN.arah,
        pekanData: 4,
      }),
    },
  },
  {
    id: 'm1',
    peran: 'pengguna',
    teks: 'Berat saya naik 0,5 kg dari kemarin. Apa saya kebanyakan makan?',
    waktu: '2026-09-22T07:14:00+07:00',
    status: 'terkirim',
  },
  {
    id: 'm2',
    peran: 'coach',
    teks:
      'Belum tentu, dan angka harian memang bukan tempat menjawabnya. Rata-rata 7 hari Anda ' +
      '74,5 kg, naik 0,3 kg dari rata-rata pekan sebelumnya — itu laju yang persis diharapkan ' +
      'saat Lean Gain.\n\nSelisih 0,5 kg dalam semalam hampir selalu air, garam, dan isi usus; ' +
      'tubuh tidak bisa menambah setengah kilo jaringan dalam sehari tanpa surplus sekitar 3.850 ' +
      'kkal. Asupan Anda kemarin 2.980 kkal terhadap target 2.850.',
    waktu: '2026-09-22T07:14:12+07:00',
    widget: [
      {
        jenis: 'angka',
        fungsi: 'ambil_rata_rata_7_hari',
        label: 'Rata-rata berat 7 hari',
        nilai: '74,5',
        unit: 'kg',
        delta: '+0,3 kg terhadap pekan lalu',
        arahDelta: 'sesuai',
        keterangan: 'Koridor Lean Gain: +0,19 sampai +0,37 kg per pekan.',
        sumber: 'manual',
        deret: [74.0, 74.1, 74.2, 74.3, 74.35, 74.4, 74.5],
      },
    ],
    rujukan: [
      {
        label: 'Rata-rata berat 7 hari',
        nilai: '74,5 kg',
        jenis: 'manual',
        dasar: '7 timbangan pagi, 16–22 September',
      },
      {
        label: 'Berat pagi kemarin',
        nilai: '74,8 kg',
        jenis: 'manual',
        dasar: 'dicatat sendiri',
      },
      {
        label: 'Asupan kemarin',
        nilai: '2.980 kkal',
        jenis: 'estimasi',
        dasar: '3 dari 6 entri dari foto AI',
      },
    ],
  },
  {
    id: 'm3',
    peran: 'pengguna',
    teks: 'Body fat saya sekarang berapa?',
    waktu: '2026-09-22T07:16:00+07:00',
    status: 'terkirim',
  },
  {
    id: 'm4',
    peran: 'coach',
    teks:
      'Estimasi metode Navy Anda 16,5%, dengan rentang wajar 12,5–20,5%. Itu ESTIMASI dari ' +
      'lingkar pinggang, leher, dan tinggi badan — bukan lemak yang diukur langsung, jadi jangan ' +
      'dipakai sebagai target.\n\nYang lebih bisa dipercaya arahnya: sejak 1 September estimasinya ' +
      'naik 0,5 poin, sejalan dengan pinggang yang naik 0,9 cm. Kalau ingin angka yang bisa ' +
      'dijadikan patokan, DXA adalah satu-satunya jawabannya.',
    waktu: '2026-09-22T07:16:09+07:00',
    widget: [
      {
        jenis: 'angka',
        fungsi: 'estimasi_body_fat_navy',
        label: 'Estimasi body fat',
        nilai: '16,5',
        unit: '%',
        delta: '+0,5 poin sejak 1 September',
        arahDelta: 'berlawanan',
        keterangan: 'Rentang wajar 12,5–20,5% — galat baku metode ini ±4 poin.',
        sumber: 'estimasi',
        deret: [16.0, 16.1, 16.4, 16.5],
      },
    ],
    rujukan: [
      {
        label: 'Body fat',
        nilai: '16,5%',
        jenis: 'estimasi',
        dasar: 'rumus Navy, galat ±4 poin',
      },
      {
        label: 'Pinggang',
        nilai: '85,4 cm',
        jenis: 'manual',
        dasar: 'diukur 22 September',
      },
      { label: 'Leher', nilai: '38,7 cm', jenis: 'manual', dasar: 'diukur 22 September' },
    ],
  },
];

/** Pertanyaan pembuka; menghemat mengetik dan menunjukkan coach ini bisa apa. */
export const SARAN_PERTANYAAN = [
  'Laju saya wajar tidak minggu ini?',
  'Kenapa pinggang naik padahal berat datar?',
  'Sisa kalori saya hari ini berapa?',
  'Evaluasi 4 minggu terakhir saya',
];

/**
 * Bentuk balasan coach: TEKS beserta angka-angka yang dipakainya.
 *
 * Kontrak inilah yang diasumsikan ke backend. Asal angka dikirim sebagai data
 * terpisah, bukan dititipkan ke dalam kalimat, supaya penandanya dipasang app
 * dan tidak bergantung pada model yang ingat menulis "estimasi".
 */
export type BalasanCoach = {
  teks: string;
  rujukan: RujukanData[];
  /** Kartu angka yang diminta coach lewat function calling. */
  widget: WidgetCoach[];
  /**
   * Terisi bila pertanyaannya melewati batas medis. Pemeriksaannya terjadi di
   * KLIEN sebelum apa pun dikirim, jadi penolakannya pasti dan pertanyaan
   * kesehatan yang sensitif tidak perlu meninggalkan perangkat.
   */
  penolakan?: PenolakanMedis;
};

/**
 * Balasan tiruan. Jeda sengaja dibuat 900 ms supaya keadaan "sedang mengetik"
 * benar-benar terlihat dan bisa diuji — bukan berkedip lalu hilang.
 */
export function balasCoachStub(pertanyaan: string): Promise<BalasanCoach> {
  // Batas medis diperiksa lebih dulu, sebelum pertanyaannya sampai ke penyusun
  // balasan mana pun — termasuk sebelum ia akan dikirim ke server nanti.
  const penolakan = periksaBatasMedis(pertanyaan);
  if (penolakan) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ teks: '', rujukan: [], widget: [], penolakan }), 400);
    });
  }

  return new Promise((resolve) => {
    setTimeout(() => resolve(susunBalasan(pertanyaan)), 900);
  });
}

/** Balasan gagal, untuk menguji jalur "coba lagi" tanpa menunggu jaringan nyata. */
export function gagalCoachStub(): Promise<BalasanCoach> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('stub gagal')), 600);
  });
}

function susunBalasan(pertanyaan: string): BalasanCoach {
  const t = pertanyaan.toLowerCase();

  if (t.includes('laju') || t.includes('wajar')) {
    return teksDanRujukan(
      'Rata-rata 7 hari Anda 74,5 kg, naik 0,3 kg terhadap pekan sebelumnya. Koridor Lean Gain ' +
      'untuk berat Anda adalah +0,19 sampai +0,37 kg per pekan, jadi Anda berada di dalamnya.\n\n' +
      'Yang perlu diawasi justru pinggang: +0,3 cm per pekan, dan batas yang Anda tetapkan tinggal ' +
      '0,6 cm lagi.',
      [
        {
          label: 'Rata-rata berat 7 hari',
          nilai: '74,5 kg',
          jenis: 'manual',
          dasar: '7 timbangan pagi',
        },
        {
          label: 'Laju pinggang',
          nilai: '+0,3 cm/pekan',
          jenis: 'manual',
          dasar: '4 pencatatan mingguan',
        },
      ],
      [
        {
          jenis: 'angka',
          fungsi: 'ambil_rata_rata_7_hari',
          label: 'Rata-rata berat 7 hari',
          nilai: '74,5',
          unit: 'kg',
          delta: '+0,3 kg terhadap pekan lalu',
          arahDelta: 'sesuai',
          keterangan: 'Koridor Lean Gain: +0,19 sampai +0,37 kg per pekan.',
          sumber: 'manual',
          deret: [74.0, 74.1, 74.2, 74.3, 74.35, 74.4, 74.5],
        },
      ],
    );
  }

  if (t.includes('pinggang')) {
    return teksDanRujukan(
      'Berat datar dengan pinggang naik biasanya berarti komposisinya bergeser, bukan massanya. ' +
      'Tapi hati-hati menyimpulkan dari satu pengukuran: selisih 1 cm bisa datang dari meteran ' +
      'yang bergeser sesentimeter.\n\nDeret Anda naik konsisten tiga pekan berturut-turut, jadi ' +
      'kali ini kemungkinan besar nyata, bukan galat ukur.',
      [
        {
          label: 'Pinggang',
          nilai: '85,4 cm',
          jenis: 'manual',
          dasar: 'naik 3 pekan berturut-turut',
        },
        {
          label: 'Rata-rata berat 7 hari',
          nilai: '74,5 kg',
          jenis: 'manual',
          dasar: '7 timbangan pagi',
        },
      ],
      [
        {
          jenis: 'angka',
          fungsi: 'ambil_deret_ukuran',
          label: 'Pinggang',
          nilai: '85,4',
          unit: 'cm',
          delta: '+0,9 cm sejak 1 September',
          arahDelta: 'berlawanan',
          keterangan: 'Batas yang Anda tetapkan 86,0 cm.',
          sumber: 'manual',
          deret: [84.5, 84.8, 85.2, 85.4],
        },
      ],
    );
  }

  if (t.includes('kalori') || t.includes('sisa')) {
    return teksDanRujukan(
      'Hari ini tipe hari Anda Angkat Beban dengan target 2.850 kkal. Terpakai 1.980 kkal, jadi ' +
      'sisa 870 kkal dan 52 g protein.\n\nJatah pekan ini masih 1.120 kkal untuk dua hari ' +
      'tersisa — cukup longgar.',
      [
        {
          label: 'Terpakai hari ini',
          nilai: '1.980 kkal',
          jenis: 'estimasi',
          dasar: 'sebagian entri dari foto AI',
        },
        {
          label: 'Target hari ini',
          nilai: '2.850 kkal',
          jenis: 'manual',
          dasar: 'tipe hari Angkat Beban',
        },
      ],
      [
        {
          jenis: 'angka',
          fungsi: 'ambil_ringkasan_sisa_harian',
          label: 'Sisa kalori hari ini',
          nilai: '870',
          unit: 'kkal',
          keterangan: 'Dari target 2.850 kkal untuk tipe hari Angkat Beban.',
          sumber: 'estimasi',
        },
        {
          jenis: 'makro',
          fungsi: 'ambil_ringkasan_harian',
          label: 'Makro hari ini',
          sumber: 'estimasi',
          baris: [
            { nama: 'Kalori', terpakai: 1980, target: 2850, kunci: 'kalori' },
            { nama: 'Protein', terpakai: 128, target: 180, kunci: 'protein' },
            { nama: 'Lemak', terpakai: 62, target: 85, kunci: 'lemak' },
            { nama: 'Sat fat', terpakai: 17, target: 25, kunci: 'satFat' },
          ],
        },
      ],
    );
  }

  if (t.includes('evaluasi') || t.includes('4 minggu') || t.includes('empat')) {
    return teksDanRujukan(
      `Empat pekan terakhir: berat rata-rata +1,1 kg, pinggang +0,9 cm, dan kekuatan: ${KEKUATAN.teks}.` +
      '\n\nArah berat dan kekuatan sesuai Lean Gain, tapi pinggang ikut naik lebih cepat dari yang ' +
      'biasanya diinginkan. Kartu evaluasi lengkapnya terkirim di percakapan ini pada 22 September.',
      [
        {
          label: 'Perubahan rata-rata berat',
          nilai: '+1,1 kg',
          jenis: 'manual',
          dasar: '4 pekan timbangan pagi',
        },
        {
          label: 'Perubahan pinggang',
          nilai: '+0,9 cm',
          jenis: 'manual',
          dasar: '4 pencatatan mingguan',
        },
        {
          label: 'Kekuatan',
          nilai: KEKUATAN.teks,
          jenis: 'sinkron',
          dasar: 'ditarik dari Hevy',
        },
      ],
    );
  }

  return teksDanRujukan(
    'Saya membaca data Anda sampai hari ini: rata-rata 7 hari 74,5 kg, fase Lean Gain, dan ' +
    'estimasi body fat 16,5% (Navy — estimasi, bukan pengukuran).\n\nCoba tanyakan lebih spesifik, ' +
    'misalnya soal laju mingguan, ukuran tubuh, atau sisa kalori hari ini.',
    [
      {
        label: 'Rata-rata berat 7 hari',
        nilai: '74,5 kg',
        jenis: 'manual',
        dasar: '7 timbangan pagi',
      },
      { label: 'Body fat', nilai: '16,5%', jenis: 'estimasi', dasar: 'rumus Navy, ±4 poin' },
    ],
  );
}

function teksDanRujukan(
  teks: string,
  rujukan: RujukanData[],
  widget: WidgetCoach[] = [],
): BalasanCoach {
  return { teks, rujukan, widget };
}

/** Percakapan lama, untuk menguji daftar riwayat dan pemisah tanggal. */
const percakapanLama: PesanCoach[][] = [
  [
    {
      id: 'l1',
      peran: 'pengguna',
      teks: 'Kenapa berat saya naik padahal kalori sudah defisit dua minggu?',
      waktu: '2026-09-15T09:02:00+07:00',
      status: 'terkirim',
    },
    {
      id: 'l2',
      peran: 'coach',
      teks:
        'Dua pekan itu belum tentu cukup untuk terbaca. Rata-rata 7 hari Anda saat itu 74,0 kg, ' +
        'naik 0,1 kg — masih di dalam rentang goyangan air, bukan sinyal.\n\nYang lebih sering ' +
        'jadi penyebabnya: asupan tercatat lebih rendah dari asupan sebenarnya. Minyak masak dan ' +
        'kudapan yang tidak dicatat gampang menambah 200–300 kkal sehari tanpa terasa.',
      waktu: '2026-09-15T09:02:11+07:00',
      rujukan: [
        {
          label: 'Rata-rata berat 7 hari',
          nilai: '74,0 kg',
          jenis: 'manual',
          dasar: '6 timbangan, 9–15 September',
        },
      ],
    },
  ],
  [
    {
      id: 'k1',
      peran: 'pengguna',
      teks: 'Protein saya cukup belum?',
      waktu: '2026-09-21T20:41:00+07:00',
      status: 'terkirim',
    },
    {
      id: 'k2',
      peran: 'coach',
      teks:
        'Rata-rata tujuh hari terakhir 168 g per hari terhadap target 180 g — jadi kurang sekitar ' +
        '12 g sehari.\n\nSaat Lean Gain kekurangan sebesar itu tidak menggagalkan apa pun, tapi ' +
        'protein adalah satu-satunya makro yang TIDAK pernah dipotong saat redistribusi budget. ' +
        'Kalau ingin ditutup, satu porsi yoghurt atau dua butir telur sudah cukup.',
      waktu: '2026-09-21T20:41:08+07:00',
      rujukan: [
        {
          label: 'Protein rata-rata 7 hari',
          nilai: '168 g',
          jenis: 'estimasi',
          dasar: 'sebagian entri dari foto AI',
        },
        { label: 'Target protein', nilai: '180 g', jenis: 'manual', dasar: 'target tipe hari' },
      ],
    },
  ],
];

/** Riwayat percakapan tiruan, urut lama → baru. */
export const mockRiwayatPercakapan: Percakapan[] = [
  ...percakapanLama.map((pesan, i) => ({
    id: `p-lama-${i + 1}`,
    judul: judulPercakapan(pesan),
    diperbaruiPada: pesan[pesan.length - 1].waktu,
    pesan,
  })),
  {
    id: 'p-aktif',
    judul: judulPercakapan(mockPercakapan),
    diperbaruiPada: mockPercakapan[mockPercakapan.length - 1].waktu,
    pesan: mockPercakapan,
  },
];
