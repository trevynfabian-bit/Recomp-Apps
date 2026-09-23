import { Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Satu kolom angka pada form target (kalori, protein, lemak, batas sat fat).
 *
 * Kolom yang galatnya sedang tampil diberi tepi coral yang lebih tebal —
 * disertai kalimat galat di bawah form dan petunjuk untuk pembaca layar,
 * tidak pernah warna saja. Kalori memakai papan angka tanpa desimal; gram
 * memakai papan desimal.
 */
export function InputTarget({
  label,
  unit,
  nilai,
  aksesLabel,
  ditandai,
  onUbah,
  onTinggalkan,
  nonaktif,
}: {
  label: string;
  unit: string;
  nilai: string;
  aksesLabel: string;
  /** Ada galat yang sedang ditampilkan untuk kolom ini. */
  ditandai: boolean;
  onUbah: (teks: string) => void;
  onTinggalkan: () => void;
  nonaktif: boolean;
}) {
  return (
    // Dua kolom per baris; lebar minimum menjaga label panjang tidak terpotong.
    <View style={{ flexBasis: '46%', flexGrow: 1, minWidth: 130, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textMuted }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.md,
          borderWidth: ditandai ? 2 : 1,
          borderColor: ditandai ? colors.coral : colors.borderKuat,
          paddingHorizontal: spacing.md,
        }}
      >
        <TextInput
          value={nilai}
          onChangeText={onUbah}
          onBlur={onTinggalkan}
          editable={!nonaktif}
          keyboardType={unit === 'kcal' ? 'number-pad' : 'decimal-pad'}
          inputMode={unit === 'kcal' ? 'numeric' : 'decimal'}
          selectTextOnFocus
          accessibilityLabel={aksesLabel}
          accessibilityHint={ditandai ? 'Isian ini perlu diperbaiki; keterangannya di bawah kartu' : undefined}
          style={{ ...typography.body, flex: 1, minWidth: 0, minHeight: TAP_MIN, color: colors.text, paddingVertical: spacing.sm }}
        />
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text>
      </View>
    </View>
  );
}
