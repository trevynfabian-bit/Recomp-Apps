import type { HasilBodyFat, InputBodyFat, KomposisiTubuh } from './tipe';

/**
 * Estimasi persen lemak tubuh metode US Navy (lingkar badan).
 *
 * Kenapa metode ini: ia hanya butuh meteran kain — alat yang sudah dipakai
 * halaman ini setiap pekan — sementara DXA, BodPod, dan timbangan BIA
 * masing-masing butuh alat atau biaya yang tidak masuk akal untuk dipantau
 * mingguan.
 *
 * Harganya harus dinyatakan terang-terangan: ini ESTIMASI, bukan pengukuran.
 * Galat bakunya terhadap DXA sekitar ±4 poin persentase pada individu, jadi
 * angka 18% bisa saja 14% atau 22% pada tubuh yang sama. Yang jauh lebih bisa
 * dipercaya adalah ARAHNYA dari pekan ke pekan, karena galat yang sama ikut
 * terbawa di setiap pengukuran dan sebagian besar saling meniadakan saat
 * dibandingkan dengan diri sendiri.
 */

/**
 * Galat baku metode Navy terhadap DXA, dalam POIN PERSENTASE.
 * Dipakai untuk menampilkan rentang, bukan satu angka telanjang.
 */
export const KETIDAKPASTIAN_BF = 4;

/** Estimasi persen lemak tubuh; `persen` null bila datanya tidak cukup. */
export function estimasiBodyFatNavy(input: InputBodyFat): HasilBodyFat {
  const dasar: Omit<HasilBodyFat, 'persen' | 'rentang' | 'alasanKosong' | 'kurang'> = {
    metode: 'Navy',
    ketidakpastian: KETIDAKPASTIAN_BF,
    sensitivitasPinggang: null,
  };
  const kosong = (kurang: HasilBodyFat['kurang'], alasanKosong: string): HasilBodyFat => ({
    ...dasar,
    persen: null,
    rentang: null,
    alasanKosong,
    kurang,
  });

  // Dua kolom profil ini memang nullable di `profiles`, jadi ketidaklengkapan
  // itu keadaan normal pengguna baru — bukan kesalahan yang perlu disamarkan.
  if (input.jenisKelamin === null) {
    return kosong(
      'jenis-kelamin',
      'Rumus Navy memakai konstanta yang berbeda untuk pria dan wanita, dan jenis kelamin belum diisi di profil.',
    );
  }

  if (input.tinggiCm === null || input.tinggiCm <= 0) {
    return kosong('tinggi', 'Tinggi badan belum diisi di profil.');
  }

  // Rumus versi wanita memakai lingkar pinggul, yang belum dicatat app ini.
  // Menyodorkan rumus pria untuk semua orang akan menghasilkan angka yang
  // kelihatan sah padahal salah sistematis, jadi lebih baik berhenti di sini.
  if (input.jenisKelamin === 'wanita' && (input.pinggulCm ?? 0) <= 0) {
    return kosong(
      'pinggul',
      'Rumus Navy untuk wanita butuh lingkar pinggul, dan app ini belum mencatatnya.',
    );
  }

  const mentah = hitung(input);
  if (mentah === null) {
    return kosong(
      'ukuran',
      'Lingkar pinggang harus lebih besar dari lingkar leher agar rumus ini bisa dihitung.',
    );
  }

  // Di bawah ~3% tubuh manusia tidak bisa hidup dan di atas ~70% tidak pernah
  // terukur. Hasil di luar itu berarti salah ukur, bukan temuan — dan alasannya
  // harus disebut apa adanya, bukan disamarkan jadi keluhan soal leher.
  if (mentah < BATAS_MASUK_AKAL.bawah || mentah > BATAS_MASUK_AKAL.atas) {
    return kosong(
      'ukuran',
      `Hasilnya ${bulat(mentah, 1)}%, di luar rentang yang pernah terukur pada manusia. Periksa lagi lingkar pinggang dan leher.`,
    );
  }
  const persen = mentah;

  // Seberapa jauh estimasi bergeser bila meteran pinggang meleset 1 cm.
  // Dihitung dari angka pengguna sendiri, bukan dikutip dari rata-rata, karena
  // kepekaannya berbeda per ukuran tubuh.
  const naikSatuCm = hitung({ ...input, pinggangCm: input.pinggangCm + 1 });

  return {
    ...dasar,
    persen: bulat(persen, 1),
    rentang: {
      bawah: bulat(Math.max(persen - KETIDAKPASTIAN_BF, 0), 1),
      atas: bulat(persen + KETIDAKPASTIAN_BF, 1),
    },
    sensitivitasPinggang: naikSatuCm === null ? null : bulat(naikSatuCm - persen, 1),
    alasanKosong: null,
    kurang: null,
  };
}

/**
 * Pecah berat badan menjadi massa lemak dan massa bebas lemak.
 *
 * Inilah yang membuat rekomposisi terlihat: berat 75 kg dengan 18% lemak dan
 * 75 kg dengan 16% lemak adalah dua tubuh yang berbeda, dan timbangan tidak
 * bisa membedakannya sama sekali. Karena persennya estimasi, kedua angka di
 * sini juga estimasi — ketidakpastian ±4 poin di persen berarti sekitar ±3 kg
 * pada tubuh 75 kg.
 */
export function komposisiTubuh(persenLemak: number, beratKg: number): KomposisiTubuh {
  const lemakKg = (persenLemak / 100) * beratKg;
  return {
    lemakKg: bulat(lemakKg, 1),
    bebasLemakKg: bulat(beratKg - lemakKg, 1),
  };
}

/** Rentang persen lemak yang pernah terukur pada manusia hidup. */
const BATAS_MASUK_AKAL = { bawah: 3, atas: 70 } as const;

/**
 * Rumus Navy versi metrik. Mengembalikan null HANYA bila argumen logaritmanya
 * tidak sah (lingkar pinggang ≤ leher); kewajaran hasilnya dinilai pemanggil
 * supaya alasan penolakannya bisa dibedakan.
 */
function hitung(input: InputBodyFat): number | null {
  const { jenisKelamin, tinggiCm, pinggangCm, leherCm } = input;
  // Dipanggil hanya setelah kedua field itu lolos pemeriksaan di atas.
  if (jenisKelamin === null || tinggiCm === null) return null;

  const persen =
    jenisKelamin === 'pria'
      ? nilaiPria(pinggangCm, leherCm, tinggiCm)
      : nilaiWanita(pinggangCm, input.pinggulCm ?? 0, leherCm, tinggiCm);

  return persen !== null && Number.isFinite(persen) ? persen : null;
}

function nilaiPria(pinggangCm: number, leherCm: number, tinggiCm: number): number | null {
  const selisih = pinggangCm - leherCm;
  if (selisih <= 0) return null;
  return (
    495 / (1.0324 - 0.19077 * Math.log10(selisih) + 0.15456 * Math.log10(tinggiCm)) - 450
  );
}

function nilaiWanita(
  pinggangCm: number,
  pinggulCm: number,
  leherCm: number,
  tinggiCm: number,
): number | null {
  const selisih = pinggangCm + pinggulCm - leherCm;
  if (selisih <= 0) return null;
  return (
    495 / (1.29579 - 0.35004 * Math.log10(selisih) + 0.221 * Math.log10(tinggiCm)) - 450
  );
}

function bulat(nilai: number, desimal: number): number {
  const f = 10 ** desimal;
  return Math.round(nilai * f) / f;
}
