import { Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { formatMakro } from '@/lib/format';
import { hitungMakro, keteranganMakro } from '@/lib/makro';
import type { MacroProgress, ModeMakro } from '@/types/domain';

type Props = {
  macro: MacroProgress;
  mode: ModeMakro;
};

/**
 * Satu baris makro di panel ringkasan: label + angka utama (sisa atau terpakai),
 * bar progress, lalu keterangan target/batas.
 *
 * Bar berubah coral bila target/batas terlampaui — penanda fakta, bukan
 * peringatan; nada teks tetap netral sesuai PRD.
 */
export function MacroRow({ macro, mode }: Props) {
  const { nilaiUtama, terlampaui, progres } = hitungMakro(macro, mode);
  const tanpaTarget = macro.target === null;
  const warnaIsian = terlampaui ? colors.coral : colors.macro[macro.key];
  const warnaTeks = terlampaui ? colors.aksenTeks.coral : colors.macroTeks[macro.key];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ ...typography.label, color: colors.textMuted }}>{macro.label}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          {/* Sisa negatif diberi awalan "+" karena angkanya sudah dimutlakkan. */}
          <Text style={{ ...typography.title, color: terlampaui ? colors.aksenTeks.coral : colors.text }}>
            {mode === 'sisa' && terlampaui ? '+' : ''}
            {formatMakro(nilaiUtama)}
          </Text>
          <Text style={{ ...typography.label, color: colors.textFaint }}>{macro.unit}</Text>
        </View>
      </View>

      <View
        style={{
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSunken,
          overflow: 'hidden',
        }}
      >
        {!tanpaTarget ? (
          <View
            style={{
              width: `${progres * 100}%`,
              height: '100%',
              borderRadius: radius.pill,
              backgroundColor: warnaIsian,
            }}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          {keteranganMakro(macro, mode)}
        </Text>
        {!tanpaTarget ? (
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {formatMakro(macro.terpakai)} / {formatMakro(macro.target as number)} {macro.unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
