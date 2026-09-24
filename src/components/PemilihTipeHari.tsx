import { Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { formatAngka, formatMakro } from '@recomp/logika';
import { alasanDeteksi, type HasilDeteksi } from '@recomp/logika';
import { NAMA_SUMBER } from '@/mocks/workout';
import { colors, radius, spacing, TAP_MIN, tint, typography } from '@/theme';
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
  /**
   * Tampilkan baris target di bawah pilihan. Dimatikan di layar yang sudah
   * menampilkan target itu sebagai angka utama — satu angka utama per layar.
   */
  tampilkanTarget?: boolean;
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
  tampilkanTarget = true,
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
                  borderColor: aktif ? colors.aksen.isian : colors.garis,
                  backgroundColor: aktif ? colors.aksen.isian : colors.permukaanCekung,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    ...typography.label,
                    color: aktif ? colors.diAtasIsian : colors.teksRedup,
                  }}
                >
                  {dt.nama}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Pratinjau target yang berlaku untuk pilihan saat ini */}
        {!tampilkanTarget ? null : target ? (
          <View
            style={{
              flexDirection: 'row',
              paddingTop: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.garis,
            }}
          >
            <TargetRingkas label="Kalori" nilai={formatAngka(target.target_kalori)} unit="kcal" warna={colors.macroTeks.kalori} />
            <TargetRingkas label="Protein" nilai={formatMakro(target.target_protein_g)} unit="g" warna={colors.macroTeks.protein} />
            <TargetRingkas label="Lemak" nilai={formatMakro(target.target_lemak_g)} unit="g" warna={colors.macroTeks.lemak} />
            <TargetRingkas label="Sat fat" nilai={`≤${formatMakro(target.batas_sat_fat_g)}`} unit="g" warna={colors.macroTeks.satFat} />
          </View>
        ) : (
          // Belum diisi: dikatakan apa adanya, bukan diisi angka tipe hari lain.
          <View style={{ paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.garis }}>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
              Target {daftar.find((d) => d.id === terpilihId)?.nama ?? 'tipe hari ini'} untuk fase {fase} belum diisi.
            </Text>
          </View>
        )}

        {/* Hasil auto-deteksi selalu dijelaskan, bukan diam-diam dipakai. */}
        <View style={{ gap: spacing.sm }}>
          {override ? (
            <View style={{ gap: spacing.md }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
                  borderColor: tint(colors.aksen.isian, 'tepi'),
                  backgroundColor: tint(colors.aksen.isian, 'pill'),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.label, color: colors.aksen.teks }}>Ikuti auto lagi</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              {deteksi.dasar.length > 0
                ? `Terdeteksi otomatis dari workout · ${alasan}`
                : `${alasan} · dianggap ${deteksi.nama ?? 'Rest'}`}
            </Text>
          )}

          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs }}>
        <Text style={{ ...typography.bodyTebal, color: warna }}>{nilai}</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>{unit}</Text>
      </View>
    </View>
  );
}
