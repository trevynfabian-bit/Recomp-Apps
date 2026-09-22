import { formatMakro, rasio } from './format';
import type { HitunganMakro, MacroProgress, ModeMakro } from '@/types/domain';

/**
 * Hitung angka tampil satu makro. Dipisah dari komponen supaya aturannya
 * (sisa vs terpakai, batas sat fat, makro tanpa target) bisa diuji sendiri
 * dan nanti dipindah ke paket logika bersama dengan web.
 */
export function hitungMakro(macro: MacroProgress, mode: ModeMakro): HitunganMakro {
  const progres = rasio(macro.terpakai, macro.target);

  // Makro tanpa target (karbo): hanya ada angka tercatat, tidak ada sisa.
  if (macro.target === null) {
    return { nilaiUtama: macro.terpakai, terlampaui: false, progres: 0 };
  }

  // Dibulatkan ke 2 desimal: aritmetika float JavaScript meninggalkan sisa
  // seperti -0,10000000000000142 untuk 25 − 25,1, sementara sisi server
  // memakai `numeric` yang eksak. Tanpa pembulatan ini kedua sisi berbeda.
  const sisa = bulatkan(macro.target - macro.terpakai);
  const terlampaui = sisa < 0;

  return {
    nilaiUtama: mode === 'sisa' ? Math.abs(sisa) : macro.terpakai,
    terlampaui,
    progres,
  };
}

/**
 * Keterangan di bawah bar. Untuk sat fat disebut sebagai BATAS, bukan target,
 * dan kalimatnya dijaga tetap netral — tanpa peringatan menghakimi.
 */
export function keteranganMakro(macro: MacroProgress, mode: ModeMakro): string {
  if (macro.target === null) return 'Tanpa target';

  const sisa = macro.target - macro.terpakai;
  const satuan = macro.unit;
  const batas = formatMakro(macro.target);

  if (mode === 'terpakai') {
    return macro.isBatas
      ? `Batas ${batas} ${satuan}`
      : `Target ${batas} ${satuan}`;
  }

  if (sisa < 0) {
    return macro.isBatas
      ? `Di atas batas ${batas} ${satuan}`
      : `Di atas target ${batas} ${satuan}`;
  }

  return macro.isBatas
    ? `Tersisa dari batas ${batas} ${satuan}`
    : `Dari target ${batas} ${satuan}`;
}

/** Bulatkan ke 2 desimal untuk menyingkirkan galat pembulatan biner. */
function bulatkan(nilai: number): number {
  return Math.round(nilai * 100) / 100;
}
