import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { formatAngka, formatMakro } from '@recomp/logika';
import { alasanDeteksi, type HasilDeteksi } from '@recomp/logika';
import { NAMA_SUMBER } from '@/mocks/workout';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';
import type { DayType, DayTypeTarget, Fase } from '@/types/domain';

type Props = {
  daftar: DayType[];
  terpilihId: string;
  /** Target absolut untuk (tipe hari terpilih x fase aktif); `null` bila belum diisi. */
  target: DayTypeTarget | null;
  fase: Fase;
  /** true bila pilihan saat ini hasil override manual atas auto-deteksi. */
  override: boolean;
  /** Tebakan dari workout yang tercatat hari ini. */
  deteksi: HasilDeteksi;
  onPilih: (dayTypeId: string) => void;
  /** Buang override dan kembali mengikuti auto-deteksi. */
  onKembalikanAuto: () => void;
};

/**
 * Pemilih tipe hari. Mengganti pilihan langsung menukar target harian ke
 * nilai ABSOLUT dari `day_type_targets` untuk (tipe hari x fase) — tidak ada
 * faktor pengali, sesuai PRD.
 */
export function PemilihTipeHari({
  daftar,
  terpilihId,
  target,
  fase,
  override,
  deteksi,
  onPilih,
  onKembalikanAuto,
}: Props) {
  const alasan = alasanDeteksi(deteksi, NAMA_SUMBER);
  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          contentContainerStyle={{ gap: spacing.sm, alignItems: 'center' }}
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
                  minHeight: TAP_MIN,
                  justifyContent: 'center',
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
        {target ? (
          <View
            style={{
              flexDirection: 'row',
              paddingTop: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TargetRingkas label="Kalori" nilai={formatAngka(target.target_kalori)} unit="kcal" warna={colors.macroTeks.kalori} />
            <TargetRingkas label="Protein" nilai={formatMakro(target.target_protein_g)} unit="g" warna={colors.macroTeks.protein} />
            <TargetRingkas label="Lemak" nilai={formatMakro(target.target_lemak_g)} unit="g" warna={colors.macroTeks.lemak} />
            <TargetRingkas label="Sat fat" nilai={`≤${formatMakro(target.batas_sat_fat_g)}`} unit="g" warna={colors.macroTeks.satFat} />
          </View>
        ) : (
          // Belum diisi: dikatakan apa adanya, bukan diisi angka tipe hari lain.
          <View style={{ paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
              Target {daftar.find((d) => d.id === terpilihId)?.nama ?? 'tipe hari ini'} untuk fase {fase} belum diisi.
            </Text>
          </View>
        )}

        {/* Hasil auto-deteksi selalu dijelaskan, bukan diam-diam dipakai. */}
        <View style={{ gap: spacing.sm }}>
          {override ? (
            <View style={{ gap: spacing.md }}>
              <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
                Diubah manual.{' '}
                {deteksi.nama
                  ? `Dari workout, tipe hari ini terbaca ${deteksi.nama} — ${alasan}.`
                  : alasan}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kembali ikuti auto-deteksi tipe hari"
                onPress={() => {
                  ketukRingan();
                  onKembalikanAuto();
                }}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  minHeight: TAP_MIN,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.amber + '55',
                  backgroundColor: colors.amber + '1A',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.label, color: colors.amber }}>Ikuti auto lagi</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
              {deteksi.dasar.length > 0
                ? `Terdeteksi otomatis dari workout · ${alasan}`
                : `${alasan} · dianggap ${deteksi.nama ?? 'Rest'}`}
            </Text>
          )}

          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            Target absolut dari day_type_targets · fase {fase}
          </Text>
        </View>
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
