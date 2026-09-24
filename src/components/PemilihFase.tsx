import { Pressable, Text, View } from 'react-native';
import type { Fase } from '@recomp/logika';
import { formatDesimal, LAJU_PER_MINGGU } from '@recomp/logika';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

const FASE: { nilai: Fase; ringkas: string }[] = [
  { nilai: 'Cut', ringkas: 'Turunkan lemak, jaga otot' },
  { nilai: 'Maintenance', ringkas: 'Pertahankan berat' },
  { nilai: 'Lean Gain', ringkas: 'Naikkan otot, tahan lemak' },
];

type Props = {
  terpilih: Fase;
  onPilih: (fase: Fase) => void;
};

/**
 * Pemilih fase program.
 *
 * Mengganti fase mengubah TARGET HARIAN, koridor tren, dan budget mingguan
 * sekaligus. Kartu ini menyebutkan akibat itu sebelum pengguna menekan, bukan
 * sesudahnya — mengganti fase tidak seharusnya terasa seperti kejutan.
 */
export function PemilihFase({ terpilih, onPilih }: Props) {
  const laju = LAJU_PER_MINGGU[terpilih];
  const persen = (n: number) => `${n > 0 ? '+' : ''}${formatDesimal(n * 100, 2)}%`;

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          {FASE.map((f) => {
            const aktif = f.nilai === terpilih;
            return (
              <Pressable
                key={f.nilai}
                accessibilityRole="radio"
                accessibilityState={{ selected: aktif }}
                accessibilityLabel={`Fase ${f.nilai}`}
                onPress={() => {
                  if (aktif) return;
                  ketukRingan();
                  onPilih(f.nilai);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  minHeight: TAP_MIN,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: aktif ? colors.amber : colors.borderKuat,
                  backgroundColor: aktif ? colors.amber + '14' : colors.surfaceSunken,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {/* Penanda terpilih berupa BENTUK, bukan warna saja. */}
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: aktif ? colors.amber : colors.borderKuat,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {aktif ? (
                    <View
                      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber }}
                    />
                  ) : null}
                </View>

                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ ...typography.label, color: aktif ? colors.text : colors.textMuted }}>
                    {f.nilai}
                  </Text>
                  {/* textMuted, bukan textFaint: di atas latar terpilih yang
                      bertint amber, textFaint cuma 3,94:1 — di bawah AA. */}
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>{f.ringkas}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          Fase {terpilih} menargetkan laju {persen(laju.min)} s/d {persen(laju.maks)} berat badan
          per minggu. Menggantinya mengubah target harian tiap tipe hari, koridor di layar Tren,
          dan budget mingguan sekaligus.
        </Text>
      </View>
    </Card>
  );
}
