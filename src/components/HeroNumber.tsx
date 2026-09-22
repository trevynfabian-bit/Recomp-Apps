import { Text, View } from 'react-native';
import { colors, MAKS_SKALA_HERO, spacing, typography } from '@/theme';

type Props = {
  /** Angka utama, sudah diformat sebagai string. */
  nilai: string;
  unit: string;
  /** Label di atas angka, mis. "SISA KALORI HARI INI". */
  label: string;
  /** Keterangan di bawah angka, mis. "dari target 2.850 kcal". */
  keterangan?: string;
  warna?: string;
};

/**
 * SATU angka utama per layar (prinsip desain PRD): label kecil di atas,
 * angka raksasa di tengah, keterangan redup di bawah.
 */
export function HeroNumber({ nilai, unit, label, keterangan, warna = colors.amber }: Props) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <Text
          maxFontSizeMultiplier={MAKS_SKALA_HERO}
          style={{ ...typography.hero, color: warna }}
        >
          {nilai}
        </Text>
        <Text style={{ ...typography.title, color: colors.textFaint, paddingBottom: spacing.md }}>
          {unit}
        </Text>
      </View>
      {keterangan ? (
        <Text style={{ ...typography.label, color: colors.textMuted }}>{keterangan}</Text>
      ) : null}
    </View>
  );
}
