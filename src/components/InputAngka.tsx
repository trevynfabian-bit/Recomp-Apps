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
export function InputAngka({ label, nilai, unit, onUbah, warna = colors.teksRedup }: Props) {
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: warna }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: colors.permukaanCekung,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.garisKontrol,
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
            color: colors.teks,
            paddingVertical: spacing.md,
          }}
        />
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>{unit}</Text>
      </View>
    </View>
  );
}
