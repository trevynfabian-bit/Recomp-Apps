import type { TextStyle } from 'react-native';

/** Skala spasi 4pt — dipakai untuk padding, gap, dan margin. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Radius sudut; kartu memakai `lg`, pill memakai `pill`. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/**
 * Skala tipografi. `hero` khusus untuk SATU angka utama per layar,
 * sesuai prinsip desain di PRD.
 */
export const typography = {
  hero: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 16, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },

  // Varian bernama (docs/desain/arah-visual.md bab 2.3). Menggantikan penimpaan
  // `fontWeight`/`lineHeight` manual setelah `...typography.x`.
  /** Judul kartu / nama baris yang bisa diketuk. */
  bodySedang: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  /** Label tombol utama dan nilai yang ditekankan di dalam kalimat. */
  bodyTebal: { fontSize: 16, fontWeight: '700', lineHeight: 24 },
  /** Teks keterangan: satu kalimat atau lebih di bawah judul kartu. */
  labelBiasa: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
} as const;

/**
 * Digit selebar sama untuk angka yang berubah di tempat (hero, nilai makro,
 * stepper): angka tidak "menari" saat nilainya berganti. Disebar setelah gaya
 * tipografinya: `{ ...typography.hero, ...angkaTabular }`.
 */
export const angkaTabular: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };
