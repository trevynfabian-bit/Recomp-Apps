import type {
  EntriBeratRingkas,
  Fase,
  KecocokanFase,
  RataRata7Hari,
  SinyalArah,
  TitikTren,
} from './tipe';

/**
 * Perhitungan tren berat. Tinggal di paket bersama karena web dashboard
 * menampilkan grafik yang sama, dan AI coach mengambil angkanya lewat function
 * calling alih-alih menghitung sendiri.
 *
 * Prinsipnya satu: JANGAN percaya angka harian. Berat harian bergoyang karena
 * air, garam, dan isi usus; yang bermakna adalah rata-rata bergeraknya.
 */

/** Panjang jendela rata-rata bergerak, dalam hari. */
export const JENDELA_HARI = 7;

/**
 * Rata-rata bergerak 7 hari untuk satu tanggal.
 *
 * Hari tanpa timbangan DILEWATI, bukan dihitung nol — menghitungnya nol akan
 * menarik rata-rata turun secara palsu dan membuat orang mengira sedang kurus.
 * `jumlahTimbangan` ikut dikembalikan supaya UI bisa jujur soal seberapa tipis
 * datanya.
 */
export function rataRata7Hari(
  riwayat: EntriBeratRingkas[],
  sampaiTanggal: string,
): RataRata7Hari {
  const awal = mundurHari(sampaiTanggal, JENDELA_HARI - 1);
  const dalamJendela = riwayat.filter(
    (r) => r.tanggal >= awal && r.tanggal <= sampaiTanggal && r.berat_pagi_kg !== null,
  );

  if (dalamJendela.length === 0) {
    return { tanggal: sampaiTanggal, rataRataKg: null, jumlahTimbangan: 0 };
  }

  const total = dalamJendela.reduce((n, r) => n + (r.berat_pagi_kg as number), 0);
  return {
    tanggal: sampaiTanggal,
    rataRataKg: bulatkan(total / dalamJendela.length, 2),
    jumlahTimbangan: dalamJendela.length,
  };
}

/**
 * Deret rata-rata bergerak untuk digambar sebagai garis.
 * Satu titik per tanggal pada rentang, termasuk tanggal tanpa timbangan
 * (rata-ratanya tetap ada selama jendelanya berisi).
 */
export function deretTren(
  riwayat: EntriBeratRingkas[],
  dariTanggal: string,
  sampaiTanggal: string,
): TitikTren[] {
  const titik: TitikTren[] = [];
  for (let t = dariTanggal; t <= sampaiTanggal; t = majuHari(t, 1)) {
    const rr = rataRata7Hari(riwayat, t);
    const harian = riwayat.find((r) => r.tanggal === t)?.berat_pagi_kg ?? null;
    titik.push({ tanggal: t, rataRataKg: rr.rataRataKg, beratHarianKg: harian });
  }
  return titik;
}

/**
 * Arah berat sepekan terakhir: membandingkan rata-rata hari ini dengan
 * rata-rata 7 hari sebelumnya — rata-rata vs rata-rata, bukan angka harian vs
 * angka harian, supaya satu hari yang aneh tidak mengubah kesimpulan.
 *
 * Ambang 0,2 kg/minggu dipakai sebagai "datar": di bawah itu perubahannya
 * masih dalam rentang goyangan air, bukan sinyal.
 */
export function sinyalArah(
  riwayat: EntriBeratRingkas[],
  sampaiTanggal: string,
  ambangKg = 0.2,
): SinyalArah {
  const sekarang = rataRata7Hari(riwayat, sampaiTanggal);
  const sepekanLalu = rataRata7Hari(riwayat, mundurHari(sampaiTanggal, JENDELA_HARI));

  if (sekarang.rataRataKg === null || sepekanLalu.rataRataKg === null) {
    return { arah: 'belum cukup data', perubahanKg: null, ambangKg };
  }

  const perubahan = bulatkan(sekarang.rataRataKg - sepekanLalu.rataRataKg, 2);
  if (Math.abs(perubahan) < ambangKg) {
    return { arah: 'datar', perubahanKg: perubahan, ambangKg };
  }
  return { arah: perubahan > 0 ? 'naik' : 'turun', perubahanKg: perubahan, ambangKg };
}

/** Geser tanggal `YYYY-MM-DD` mundur sekian hari, tanpa tergeser zona waktu. */
export function mundurHari(tanggal: string, hari: number): string {
  return majuHari(tanggal, -hari);
}

/** Geser tanggal `YYYY-MM-DD` maju sekian hari, tanpa tergeser zona waktu. */
export function majuHari(tanggal: string, hari: number): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  // UTC dipakai sengaja: tanggalnya sudah dinormalisasi ke Asia/Jakarta, jadi
  // aritmetika di UTC tidak akan menggesernya sehari karena zona perangkat.
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + hari);
  return t.toISOString().slice(0, 10);
}

function bulatkan(nilai: number, desimal: number): number {
  const f = 10 ** desimal;
  return Math.round(nilai * f) / f;
}

/**
 * Apakah arah berat SESUAI dengan yang diharapkan fase saat ini.
 *
 * Arah saja tidak bermakna: naik 0,4 kg/minggu itu persis yang diinginkan saat
 * Lean Gain, dan persis yang tidak diinginkan saat Cut. Tanpa konteks fase,
 * label "naik" memaksa pengguna menafsirkan sendiri — dan itu tempat orang
 * salah menyimpulkan.
 *
 * Hasilnya tetap deskriptif, bukan penilaian: `berlawanan` berarti arahnya
 * tidak sejalan dengan rencana, bukan bahwa penggunanya gagal.
 */
export function arahSesuaiFase(arah: SinyalArah['arah'], fase: Fase): KecocokanFase {
  if (arah === 'belum cukup data') return 'belum bisa dinilai';

  // Maintenance memang menargetkan datar; naik atau turun sama-sama menyimpang.
  if (fase === 'Maintenance') return arah === 'datar' ? 'sesuai' : 'berlawanan';

  const diharapkan = fase === 'Lean Gain' ? 'naik' : 'turun';
  if (arah === diharapkan) return 'sesuai';
  // Datar bukan berlawanan — ia hanya belum bergerak ke arah yang dituju.
  if (arah === 'datar') return 'belum bergerak';
  return 'berlawanan';
}
