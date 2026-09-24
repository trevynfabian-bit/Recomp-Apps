import { ActivityIndicator, Pressable, Text } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, TAP_MIN, typography } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /** Label untuk pembaca layar bila berbeda dari teks tombolnya. */
  aksesLabel?: string;
  nonaktif?: boolean;
  /** Menampilkan indikator proses menggantikan label, dan menonaktifkan tombol. */
  memproses?: boolean;
};

/**
 * Tombol isian: aksi utama sebuah kartu atau sheet. `merusak` memakai coral
 * untuk tindakan yang menghapus atau memutuskan sesuatu — warnanya disertai
 * label yang menyebut tindakannya, tidak pernah warna saja.
 */
export function TombolUtama({
  label,
  onPress,
  aksesLabel,
  nonaktif = false,
  memproses = false,
  merusak = false,
}: Props & { merusak?: boolean }) {
  const mati = nonaktif || memproses;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel ?? label}
      accessibilityState={{ disabled: mati, busy: memproses }}
      disabled={mati}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TAP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: merusak ? colors.coral : colors.amber,
        opacity: nonaktif ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {memproses ? (
        <ActivityIndicator color={colors.bg} />
      ) : (
        // Label di atas isian selalu warna latar: teks terang di atas coral hanya
        // 3,64:1, di bawah ambang AA untuk label 16px (lihat docs/desain/arah-visual.md).
        <Text style={{ ...typography.body, fontWeight: '700', color: colors.bg }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Tombol bertepi: aksi kedua (batal, coba lagi) yang tidak boleh bersaing dengan aksi utama. */
export function TombolBertepi({ label, onPress, aksesLabel, nonaktif = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel ?? label}
      accessibilityState={{ disabled: nonaktif }}
      disabled={nonaktif}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TAP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderKuat,
        opacity: nonaktif ? 0.45 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
