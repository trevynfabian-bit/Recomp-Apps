import { formatAngka, rasio } from './format';
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

  const sisa = macro.target - macro.terpakai;
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
  const batas = formatAngka(macro.target);

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
