import { Text, View } from 'react-native';
import { PenandaSumber } from './PenandaSumber';
import { METADATA_SUMBER } from '@/lib/sumber';
import type { RujukanData } from '@/types/domain';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  rujukan: RujukanData[];
};

/**
 * Angka-angka yang dipakai sebuah jawaban coach, beserta asalnya.
 *
 * Kenapa ini ada sama sekali: PRD menuntut coach membedakan data mentah dari
 * estimasi, dan itu tidak bisa dijamin lewat kalimat. Model bisa lupa menulis
 * "estimasi", dan pembaca tetap tidak punya cara memeriksanya. Dengan
 * mengirimkan asal angka sebagai DATA di samping teksnya, penandanya dipasang
 * app — bukan dititipkan ke prosa yang bisa meleset.
 *
 * Diletakkan di BAWAH jawaban, bukan di atas: yang dibaca lebih dulu tetap
 * jawabannya; daftar ini untuk saat pembacanya berhenti dan bertanya "angka
 * ini dari mana?".
 */
export function DaftarRujukan({ rujukan }: Props) {
  if (rujukan.length === 0) return null;

  const adaEstimasi = rujukan.some((r) => r.jenis === 'estimasi');

  return (
    <View
      style={{
        maxWidth: '88%',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1,
        // Tepi amber saat ada estimasi di dalamnya: peringatan itu harus
        // terbaca sebelum daftarnya dibaca, bukan sesudah.
        borderColor: adaEstimasi ? colors.amber + '55' : colors.border,
      }}
    >
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        Angka yang dipakai
      </Text>

      {rujukan.map((r) => (
        <View key={`${r.label}-${r.nilai}`} style={{ gap: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
            }}
          >
            <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
              {r.label}
            </Text>
            <Text style={{ ...typography.label, color: colors.text }}>{r.nilai}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <PenandaSumber jenis={r.jenis} />
            {r.dasar ? (
              <Text style={{ ...typography.caption, color: colors.textFaint, flex: 1 }}>
                · {r.dasar}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {adaEstimasi ? (
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          {METADATA_SUMBER.estimasi.penjelasan}
        </Text>
      ) : null}
    </View>
  );
}
