import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuranIkon } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /**
   * Isi untuk chip PILIHAN (satu dari beberapa): `true`/`false` membuatnya
   * radio dengan tepi aksen saat terpilih. Kosongkan untuk chip AKSI (saran
   * pertanyaan, templat, pilih cepat) yang langsung menjalankan sesuatu.
   */
  terpilih?: boolean;
  aksesLabel?: string;
  /** Ikon kecil di depan label, mis. `add` untuk "Tipe hari baru". */
  ikon?: React.ComponentProps<typeof Ionicons>['name'];
  nonaktif?: boolean;
  /** Posisi di wadah berkolom; bawaan `awal` (rata kiri). */
  sejajar?: 'awal' | 'tengah';
};

/**
 * Chip bersama (bab Desain 8.6): pil 44 pt bertepi untuk pilihan pendek dan
 * aksi cepat. Menggantikan chip yang dulu digambar per layar (saran Coach,
 * templat lab, pilih cepat batas pinggang, skenario widget, tipe hari).
 *
 * Terpilih ditandai tepi aksen + tint + teks penuh, tidak dengan warna isian
 * saja, dan diumumkan lewat `aria-checked`.
 */
export function Chip({ label, onPress, terpilih, aksesLabel, ikon, nonaktif = false, sejajar = 'awal' }: Props) {
  const pilihan = terpilih !== undefined;
  const aktif = terpilih === true;
  return (
    <Pressable
      accessibilityRole={pilihan ? 'radio' : 'button'}
      // Radio diumumkan "dicentang" (checked), bukan "dipilih" (selected, untuk tab).
      aria-checked={pilihan ? aktif : undefined}
      aria-disabled={nonaktif}
      accessibilityLabel={aksesLabel ?? label}
      disabled={nonaktif}
      onPress={() => {
        if (aktif) return;
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: sejajar === 'tengah' ? 'center' : 'flex-start',
        gap: spacing.xs,
        minHeight: TAP_MIN,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: aktif ? colors.aksen.isian : colors.garisKontrol,
        backgroundColor: aktif ? tint(colors.aksen.isian, 'pill') : colors.permukaanCekung,
        opacity: nonaktif ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      {ikon ? <Ionicons name={ikon} size={ukuranIkon.kecil} color={aktif ? colors.aksen.teks : colors.teksRedup} /> : null}
      <Text style={{ ...typography.label, color: aktif || !pilihan ? colors.teks : colors.teksRedup, flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
