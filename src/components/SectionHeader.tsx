import { Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme';

type Props = {
  judul: string;
  /** Teks kanan yang redup, mis. "4 entri" atau "estimasi". */
  aksi?: string;
};

/** Judul kecil huruf kapital di atas tiap grup kartu. */
export function SectionHeader({ judul, aksi }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
        paddingHorizontal: spacing.xs,
      }}
    >
      <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
        {judul}
      </Text>
      {aksi ? (
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>{aksi}</Text>
      ) : null}
    </View>
  );
}
