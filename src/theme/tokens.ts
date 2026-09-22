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
} as const;
