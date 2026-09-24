import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import { colors, spacing, TAP_MIN, typography, ukuranIkon } from '@/theme';

type Props = {
  judul: string;
  /** Baris kedua: nilai yang berlaku sekarang atau keterangan singkat. */
  keterangan?: string;
  /** Ikon di depan judul (baris di daftar setelan); kosongkan untuk tautan tunggal. */
  ikon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Petunjuk pembaca layar: apa yang terjadi setelah diketuk. */
  petunjuk?: string;
  /** Label pembaca layar bila berbeda dari `judul: keterangan`. */
  aksesLabel?: string;
  /**
   * `bahaya` untuk baris yang membuka tindakan merusak (hapus akun): ikon dan
   * judul coral, supaya tidak terbaca setara dengan baris biasa. Tindakannya
   * sendiri tetap dikonfirmasi di sheet.
   */
  nada?: 'bahaya';
  onPress: () => void;
};

/**
 * Baris yang membuka layar atau sheet lain (bab Desain 8.6): ikon opsional,
 * judul, keterangan, lalu chevron. Diletakkan di dalam `DaftarBaris` (banyak
 * baris) atau `Card flat` (satu baris); padding-nya sendiri `lg`, jadi tepi
 * teksnya sejajar dengan isi kartu lain.
 */
export function BarisTautan({ judul, keterangan, ikon, petunjuk, aksesLabel, nada, onPress }: Props) {
  const warnaUtama = nada === 'bahaya' ? colors.status.bahaya.teks : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel ?? (keterangan ? `${judul}: ${keterangan}` : judul)}
      accessibilityHint={petunjuk}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP_MIN,
        padding: spacing.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {ikon ? <Ionicons name={ikon} size={ukuranIkon.baris} color={warnaUtama ?? colors.teksRedup} /> : null}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ ...typography.bodySedang, color: warnaUtama ?? colors.teks }}>{judul}</Text>
        {keterangan ? <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{keterangan}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={ukuranIkon.kecil} color={colors.teksSamar} />
    </Pressable>
  );
}
