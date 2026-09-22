import type { PesanCoach } from '@/types/domain';

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
 * Balasan tiruan. Jeda sengaja dibuat 900 ms supaya keadaan "sedang mengetik"
 * benar-benar terlihat dan bisa diuji — bukan berkedip lalu hilang.
 */
export function balasCoachStub(pertanyaan: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(susunBalasan(pertanyaan)), 900);
  });
}

/** Balasan gagal, untuk menguji jalur "coba lagi" tanpa menunggu jaringan nyata. */
export function gagalCoachStub(): Promise<string> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('stub gagal')), 600);
  });
}

function susunBalasan(pertanyaan: string): string {
  const t = pertanyaan.toLowerCase();

  if (t.includes('laju') || t.includes('wajar')) {
    return (
      'Rata-rata 7 hari Anda 74,5 kg, naik 0,3 kg terhadap pekan sebelumnya. Koridor Lean Gain ' +
      'untuk berat Anda adalah +0,19 sampai +0,37 kg per pekan, jadi Anda berada di dalamnya.\n\n' +
      'Yang perlu diawasi justru pinggang: +0,3 cm per pekan, dan batas yang Anda tetapkan tinggal ' +
      '0,6 cm lagi.'
    );
  }

  if (t.includes('pinggang')) {
    return (
      'Berat datar dengan pinggang naik biasanya berarti komposisinya bergeser, bukan massanya. ' +
      'Tapi hati-hati menyimpulkan dari satu pengukuran: selisih 1 cm bisa datang dari meteran ' +
      'yang bergeser sesentimeter.\n\nDeret Anda naik konsisten tiga pekan berturut-turut, jadi ' +
      'kali ini kemungkinan besar nyata, bukan galat ukur.'
    );
  }

  if (t.includes('kalori') || t.includes('sisa')) {
    return (
      'Hari ini tipe hari Anda Angkat Beban dengan target 2.850 kkal. Terpakai 1.980 kkal, jadi ' +
      'sisa 870 kkal dan 52 g protein.\n\nJatah pekan ini masih 1.120 kkal untuk dua hari ' +
      'tersisa — cukup longgar.'
    );
  }

  if (t.includes('evaluasi') || t.includes('4 minggu') || t.includes('empat')) {
    return (
      'Empat pekan terakhir: berat rata-rata +1,1 kg, pinggang +0,9 cm, dan kekuatan naik di ' +
      'tiga dari empat gerakan utama.\n\nArah berat dan kekuatan sesuai Lean Gain, tapi pinggang ' +
      'ikut naik lebih cepat dari yang biasanya diinginkan. Evaluasi lengkapnya ada di layar ' +
      'Evaluasi 4 mingguan.'
    );
  }

  return (
    'Saya membaca data Anda sampai hari ini: rata-rata 7 hari 74,5 kg, fase Lean Gain, dan ' +
    'estimasi body fat 16,5% (Navy — estimasi, bukan pengukuran).\n\nCoba tanyakan lebih spesifik, ' +
    'misalnya soal laju mingguan, ukuran tubuh, atau sisa kalori hari ini.'
  );
}
