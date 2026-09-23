import { Text, View } from 'react-native';
import { formatJam, teksWidget } from '@recomp/logika';
import type { RingkasanWidget } from '@recomp/logika';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  ringkasan: RingkasanWidget;
  tampilkanAngka: boolean;
};

/**
 * Pratinjau widget layar kunci (bentuk persegi panjang iOS).
 *
 * Teksnya dari `teksWidget` yang sama dengan yang harus diikuti widget native,
 * jadi yang terlihat di sini adalah apa yang akan terlihat di layar kunci —
 * termasuk saat angka disembunyikan. Warna layar kunci iOS monokrom; pratinjau
 * ini sengaja tanpa aksen warna, supaya tidak menjanjikan warna yang tidak
 * akan muncul.
 */
export function PratinjauWidget({ ringkasan, tampilkanAngka }: Props) {
  const t = teksWidget(ringkasan, tampilkanAngka);
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xl,
        borderRadius: radius.lg,
        // Latar "layar kunci" tiruan.
        backgroundColor: '#0B0C10',
      }}
    >
      <Text style={{ fontSize: 44, fontWeight: '300', color: '#E9EAEE', letterSpacing: -1 }}>
        {formatJam(new Date().toISOString())}
      </Text>
      <View
        accessible
        accessibilityLabel={`Pratinjau widget: ${t.aksesLabel}`}
        style={{
          marginTop: spacing.md,
          width: 170,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          backgroundColor: '#FFFFFF1F',
          gap: 1,
        }}
      >
        <Text style={{ ...typography.caption, color: '#FFFFFFB3', textTransform: 'uppercase' }}>{t.judul}</Text>
        <Text style={{ ...typography.label, color: '#FFFFFF' }}>{t.baris1}</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: '#FFFFFFCC' }}>{t.baris2}</Text>
      </View>
      {tampilkanAngka && ringkasan.dihitungPada ? (
        <Text style={{ ...typography.caption, color: colors.textFaint, marginTop: spacing.sm }}>
          dihitung server {formatJam(ringkasan.dihitungPada)}
        </Text>
      ) : null}
    </View>
  );
}
