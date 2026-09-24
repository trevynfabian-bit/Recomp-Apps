import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme';

type Props = {
  judul: string;
  keterangan: string;
  /** Fase PRD yang akan mengisi layar ini, mis. "Fase 3". */
  fase: string;
};

/** Layar yang belum diisi; menyebut fase PRD yang akan mengerjakannya. */
export function Placeholder({ judul, keterangan, fase }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: insets.top,
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
      }}
    >
      <Text style={{ ...typography.caption, color: colors.amber, textTransform: 'uppercase' }}>
        {fase}
      </Text>
      <Text style={{ ...typography.display, color: colors.text }}>{judul}</Text>
      <Text style={{ ...typography.body, color: colors.textFaint, textAlign: 'center' }}>
        {keterangan}
      </Text>
    </View>
  );
}
