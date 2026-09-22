import { Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  label: string;
  /** Warna teks & border; latar memakai versi transparan dari warna ini. */
  warna?: string;
};

/** Badge kecil untuk fase program, tipe hari, atau penanda "estimasi". */
export function Pill({ label, warna = colors.textMuted }: Props) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 1,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: warna + '55',
        backgroundColor: warna + '1A',
      }}
    >
      <Text style={{ ...typography.caption, color: warna }}>{label}</Text>
    </View>
  );
}
