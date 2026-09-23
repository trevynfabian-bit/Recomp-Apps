import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TombolBertepi, TombolUtama } from './Tombol';
import { colors, spacing, typography } from '@/theme';

type Props = {
  /** `null` selama memuat; berisi kalimat layak tampil bila gagal. */
  pesanGagal: string | null;
  onCobaLagi: () => void;
  onKeluar: () => void;
};

/**
 * Pengganti app selama tipe hari & target pertama kali dimuat.
 *
 * Hari Ini, Budget, dan widget semuanya berdiri di atas tipe hari dan
 * targetnya; tanpa keduanya tidak ada angka yang benar untuk ditampilkan.
 * Gagal memuat tidak menjebak: ada Coba lagi, dan Keluar tetap terjangkau.
 */
export function LayarMuatTarget({ pesanGagal, onCobaLagi, onKeluar }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        justifyContent: 'center',
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.lg,
        gap: spacing.lg,
      }}
    >
      {pesanGagal === null ? (
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={colors.amber} />
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>Memuat target harian…</Text>
        </View>
      ) : (
        <>
          <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
            <Text accessibilityRole="header" style={{ ...typography.title, color: colors.text }}>
              Target harian belum termuat
            </Text>
            <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>{pesanGagal}</Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <TombolUtama label="Coba lagi" onPress={onCobaLagi} />
            <TombolBertepi label="Keluar" onPress={onKeluar} />
          </View>
        </>
      )}
    </View>
  );
}
