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

// ---------------------------------------------------------------------------
// Form tambah hasil lab.
//
// Angka dan rentang rujukan DISALIN dari kertas hasil, jadi aturannya menjaga
// salinan itu tetap utuh: angka dibaca cara Indonesia ("5,3"), tanggal boleh
// ditulis "3/9/2026", rentang tidak boleh terbalik, dan templat panel hanya
// mengisi NAMA & SATUAN penanda — tidak pernah rentang rujukan, karena rentang
// itu milik lab yang memeriksa dan berbeda antar lab.
// ---------------------------------------------------------------------------

export type IsianPenandaLab = { nama: string; nilai: string; satuan: string; rujukanMin: string; rujukanMaks: string };
export type IsianHasilLab = { nama: string; tanggal: string; laboratorium: string; penanda: IsianPenandaLab[] };

export const PENANDA_KOSONG: IsianPenandaLab = { nama: '', nilai: '', satuan: '', rujukanMin: '', rujukanMaks: '' };

/** Templat panel yang umum: nama & satuan penanda saja. */
export const TEMPLAT_PANEL_LAB: { nama: string; penanda: { nama: string; satuan: string }[] }[] = [
  {
    nama: 'Profil lipid',
    penanda: [
      { nama: 'Kolesterol total', satuan: 'mg/dL' },
      { nama: 'Kolesterol LDL', satuan: 'mg/dL' },
      { nama: 'Kolesterol HDL', satuan: 'mg/dL' },
      { nama: 'Trigliserida', satuan: 'mg/dL' },
    ],
  },
  {
    nama: 'Gula darah',
    penanda: [
      { nama: 'Glukosa puasa', satuan: 'mg/dL' },
      { nama: 'HbA1c', satuan: '%' },
    ],
  },
  {
    nama: 'Fungsi hati',
    penanda: [
      { nama: 'SGOT (AST)', satuan: 'U/L' },
      { nama: 'SGPT (ALT)', satuan: 'U/L' },
    ],
  },
  {
    nama: 'Fungsi ginjal',
    penanda: [
      { nama: 'Ureum', satuan: 'mg/dL' },
      { nama: 'Kreatinin', satuan: 'mg/dL' },
    ],
  },
];

/** Isian penanda dari templat panel: nama & satuan terisi, angka dan rentang kosong. */
export function penandaDariTemplat(namaPanel: string): IsianPenandaLab[] | null {
  const t = TEMPLAT_PANEL_LAB.find((x) => x.nama === namaPanel);
  return t ? t.penanda.map((p) => ({ ...PENANDA_KOSONG, nama: p.nama, satuan: p.satuan })) : null;
}

/** "5,3", "5.3", "245" → angka; paling banyak tiga desimal; tidak negatif. */
export function uraiNilaiLab(teks: string): number | null {
  const bersih = teks.trim().replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(bersih)) return null;
  return Number(bersih);
}

function tanggalSah(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "3/9/2026", "03-09-2026", "2026-09-03" → "2026-09-03"; null bila bukan tanggal. */
export function uraiTanggalLab(teks: string): string | null {
  const t = teks.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const id = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (id) [d, m, y] = [Number(id[1]), Number(id[2]), Number(id[3])];
  else return null;
  if (!tanggalSah(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type GalatPenandaLab = Partial<Record<keyof IsianPenandaLab | 'rentang', string>>;
export type HasilPeriksaLab =
  | { sah: true; hasil: Omit<HasilLab, 'id'> }
  | { sah: false; galat: { nama?: string; tanggal?: string; penanda?: string; perPenanda: GalatPenandaLab[] } };

/** Periksa isian form; `hariIni` (YYYY-MM-DD) untuk menolak tanggal di masa depan. */
export function periksaHasilLab(isian: IsianHasilLab, hariIni: string): HasilPeriksaLab {
  const galat: { nama?: string; tanggal?: string; penanda?: string; perPenanda: GalatPenandaLab[] } = { perPenanda: [] };
  const nama = isian.nama.trim();
  if (nama === '') galat.nama = 'Nama panel belum diisi, mis. Profil lipid.';
  else if (nama.length > 60) galat.nama = 'Nama panel paling panjang 60 huruf.';

  const tanggal = uraiTanggalLab(isian.tanggal);
  if (isian.tanggal.trim() === '') galat.tanggal = 'Tanggal pengambilan sampel belum diisi.';
  else if (tanggal === null) galat.tanggal = 'Tanggal ditulis seperti 3/9/2026.';
  else if (tanggal > hariIni) galat.tanggal = 'Tanggal pengambilan sampel tidak bisa di masa depan.';
  else if (tanggal < '2000-01-01') galat.tanggal = 'Tanggal paling awal 1/1/2000.';

  // Baris yang sepenuhnya kosong diabaikan (sisa "Tambah penanda" yang tidak dipakai).
  const terisi = isian.penanda
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Object.values(p).some((v) => v.trim() !== ''));
  if (terisi.length === 0) galat.penanda = 'Isi setidaknya satu penanda dengan nilainya.';

  const penanda: PenandaLab[] = [];
  const namaDipakai = new Set<string>();
  for (const { p, i } of terisi) {
    const g: GalatPenandaLab = {};
    const n = p.nama.trim();
    if (n === '') g.nama = 'Nama penanda belum diisi.';
    else if (namaDipakai.has(n.toLowerCase())) g.nama = `${n} sudah ada di hasil ini.`;
    namaDipakai.add(n.toLowerCase());
    const nilai = uraiNilaiLab(p.nilai);
    if (p.nilai.trim() === '') g.nilai = 'Nilai belum diisi.';
    else if (nilai === null) g.nilai = 'Nilai ditulis sebagai angka, mis. 5,3.';
    if (p.satuan.trim() === '') g.satuan = 'Satuan belum diisi, mis. mg/dL.';
    const min = p.rujukanMin.trim() === '' ? null : uraiNilaiLab(p.rujukanMin);
    const maks = p.rujukanMaks.trim() === '' ? null : uraiNilaiLab(p.rujukanMaks);
    if (p.rujukanMin.trim() !== '' && min === null) g.rujukanMin = 'Batas bawah ditulis sebagai angka.';
    if (p.rujukanMaks.trim() !== '' && maks === null) g.rujukanMaks = 'Batas atas ditulis sebagai angka.';
    if (min !== null && maks !== null && min > maks) g.rentang = 'Batas bawah lebih besar dari batas atas; periksa lagi urutannya.';
    galat.perPenanda[i] = g;
    if (Object.keys(g).length === 0 && nilai !== null) {
      penanda.push({ nama: n, nilai, satuan: p.satuan.trim(), rujukanMin: min, rujukanMaks: maks });
    }
  }

  const adaGalat =
    galat.nama !== undefined ||
    galat.tanggal !== undefined ||
    galat.penanda !== undefined ||
    galat.perPenanda.some((g) => g && Object.keys(g).length > 0);
  if (adaGalat || tanggal === null) return { sah: false, galat };
  return { sah: true, hasil: { nama, tanggal, laboratorium: isian.laboratorium.trim() || null, penanda } };
}

/** Angka untuk isian: koma desimal, tanpa nol di belakang ("5,3", "1", "0,75"). */
function angkaIsian(n: number | null): string {
  return n === null ? '' : String(n).replace('.', ',');
}

/**
 * Hasil tersimpan → isian form, untuk MENGUBAH entri. Kebalikan
 * `periksaHasilLab`: memeriksa isian ini lagi menghasilkan hasil yang sama
 * persis (dijaga `npm run cek:lab` untuk setiap entri tiruan).
 */
export function isianDariHasilLab(h: HasilLab): IsianHasilLab {
  const [y, m, d] = h.tanggal.split('-').map(Number);
  return {
    nama: h.nama,
    tanggal: `${d}/${m}/${y}`,
    laboratorium: h.laboratorium ?? '',
    penanda: h.penanda.map((p) => ({
      nama: p.nama,
      nilai: angkaIsian(p.nilai),
      satuan: p.satuan,
      rujukanMin: angkaIsian(p.rujukanMin),
      rujukanMaks: angkaIsian(p.rujukanMaks),
    })),
  };
}

/**
 * Apakah hasil pemeriksaan isian sama dengan entri tersimpan (tidak ada yang
 * diubah). Dibandingkan per kolom, bukan lewat JSON — urutan kunci objek
 * tidak boleh membuat entri yang tidak disentuh tampak berubah.
 */
export function hasilLabSama(a: Omit<HasilLab, 'id'>, b: HasilLab): boolean {
  return (
    a.nama === b.nama &&
    a.tanggal === b.tanggal &&
    a.laboratorium === b.laboratorium &&
    a.penanda.length === b.penanda.length &&
    a.penanda.every((p, i) => {
      const q = b.penanda[i];
      return (
        p.nama === q.nama &&
        p.nilai === q.nilai &&
        p.satuan === q.satuan &&
        p.rujukanMin === q.rujukanMin &&
        p.rujukanMaks === q.rujukanMaks
      );
    })
  );
}
