import { Text, View } from 'react-native';
import { formatAngka, formatMakro } from '@recomp/logika';
import type { Fase } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi } from './Tombol';
import { colors, spacing, typography } from '@/theme';
import type { DayType, DayTypeTarget } from '@/types/domain';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  fase: Fase;
  daftar: DayType[];
  target: DayTypeTarget[];
};

/**
 * Target per tipe hari untuk fase aktif — angka ABSOLUT, bukan pengali (PRD).
 * Menyunting targetnya menyusul; di sini angkanya ditampilkan apa adanya,
 * supaya "kenapa target hari ini 2.650" bisa dijawab dari Pengaturan.
 */
export function SheetTargetTipeHari({ terbuka, onTutup, fase, daftar, target }: Props) {
  if (!terbuka) return null;
  return (
    <KerangkaSheet terbuka onTutup={onTutup} label="Target">
      <Text style={{ ...typography.title, color: colors.text }}>Target per tipe hari</Text>
      <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
        Fase {fase}. Angka absolut per tipe hari; mengganti fase menukar seluruh baris ini.
      </Text>
      <View accessibilityRole="list" style={{ gap: spacing.md }}>
        {daftar.map((d) => {
          const t = target.find((x) => x.day_type_id === d.id && x.fase === fase);
          return (
            <View
              key={d.id}
              accessible
              accessibilityLabel={
                t
                  ? `${d.nama}: ${formatAngka(t.target_kalori)} kilokalori, protein ${formatMakro(t.target_protein_g)} gram, lemak ${formatMakro(t.target_lemak_g)} gram`
                  : `${d.nama}: belum ada target`
              }
              style={{ gap: 2, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>
                  {d.nama}
                  {d.is_default ? <Text style={{ color: colors.textFaint, fontWeight: '500' }}> · bawaan</Text> : null}
                </Text>
                <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>
                  {t ? `${formatAngka(t.target_kalori)} kcal` : '–'}
                </Text>
              </View>
              {t ? (
                <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
                  Protein {formatMakro(t.target_protein_g)} g · Lemak {formatMakro(t.target_lemak_g)} g · Sat fat ≤
                  {formatMakro(t.batas_sat_fat_g)} g
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <TombolBertepi label="Tutup" onPress={onTutup} />
    </KerangkaSheet>
  );
}
