// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
/**
 * Hasil lab: bentuk data dan ringkasan yang boleh ditampilkan.
 *
 * Hasil lab dibaca coach sebagai KONTEKS, bukan dasar diagnosis atau saran
 * dosis (lihat `batasMedis`). Karena itu app hanya menyatakan FAKTA dari
 * kertas hasilnya sendiri: nilai, satuan, dan apakah nilai itu berada di dalam
 * rentang rujukan yang dicetak laboratorium. Tidak ada "tinggi", "berbahaya",
 * atau tafsiran lain — rentangnya milik lab, bukan milik app, dan artinya
 * dibicarakan dengan dokter.
 */

export type PenandaLab = {
  /** Nama seperti tertulis di hasil, mis. "Kolesterol LDL". */
  nama: string;
  nilai: number;
  satuan: string;
  /** Rentang rujukan dari laboratorium; salah satu atau keduanya bisa kosong. */
  rujukanMin: number | null;
  rujukanMaks: number | null;
};

export type HasilLab = {
  id: string;
  /** YYYY-MM-DD, tanggal pengambilan sampel. */
  tanggal: string;
  /** Nama panel, mis. "Profil lipid". */
  nama: string;
  /** Nama laboratorium; boleh kosong. */
  laboratorium: string | null;
  penanda: PenandaLab[];
};

export type PosisiPenanda = 'dalam rentang' | 'di bawah rentang' | 'di atas rentang' | 'tanpa rujukan';

/** Posisi nilai terhadap rentang rujukan lab. Batas rentang termasuk "dalam". */
export function posisiPenanda(p: PenandaLab): PosisiPenanda {
  if (p.rujukanMin === null && p.rujukanMaks === null) return 'tanpa rujukan';
  if (p.rujukanMin !== null && p.nilai < p.rujukanMin) return 'di bawah rentang';
  if (p.rujukanMaks !== null && p.nilai > p.rujukanMaks) return 'di atas rentang';
  return 'dalam rentang';
}

export type RingkasanHasilLab = {
  jumlahPenanda: number;
  diLuarRentang: PenandaLab[];
  tanpaRujukan: number;
};

export function ringkasHasilLab(h: HasilLab): RingkasanHasilLab {
  return {
    jumlahPenanda: h.penanda.length,
    diLuarRentang: h.penanda.filter((p) => {
      const pos = posisiPenanda(p);
      return pos === 'di bawah rentang' || pos === 'di atas rentang';
    }),
    tanpaRujukan: h.penanda.filter((p) => posisiPenanda(p) === 'tanpa rujukan').length,
  };
}

/** Satu kalimat ringkasan untuk daftar; netral, menyebut rentang milik lab. */
export function kalimatRingkasanLab(r: RingkasanHasilLab): string {
  const dasar = `${r.jumlahPenanda} penanda`;
  if (r.jumlahPenanda === 0) return 'Belum ada penanda tercatat';
  if (r.diLuarRentang.length === 0) {
    return r.tanpaRujukan === r.jumlahPenanda
      ? `${dasar}, tanpa rentang rujukan dari lab`
      : `${dasar}, semuanya di dalam rentang rujukan lab`;
  }
  return `${dasar}, ${r.diLuarRentang.length} di luar rentang rujukan lab`;
}

/**
 * Riwayat dikelompokkan per tahun, terbaru lebih dulu — hasil lab jarang
 * (beberapa kali setahun), jadi tahun adalah pengelompokan yang terbaca.
 */
export function kelompokkanPerTahun(hasil: HasilLab[]): { tahun: string; hasil: HasilLab[] }[] {
  const urut = [...hasil].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));
  const kelompok: { tahun: string; hasil: HasilLab[] }[] = [];
  for (const h of urut) {
    const tahun = h.tanggal.slice(0, 4);
    const k = kelompok.find((x) => x.tahun === tahun);
    if (k) k.hasil.push(h);
    else kelompok.push({ tahun, hasil: [h] });
  }
  return kelompok;
}
