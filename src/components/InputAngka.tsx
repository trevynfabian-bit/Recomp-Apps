import { Text, TextInput, View } from 'react-native';
import { angkaTabular, colors, radius, spacing, typography } from '@/theme';

type Props = {
  label: string;
  nilai: string;
  unit: string;
  onUbah: (teks: string) => void;
  /** Warna aksen label; dipakai untuk membedakan makro. */
  warna?: string;
};

/** Field angka kecil dengan label & unit, dipakai form koreksi hasil AI. */
export function InputAngka({ label, nilai, unit, onUbah, warna = colors.textMuted }: Props) {
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: warna }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.borderKuat,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={nilai}
          onChangeText={onUbah}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          accessibilityLabel={label}
          // Lebar diserahkan ke flex; tanpa ini input memakai lebar bawaannya.
          style={{
            ...typography.body,
            ...angkaTabular,
            flex: 1,
            minWidth: 0,
            color: colors.text,
            paddingVertical: spacing.md,
          }}
        />
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text>
      </View>
    </View>
  );
}
