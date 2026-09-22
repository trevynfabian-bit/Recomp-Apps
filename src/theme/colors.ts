/**
 * Palet warna Recomp Coach — dark mode, nuansa athlete dashboard.
 * Biru standar sengaja dihindari; aksen memakai amber/coral/jade.
 *
 * KONTRAS: nilai aksen di PRD (#F0A202 / #E24E1B / #1B998B) dipertahankan apa
 * adanya untuk ISIAN besar (bar, tombol, pill). Untuk TEKS KECIL sebagian di
 * antaranya tidak lolos WCAG AA 4.5:1 di atas `surface`, jadi disediakan varian
 * `aksenTeks` dan `macroTeks` yang sedikit lebih terang dengan hue yang sama.
 * Aturannya: isian pakai warna dasar, teks kecil pakai varian teks.
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

  /** Aksen utama: kalori, angka utama, CTA. Lolos AA untuk teks maupun isian. */
  amber: '#F0A202',
  /** Batas terlampaui. Untuk ISIAN & teks besar; teks kecil pakai aksenTeks.coral. */
  coral: '#E24E1B',
  /** Positif / protein / on-track. Untuk ISIAN; teks kecil pakai aksenTeks.jade. */
  jade: '#1B998B',

  /** Varian aksen khusus TEKS KECIL (≥4.5:1 di atas surface). */
  aksenTeks: {
    coral: '#E97147',
    jade: '#1DA697',
  },

  /** Teks paling menonjol. */
  text: '#F5F6F8',
  /** Teks pendukung. */
  textMuted: '#9BA1AF',
  /** Teks paling redup: label, unit, keterangan. Dinaikkan dari #6B7283 (2.9:1). */
  textFaint: '#8E94A3',

  /** Warna per makro untuk ISIAN bar. */
  macro: {
    kalori: '#F0A202',
    protein: '#1B998B',
    lemak: '#E24E1B',
    karbo: '#7C6AE8',
    satFat: '#D2495B',
  },

  /** Warna per makro untuk TEKS KECIL (label & angka). */
  macroTeks: {
    kalori: '#F0A202',
    protein: '#1DA697',
    lemak: '#E97147',
    karbo: '#9587EC',
    satFat: '#DD7482',
  },
} as const;

export type MacroKey = keyof typeof colors.macro;
