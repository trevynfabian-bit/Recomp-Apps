import { Text, View } from 'react-native';
import { formatBeban } from '@recomp/logika';
import { METADATA_SUMBER } from '@/lib/sumber';
import { colors, spacing, typography } from '@/theme';

/**
 * Estimasi 1RM (Epley) untuk satu latihan dalam satu catatan sesi.
 *
 * Tiga baris, rata kanan: angkanya bertanda "≈", label ESTIMASI berwarna
 * penanda sumber estimasi, dan set yang menjadi dasarnya. Dasarnya ditulis
 * terang-terangan karena e1RM hasil rumus, bukan beban yang pernah diangkat:
 * pembaca harus bisa melihat dari set mana angka itu berasal.
 *
 * Tidak dirender untuk latihan tanpa estimasi (berat badan, atau semua set di
 * atas batas repetisi); pemanggil cukup mengirim `null`.
 */
export function EstimasiE1rm({ e1rmKg, setTerbaik }: { e1rmKg: number | null; setTerbaik: string | null }) {
  if (e1rmKg === null) return null;
  return (
    <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
      <Text style={{ ...typography.label, color: colors.teks }}>≈ {formatBeban(e1rmKg)}</Text>
      <Text style={{ ...typography.caption, color: METADATA_SUMBER.estimasi.warna }}>e1RM · estimasi</Text>
      {setTerbaik ? (
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>dari {setTerbaik}</Text>
      ) : null}
    </View>
  );
}
