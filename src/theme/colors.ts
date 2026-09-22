/**
 * Palet warna Recomp Coach — dark mode, nuansa athlete dashboard.
 * Biru standar sengaja dihindari; aksen memakai amber/coral/jade.
 */
export const colors = {
  /** Latar utama aplikasi. */
  bg: '#14151A',
  /** Latar kartu / permukaan yang diangkat satu tingkat. */
  surface: '#2A2D36',
  /** Permukaan yang lebih gelap dari surface, untuk track progress & input. */
  surfaceSunken: '#1C1E25',
  /** Garis pemisah halus. */
  border: '#343845',

  /** Aksen utama: kalori, angka utama, CTA. */
  amber: '#F0A202',
  /** Peringatan / batas terlampaui (dipakai netral, bukan menghakimi). */
  coral: '#E24E1B',
  /** Positif / protein / on-track. */
  jade: '#1B998B',

  /** Teks paling menonjol. */
  text: '#F5F6F8',
  /** Teks pendukung. */
  textMuted: '#9BA1AF',
  /** Teks paling redup: label, unit, keterangan estimasi. */
  textFaint: '#6B7283',

  /** Warna per makro supaya konsisten di seluruh app. */
  macro: {
    kalori: '#F0A202',
    protein: '#1B998B',
    lemak: '#E24E1B',
    karbo: '#7C6AE8',
    satFat: '#D2495B',
  },
} as const;

export type MacroKey = keyof typeof colors.macro;
