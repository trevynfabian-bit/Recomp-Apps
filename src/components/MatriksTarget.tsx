import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { formatAngka, formatMakro, urutanFaseJanggal } from '@recomp/logika';
import type { BarisMatriks, Fase } from '@recomp/logika';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { colors, ukuranIkon, radius, spacing, TAP_MIN, typography } from '@/theme';

type Props = {
  baris: BarisMatriks[];
  faseAktif: Fase;
  /** Tipe hari yang berlaku hari ini; barisnya ditandai. */
  tipeHariIniId: string | null;
  /** Mengetuk kepala kolom membuka fase itu dalam tampilan per fase. */
  onPilihFase: (fase: Fase) => void;
  /** Mengetuk sel membuka penyunting satu target itu. */
  onPilihSel?: (dayTypeId: string, fase: Fase) => void;
};

const LEBAR_NAMA = 92;

/**
 * Matriks target absolut: tipe hari (baris) x fase (kolom).
 *
 * Target disimpan per pasangan tipe hari x fase, jadi hanya di sini ketiga
 * fase terbaca berdampingan — cukup untuk melihat bahwa Cut memang lebih
 * rendah dari Maintenance di setiap tipe hari, dan untuk menangkap salah
 * ketik yang membalik urutan itu (`urutanFaseJanggal`). Kolom fase aktif dan
 * baris tipe hari ini ditandai dengan kata, bukan warna saja.
 */
export function MatriksTarget({ baris, faseAktif, tipeHariIniId, onPilihFase, onPilihSel }: Props) {
  const fase = baris[0]?.sel.map((s) => s.fase) ?? [];
  const janggal = urutanFaseJanggal(baris);

  return (
    <View style={{ gap: spacing.md }}>
      <Card flat style={{ paddingVertical: spacing.sm }}>
        {/* Kepala kolom */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md }}>
          <View style={{ width: LEBAR_NAMA }} />
          {fase.map((f) => (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityLabel={`Buka fase ${f}${f === faseAktif ? ', fase aktif' : ''}`}
              onPress={() => {
                ketukRingan();
                onPilihFase(f);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: TAP_MIN,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {/* Huruf biasa tanpa renggang: "Maintenance" dalam huruf kapital terpotong di lebar ponsel. */}
              <Text
                numberOfLines={1}
                style={{ ...typography.caption, letterSpacing: 0, fontWeight: '700', color: f === faseAktif ? colors.text : colors.textMuted }}
              >
                {f}
              </Text>
              <Text style={{ ...typography.caption, fontWeight: '500', color: colors.amber, minHeight: 14 }}>
                {f === faseAktif ? 'aktif' : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Baris per tipe hari */}
        {baris.map((b) => {
          const hariIni = b.dayTypeId === tipeHariIniId;
          return (
            <View
              key={b.dayTypeId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ width: LEBAR_NAMA, gap: spacing.xxs }}>
                <Text style={{ ...typography.label, color: colors.text }}>{b.nama}</Text>
                {hariIni ? <Text style={{ ...typography.caption, fontWeight: '500', color: colors.amber }}>hari ini</Text> : null}
              </View>
              {b.sel.map((s) => {
                const aktif = s.fase === faseAktif;
                return (
                  <Pressable
                    key={s.fase}
                    disabled={!onPilihSel}
                    onPress={() => {
                      ketukRingan();
                      onPilihSel?.(b.dayTypeId, s.fase);
                    }}
                    accessibilityRole={onPilihSel ? 'button' : undefined}
                    accessibilityHint={onPilihSel ? 'Membuka penyunting target ini' : undefined}
                    accessibilityLabel={
                      s.target
                        ? `${b.nama}, ${s.fase}${aktif ? ' (aktif)' : ''}: ${formatAngka(s.target.target_kalori)} kilokalori, protein ${formatMakro(s.target.target_protein_g)} gram`
                        : `${b.nama}, ${s.fase}: target belum diisi`
                    }
                    style={({ pressed }) => ({
                      flex: 1,
                      alignItems: 'center',
                      minHeight: TAP_MIN,
                      justifyContent: 'center',
                      paddingVertical: spacing.xs,
                      borderRadius: radius.sm,
                      backgroundColor: aktif ? colors.surfaceSunken : 'transparent',
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    {s.target ? (
                      <>
                        <Text style={{ ...typography.label, fontWeight: '700', color: colors.text }}>
                          {formatAngka(s.target.target_kalori)}
                        </Text>
                        <Text style={{ ...typography.caption, fontWeight: '500', color: colors.textFaint }}>
                          P {formatMakro(s.target.target_protein_g)}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ ...typography.label, color: colors.textFaint }}>–</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </Card>

      <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>
        Angka atas: kalori (kcal). P: protein (g). Ketuk nama fase untuk melihat rinciannya, atau angka untuk menyuntingnya.
        {baris.some((b) => b.sel.some((s) => s.target === null)) ? ' Tanda – berarti target belum diisi.' : ''}
      </Text>

      {janggal.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={ukuranIkon.kecil} color={colors.textMuted} />
          <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.textMuted }}>
            {janggal.map((j) => j.kalimat).join(' ')} Periksa lagi bila tidak disengaja.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
