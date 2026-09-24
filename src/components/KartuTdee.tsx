import { Text, View } from 'react-native';
import { formatAngka } from '@recomp/logika';
import type { HasilTdee } from '@recomp/logika';
import { Card } from './Card';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  tdee: HasilTdee;
  /** Kalimat perbandingan target hari ini terhadap TDEE; opsional. */
  perbandingan?: string | null;
};

/**
 * Estimasi TDEE sebagai RENTANG, bukan satu angka.
 *
 * Satu angka TDEE selalu bohong: rumus meleset 10–15% pada individu, dan data
 * beberapa hari masih berisik. Rentang dari beberapa metode lebih jujur, dan
 * tingkat keyakinan memberi tahu seberapa serius rentang itu boleh dipakai.
 *
 * Tiap metode ditampilkan beserta DASARNYA, jadi angkanya bisa ditelusuri
 * alih-alih diterima begitu saja. Metode berbasis data pengguna ditandai
 * khusus karena ia satu-satunya yang mengukur tubuh orang ini.
 */
export function KartuTdee({ tdee, perbandingan }: Props) {
  const warnaKeyakinan =
    tdee.keyakinan === 'tinggi'
      ? colors.aksenTeks.jade
      : tdee.keyakinan === 'sedang'
        ? colors.amber
        : colors.textMuted;

  if (tdee.min === null || tdee.maks === null) {
    return (
      <Card>
        <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
          {tdee.alasanKeyakinan}
        </Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        {/* Rentangnya, bukan satu angka */}
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
            Perkiraan TDEE
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <Text style={{ ...typography.display, color: colors.text }}>{formatAngka(tdee.min)}</Text>
            <Text style={{ ...typography.title, color: colors.textFaint }}>–</Text>
            <Text style={{ ...typography.display, color: colors.text }}>{formatAngka(tdee.maks)}</Text>
            <Text style={{ ...typography.label, color: colors.textFaint }}>kcal</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.xs + 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: warnaKeyakinan + '1A',
              borderWidth: 1,
              borderColor: warnaKeyakinan + '55',
              marginTop: spacing.xs,
            }}
          >
            <Text style={{ ...typography.caption, color: warnaKeyakinan }}>
              keyakinan {tdee.keyakinan}
            </Text>
          </View>
        </View>

        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          {tdee.alasanKeyakinan}
        </Text>

        {/* Tiap metode beserta dasarnya — angkanya bisa ditelusuri */}
        <View style={{ gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
          {tdee.metode.map((m) => (
            <View key={m.nama} style={{ gap: spacing.xxs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                  <Text style={{ ...typography.label, color: colors.text }}>{m.nama}</Text>
                  {m.berbasisData ? (
                    <Text style={{ ...typography.caption, color: colors.aksenTeks.jade }}>
                      DARI DATA ANDA
                    </Text>
                  ) : (
                    <Text style={{ ...typography.caption, color: colors.textFaint }}>rumus</Text>
                  )}
                </View>
                <Text style={{ ...typography.label, color: colors.text }}>
                  {formatAngka(m.nilai)} kcal
                </Text>
              </View>
              <Text style={{ ...typography.caption, color: colors.textFaint }}>{m.dasar}</Text>
            </View>
          ))}
        </View>

        {perbandingan ? (
          <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
            {perbandingan}
          </Text>
        ) : null}

        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          Rumus populasi bisa meleset 10–15% pada individu. Yang paling dipercaya adalah metode
          berbasis data Anda sendiri, dan ia membaik seiring catatan bertambah.
        </Text>
      </View>
    </Card>
  );
}
