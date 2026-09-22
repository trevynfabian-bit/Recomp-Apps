import { Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { formatAngka, rasio } from '@/lib/format';
import type { MacroProgress } from '@/types/domain';

type Props = { macro: MacroProgress };

/**
 * Satu baris makro: label, "terpakai / target", dan bar progress.
 * Untuk `isBatas` (sat fat) bar berubah coral begitu batas terlampaui —
 * tetap netral, hanya menandai fakta, tanpa kalimat menghakimi.
 */
export function MacroRow({ macro }: Props) {
  const warnaDasar = colors.macro[macro.key];
  const lewatBatas = macro.isBatas && macro.target !== null && macro.terpakai > macro.target;
  const warna = lewatBatas ? colors.coral : warnaDasar;
  const persen = rasio(macro.terpakai, macro.target);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ ...typography.label, color: colors.textMuted }}>{macro.label}</Text>
        <Text style={{ ...typography.label, color: colors.text }}>
          {formatAngka(macro.terpakai)}
          <Text style={{ color: colors.textFaint }}>
            {macro.target !== null
              ? ` / ${formatAngka(macro.target)} ${macro.unit}`
              : ` ${macro.unit}`}
          </Text>
        </Text>
      </View>

      {macro.target !== null ? (
        <View
          style={{
            height: 6,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSunken,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${persen * 100}%`,
              height: '100%',
              borderRadius: radius.pill,
              backgroundColor: warna,
            }}
          />
        </View>
      ) : (
        // Karbo tidak ditargetkan: tampilkan track kosong agar ritme baris tetap rapi.
        <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken }} />
      )}
    </View>
  );
}
