import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { formatAngka } from '@/lib/format';
import { colors, radius, spacing, typography } from '@/theme';
import type { DayType, DayTypeTarget, Fase } from '@/types/domain';

type Props = {
  daftar: DayType[];
  terpilihId: string;
  /** Target absolut untuk (tipe hari terpilih x fase aktif). */
  target: DayTypeTarget;
  fase: Fase;
  /** true bila pilihan saat ini hasil override manual atas auto-deteksi. */
  override: boolean;
  onPilih: (dayTypeId: string) => void;
};

/**
 * Pemilih tipe hari. Mengganti pilihan langsung menukar target harian ke
 * nilai ABSOLUT dari `day_type_targets` untuk (tipe hari x fase) — tidak ada
 * faktor pengali, sesuai PRD.
 */
export function PemilihTipeHari({ daftar, terpilihId, target, fase, override, onPilih }: Props) {
  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {daftar.map((dt) => {
            const aktif = dt.id === terpilihId;
            return (
              <Pressable
                key={dt.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: aktif }}
                accessibilityLabel={`Tipe hari ${dt.nama}`}
                onPress={() => {
                  if (aktif) return;
                  ketukRingan();
                  onPilih(dt.id);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: aktif ? colors.amber : colors.border,
                  backgroundColor: aktif ? colors.amber : colors.surfaceSunken,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    ...typography.label,
                    color: aktif ? colors.bg : colors.textMuted,
                  }}
                >
                  {dt.nama}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Pratinjau target yang berlaku untuk pilihan saat ini */}
        <View
          style={{
            flexDirection: 'row',
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <TargetRingkas label="Kalori" nilai={formatAngka(target.target_kalori)} unit="kcal" warna={colors.macro.kalori} />
          <TargetRingkas label="Protein" nilai={formatAngka(target.target_protein_g)} unit="g" warna={colors.macro.protein} />
          <TargetRingkas label="Lemak" nilai={formatAngka(target.target_lemak_g)} unit="g" warna={colors.macro.lemak} />
          <TargetRingkas label="Sat fat" nilai={`≤${formatAngka(target.batas_sat_fat_g)}`} unit="g" warna={colors.macro.satFat} />
        </View>

        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          {override
            ? `Diubah manual · target absolut untuk fase ${fase}`
            : `Target absolut dari day_type_targets · fase ${fase}`}
        </Text>
      </View>
    </Card>
  );
}

/** Satu kolom pratinjau target; empat kolom membagi lebar kartu rata. */
function TargetRingkas({
  label,
  nilai,
  unit,
  warna,
}: {
  label: string;
  nilai: string;
  unit: string;
  warna: string;
}) {
  return (
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textFaint }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={{ ...typography.body, fontWeight: '700', color: warna }}>{nilai}</Text>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text>
      </View>
    </View>
  );
}
