/**
 * Form target harian per tipe hari.
 *
 * Target disimpan sebagai angka ABSOLUT per (tipe hari x fase) di
 * `day_type_targets`. Pemeriksaan di sini dijalankan sebelum menyimpan dan
 * memakai batas yang sama dengan CHECK di database (kalori 800–8.000,
 * gram satu desimal), ditambah dua aturan yang tidak bisa dijaga CHECK satu
 * kolom:
 *   • batas sat fat tidak melebihi target lemak — sat fat adalah BAGIAN dari
 *     lemak, jadi batas yang lebih besar tidak pernah bisa tercapai;
 *   • kalori dari protein + lemak tidak melebihi target kalori — kalau tidak,
 *     karbo "tersisa" negatif dan targetnya mustahil dipenuhi bersamaan.
 *
 * Isian dibaca seperti orang Indonesia menulis angka: "2.450" di kolom kalori
 * adalah dua ribu empat ratus lima puluh (titik = pemisah ribuan), dan
 * "72,5" di kolom gram adalah tujuh puluh dua koma lima.
 */
import type { Fase } from './tipe';

/** Nilai satu baris `day_type_targets`. */
export type NilaiTarget = {
  target_kalori: number;
  target_protein_g: number;
  target_lemak_g: number;
  batas_sat_fat_g: number;
};

/** Teks mentah dari empat kolom form. */
export type IsianTarget = { kalori: string; protein: string; lemak: string; satFat: string };

export type KolomTarget = keyof IsianTarget;

/**
 * Rentang yang diterima. Kalori sama dengan CHECK `day_type_targets_kalori_masuk_akal`;
 * batas atas gram lebih ketat dari kolomnya (numeric(6,1)) untuk menangkap
 * salah ketik seperti 1650 di kolom protein.
 */
export const RENTANG_TARGET: Record<KolomTarget, { min: number; maks: number }> = {
  kalori: { min: 800, maks: 8000 },
  protein: { min: 0, maks: 500 },
  lemak: { min: 0, maks: 400 },
  satFat: { min: 0, maks: 200 },
};

export const KKAL_PER_GRAM = { protein: 4, lemak: 9, karbo: 4 } as const;

const NAMA_KOLOM: Record<KolomTarget, string> = {
  kalori: 'Kalori',
  protein: 'Protein',
  lemak: 'Lemak',
  satFat: 'Batas sat fat',
};

/** "2450", "2.450", "2 450" → 2450. Desimal tidak diterima: kolomnya bilangan bulat. */
export function uraiKalori(teks: string): number | null {
  const bersih = teks.trim().replace(/[\s.]/g, '');
  if (!/^\d{1,5}$/.test(bersih)) return null;
  return Number(bersih);
}

/** "72", "72,5", "72.5" → angka; paling banyak satu desimal (numeric(6,1)). */
export function uraiGram(teks: string): number | null {
  const bersih = teks.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d)?$/.test(bersih)) return null;
  return Number(bersih);
}

function formatGramIsian(g: number): string {
  return Number.isInteger(g) ? String(g) : String(Math.round(g * 10) / 10).replace('.', ',');
}

/** Nilai tersimpan → isian form (tanpa pemisah ribuan, supaya mudah disunting). */
export function isianDariTarget(t: NilaiTarget): IsianTarget {
  return {
    kalori: String(t.target_kalori),
    protein: formatGramIsian(t.target_protein_g),
    lemak: formatGramIsian(t.target_lemak_g),
    satFat: formatGramIsian(t.batas_sat_fat_g),
  };
}

/** Karbo yang tersisa dari target kalori setelah protein & lemak, dalam gram (dibulatkan ke bawah). */
export function karboTersisaG(t: NilaiTarget): number {
  const sisaKkal =
    t.target_kalori - t.target_protein_g * KKAL_PER_GRAM.protein - t.target_lemak_g * KKAL_PER_GRAM.lemak;
  return Math.floor(sisaKkal / KKAL_PER_GRAM.karbo);
}

function ribuan(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type HasilPeriksaTarget =
  | { sah: true; nilai: NilaiTarget; karboG: number }
  | { sah: false; galat: Partial<Record<KolomTarget, string>> };

/** Periksa satu baris isian. Semua pesan netral: menyebut yang perlu diubah, bukan menegur. */
export function periksaTarget(isian: IsianTarget): HasilPeriksaTarget {
  const galat: Partial<Record<KolomTarget, string>> = {};
  const angka: Partial<Record<KolomTarget, number>> = {};

  for (const k of ['kalori', 'protein', 'lemak', 'satFat'] as const) {
    const teks = isian[k];
    if (teks.trim() === '') {
      galat[k] = `${NAMA_KOLOM[k]} belum diisi.`;
      continue;
    }
    const n = k === 'kalori' ? uraiKalori(teks) : uraiGram(teks);
    if (n === null) {
      galat[k] =
        k === 'kalori' ? 'Kalori ditulis sebagai bilangan bulat, mis. 2450.' : `${NAMA_KOLOM[k]} ditulis dalam gram, paling banyak satu desimal, mis. 72,5.`;
      continue;
    }
    const { min, maks } = RENTANG_TARGET[k];
    if (n < min || n > maks) {
      galat[k] =
        k === 'kalori'
          ? `Kalori antara ${ribuan(min)} dan ${ribuan(maks)} kcal.`
          : `${NAMA_KOLOM[k]} antara ${min} dan ${maks} g.`;
      continue;
    }
    angka[k] = n;
  }

  if (angka.lemak !== undefined && angka.satFat !== undefined && angka.satFat > angka.lemak) {
    galat.satFat = 'Batas sat fat paling tinggi sama dengan target lemak, karena sat fat bagian dari lemak.';
  }
  if (angka.kalori !== undefined && angka.protein !== undefined && angka.lemak !== undefined) {
    const kkalProteinLemak = angka.protein * KKAL_PER_GRAM.protein + angka.lemak * KKAL_PER_GRAM.lemak;
    if (kkalProteinLemak > angka.kalori) {
      galat.kalori = `Protein dan lemak saja sudah ${ribuan(kkalProteinLemak)} kcal; target kalori perlu setidaknya sebesar itu.`;
    }
  }

  if (Object.keys(galat).length > 0) return { sah: false, galat };
  const nilai: NilaiTarget = {
    target_kalori: angka.kalori!,
    target_protein_g: angka.protein!,
    target_lemak_g: angka.lemak!,
    batas_sat_fat_g: angka.satFat!,
  };
  return { sah: true, nilai, karboG: karboTersisaG(nilai) };
}

/** Isian kosong untuk target yang belum pernah diisi. */
export const ISIAN_KOSONG: IsianTarget = { kalori: '', protein: '', lemak: '', satFat: '' };

/**
 * Apakah isian berbeda dari nilai tersimpan (setelah diurai — "2.450" sama
 * dengan 2450). Tanpa nilai tersimpan (target belum diisi), isian dianggap
 * berubah begitu satu kolom saja terisi.
 */
export function isianBerubah(isian: IsianTarget, tersimpan: NilaiTarget | null): boolean {
  if (tersimpan === null) return (Object.keys(isian) as KolomTarget[]).some((k) => isian[k].trim() !== '');
  const h = periksaTarget(isian);
  if (!h.sah) {
    // Isian yang belum sah tetap dihitung berubah bila teksnya berbeda.
    const asal = isianDariTarget(tersimpan);
    return (Object.keys(asal) as KolomTarget[]).some((k) => isian[k].trim() !== asal[k]);
  }
  return (
    h.nilai.target_kalori !== tersimpan.target_kalori ||
    h.nilai.target_protein_g !== tersimpan.target_protein_g ||
    h.nilai.target_lemak_g !== tersimpan.target_lemak_g ||
    h.nilai.batas_sat_fat_g !== tersimpan.batas_sat_fat_g
  );
}

// ---------------------------------------------------------------------------
// Matriks target: tipe hari x fase.
// ---------------------------------------------------------------------------

/** Urutan kolom matriks: dari kalori terendah yang lazim ke tertinggi. */
export const URUTAN_FASE_MATRIKS: Fase[] = ['Cut', 'Maintenance', 'Lean Gain'];

export type SelMatriks = { fase: Fase; target: NilaiTarget | null };
export type BarisMatriks = { dayTypeId: string; nama: string; sel: SelMatriks[] };

/**
 * Susun matriks target absolut. Kombinasi yang belum punya baris target
 * menjadi sel `null` — ditampilkan sebagai kosong, bukan diisi angka lain,
 * karena target yang dipinjam dari fase lain adalah angka yang salah yang
 * tampak benar.
 */
export function susunMatriksTarget(
  tipeHari: { id: string; nama: string }[],
  target: (NilaiTarget & { day_type_id: string; fase: Fase })[],
  urutanFase: Fase[] = URUTAN_FASE_MATRIKS,
): BarisMatriks[] {
  return tipeHari.map((d) => ({
    dayTypeId: d.id,
    nama: d.nama,
    sel: urutanFase.map((fase) => {
      const t = target.find((x) => x.day_type_id === d.id && x.fase === fase);
      return {
        fase,
        target: t
          ? {
              target_kalori: t.target_kalori,
              target_protein_g: t.target_protein_g,
              target_lemak_g: t.target_lemak_g,
              batas_sat_fat_g: t.batas_sat_fat_g,
            }
          : null,
      };
    }),
  }));
}

/**
 * Tipe hari yang urutan kalorinya antarfase tidak lazim: Cut di atas
 * Maintenance, atau Maintenance di atas Lean Gain. Bukan larangan — bisa
 * disengaja — tetapi paling sering salah ketik saat menyunting satu fase,
 * dan hanya terlihat bila ketiga fase dibaca berdampingan.
 */
export function urutanFaseJanggal(baris: BarisMatriks[]): { nama: string; kalimat: string }[] {
  const hasil: { nama: string; kalimat: string }[] = [];
  for (const b of baris) {
    const kal = (f: Fase) => b.sel.find((s) => s.fase === f)?.target?.target_kalori ?? null;
    const cut = kal('Cut');
    const mnt = kal('Maintenance');
    const lg = kal('Lean Gain');
    if (cut !== null && mnt !== null && cut > mnt) {
      hasil.push({ nama: b.nama, kalimat: `${b.nama}: target Cut lebih tinggi dari Maintenance.` });
    } else if (mnt !== null && lg !== null && mnt > lg) {
      hasil.push({ nama: b.nama, kalimat: `${b.nama}: target Maintenance lebih tinggi dari Lean Gain.` });
    }
  }
  return hasil;
}

/**
 * Pembagian kalori target ke makro: berapa kkal dari protein, lemak, dan
 * sisanya (karbo). Dipakai form sunting untuk memperlihatkan akibat tiap
 * angka — menaikkan lemak 10 g memakan 90 kcal dari karbo, bukan dari udara.
 * Persen dibulatkan dan dijumlahkan tepat 100 bila kalori > 0.
 */
export function rincianKaloriMakro(t: NilaiTarget): {
  proteinKkal: number;
  lemakKkal: number;
  karboKkal: number;
  persen: { protein: number; lemak: number; karbo: number };
} {
  const proteinKkal = Math.round(t.target_protein_g * KKAL_PER_GRAM.protein);
  const lemakKkal = Math.round(t.target_lemak_g * KKAL_PER_GRAM.lemak);
  const karboKkal = Math.max(0, t.target_kalori - proteinKkal - lemakKkal);
  if (t.target_kalori <= 0) return { proteinKkal, lemakKkal, karboKkal, persen: { protein: 0, lemak: 0, karbo: 0 } };
  const protein = Math.round((proteinKkal / t.target_kalori) * 100);
  const lemak = Math.round((lemakKkal / t.target_kalori) * 100);
  return { proteinKkal, lemakKkal, karboKkal, persen: { protein, lemak, karbo: Math.max(0, 100 - protein - lemak) } };
}
