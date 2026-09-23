// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import { formatAngka, formatDesimal } from './format.ts';
import type { Fase, HasilTdee, InputTdee, MetodeTdee } from './tipe.ts';

/**
 * Estimasi TDEE dari TIGA metode, ditampilkan sebagai rentang.
 *
 * Satu angka TDEE selalu bohong: ia hasil rumus yang meleset 10-15% pada
 * individu, atau hasil data yang masih berisik. Rentang dari beberapa metode
 * jauh lebih jujur, dan tingkat keyakinan memberi tahu seberapa serius rentang
 * itu boleh dipakai.
 *
 * Urutan kepercayaannya jelas: metode berbasis DATA NYATA (asupan + perubahan
 * berat) mengalahkan rumus mana pun begitu datanya cukup, karena ia mengukur
 * tubuh orang ini, bukan rata-rata populasi.
 */

/** Energi per kg perubahan berat badan; angka lazim untuk jaringan campuran. */
export const KCAL_PER_KG = 7700;

/** Pengali aktivitas per tipe hari, dipakai metode berbasis rumus. */
export const PENGALI_AKTIVITAS: Record<string, number> = {
  Rest: 1.35,
  'Angkat Beban': 1.55,
  'Beban+Lari': 1.7,
  Padel: 1.65,
};

/** Rata-rata pengali aktivitas dari tipe hari yang benar-benar dijalani. */
export function pengaliRataRata(namaTipeHari: string[]): number {
  if (namaTipeHari.length === 0) return 1.5;
  const total = namaTipeHari.reduce((n, nama) => n + (PENGALI_AKTIVITAS[nama] ?? 1.5), 0);
  return total / namaTipeHari.length;
}

export function estimasiTdee(input: InputTdee): HasilTdee {
  const metode: MetodeTdee[] = [];
  const pengali = pengaliRataRata(input.tipeHariMinggu);

  // --- Metode 1: Mifflin-St Jeor × pengali aktivitas ------------------------
  if (input.usiaTahun !== null && input.tinggiCm !== null && input.jenisKelamin !== null) {
    const bmr =
      10 * input.beratKg +
      6.25 * input.tinggiCm -
      5 * input.usiaTahun +
      (input.jenisKelamin === 'pria' ? 5 : -161);
    metode.push({
      nama: 'Mifflin-St Jeor',
      nilai: Math.round(bmr * pengali),
      dasar: `BMR ${formatAngka(bmr)} kcal × aktivitas ${formatDesimal(pengali, 2)}`,
      berbasisData: false,
    });
  }

  // --- Metode 2: Katch-McArdle × pengali aktivitas --------------------------
  // Memakai massa tanpa lemak, jadi lebih baik daripada Mifflin bila body fat
  // diketahui — dan lebih buruk bila body fat-nya sendiri hanya tebakan.
  if (input.persenLemak !== null) {
    const lbm = input.beratKg * (1 - input.persenLemak / 100);
    const bmr = 370 + 21.6 * lbm;
    metode.push({
      nama: 'Katch-McArdle',
      nilai: Math.round(bmr * pengali),
      dasar: `massa tanpa lemak ${formatDesimal(lbm, 1)} kg × aktivitas ${formatDesimal(pengali, 2)}`,
      berbasisData: false,
    });
  }

  // --- Metode 3: dari data nyata -------------------------------------------
  // TDEE = rata-rata asupan + energi yang tersimpan/terpakai sebagai berat.
  // Ini satu-satunya metode yang mengukur tubuh orang INI.
  if (input.hariData >= 7 && input.rataAsupanKalori !== null && input.perubahanBeratKg !== null) {
    const energiBerat = (input.perubahanBeratKg * KCAL_PER_KG) / input.hariData;
    metode.push({
      nama: 'Dari data Anda',
      nilai: Math.round(input.rataAsupanKalori - energiBerat),
      dasar:
        `asupan rata-rata ${formatAngka(input.rataAsupanKalori)} kcal, berat ` +
        `${input.perubahanBeratKg >= 0 ? '+' : '−'}${formatDesimal(Math.abs(input.perubahanBeratKg), 1)} kg ` +
        `dalam ${input.hariData} hari`,
      berbasisData: true,
    });
  }

  if (metode.length === 0) {
    return {
      metode: [],
      min: null,
      maks: null,
      tengah: null,
      keyakinan: 'rendah',
      alasanKeyakinan: 'Belum ada data maupun profil yang cukup untuk menghitung TDEE.',
    };
  }

  const nilai = metode.map((m) => m.nilai);
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);

  return {
    metode,
    min,
    maks,
    tengah: Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length),
    ...tentukanKeyakinan(metode, input.hariData, maks - min),
  };
}

/**
 * Tingkat keyakinan. Dua hal menentukannya: apakah metode berbasis data ikut
 * terhitung, dan seberapa lebar rentangnya. Rentang lebar berarti metode-metode
 * itu tidak sepakat, dan itu sendiri sebuah informasi.
 */
function tentukanKeyakinan(
  metode: MetodeTdee[],
  hariData: number,
  lebar: number,
): { keyakinan: HasilTdee['keyakinan']; alasanKeyakinan: string } {
  const adaData = metode.some((m) => m.berbasisData);
  // Jangan menyebut "ketiga metode" kalau yang benar-benar terhitung hanya dua:
  // Katch-McArdle dilewati selama body fat belum diketahui.
  const sebutan = metode.length === 1 ? 'satu-satunya metode' : `${metode.length} metode`;

  if (!adaData) {
    return {
      keyakinan: 'rendah',
      alasanKeyakinan:
        'Semua angka di atas berasal dari rumus populasi, bukan dari tubuh Anda. ' +
        'Setelah 14 hari mencatat asupan dan menimbang, metode berbasis data ikut masuk.',
    };
  }

  if (hariData >= 14 && lebar <= 400) {
    return {
      keyakinan: 'tinggi',
      alasanKeyakinan: `${hariData} hari data, dan ${sebutan} yang terhitung sepakat dalam ${formatAngka(lebar)} kcal.`,
    };
  }

  if (hariData >= 14) {
    return {
      keyakinan: 'sedang',
      alasanKeyakinan: `${hariData} hari data, tapi ${sebutan} yang terhitung berselisih ${formatAngka(lebar)} kcal.`,
    };
  }

  return {
    keyakinan: 'sedang',
    alasanKeyakinan: `Baru ${hariData} hari data. Rentangnya menyempit seiring catatan bertambah.`,
  };
}

/** Saran arah target terhadap TDEE, sesuai fase. Deskriptif, bukan resep. */
export function bandingkanTargetTdee(
  targetHarian: number,
  tdeeTengah: number | null,
  fase: Fase,
): string | null {
  if (tdeeTengah === null) return null;
  const selisih = targetHarian - tdeeTengah;
  const arah = selisih > 0 ? 'di atas' : 'di bawah';
  const diharapkan =
    fase === 'Lean Gain' ? 'di atas' : fase === 'Cut' ? 'di bawah' : 'sekitar';

  if (fase === 'Maintenance') {
    return `Target hari ini ${formatAngka(Math.abs(selisih))} kcal ${arah} perkiraan TDEE — fase Maintenance memang menargetkan sekitar angka itu.`;
  }
  const cocok = arah === diharapkan;
  return (
    `Target hari ini ${formatAngka(Math.abs(selisih))} kcal ${arah} perkiraan TDEE, ` +
    `${cocok ? 'sejalan' : 'berlawanan'} dengan fase ${fase}.`
  );
}
