import { Text, View } from 'react-native';
import { formatRentangTanggal, PEKAN_EVALUASI, type ArahMetrik } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';
import { Pill } from './Pill';
import type { EvaluasiEmpatPekan } from '@/types/domain';
import { colors, spacing, typography } from '@/theme';
import { Card, Panel } from './Card';

type Props = {
  evaluasi: EvaluasiEmpatPekan;
};

/**
 * Kartu verdict evaluasi 4 mingguan.
 *
 * Ketiga sumbu ditampilkan LEBIH DULU, verdict menyusul. "Kenaikan didominasi
 * lemak" tanpa angka di belakangnya adalah vonis yang tidak bisa diperiksa;
 * dengan arah berat, pinggang, dan kekuatan terlihat, pembaca bisa menilai
 * sendiri apakah kesimpulannya masuk akal — dan itu yang membuat
 * rekomendasinya layak diikuti alih-alih sekadar dipercaya.
 *
 * Tingkat keyakinan dicetak di sebelah verdict, bukan disembunyikan di kaki
 * kartu: verdict berkeyakinan rendah dan tinggi menuntut tindakan yang berbeda,
 * dan itu perlu terbaca bersamaan dengan verdictnya.
 */
export function KartuVerdictEvaluasi({ evaluasi }: Props) {
  const { hasil } = evaluasi;

  return (
    <Card bayangan={false} style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Evaluasi {PEKAN_EVALUASI} mingguan
        </Text>
        <Text style={{ ...typography.bodyTebal, color: colors.teks }}>
          {formatRentangTanggal(evaluasi.periode.dari, evaluasi.periode.sampai)}
        </Text>
      </View>

      {/* Sumbu dulu: dasar kesimpulannya harus bisa diperiksa. */}
      <View style={{ gap: spacing.md }}>
        {evaluasi.sumbu.map((s) => (
          <View
            key={s.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            {/* Panah SELALU berpasangan dengan katanya — bentuk saja tidak
                cukup, dan warna saja apalagi. */}
            <Text style={{ ...typography.title, color: colors.teksRedup, width: 20 }}>
              {panah(s.arah)}
            </Text>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={{ ...typography.label, color: colors.teks }}>
                {s.label} {kataArah(s.arah)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ ...typography.caption, color: colors.teksSamar }}>{s.nilai}</Text>
                <PenandaSumber jenis={s.sumber} />
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Verdict */}
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.title, color: colors.teks, flex: 1 }}>{hasil.judul}</Text>
          <Pill diKartu label={`KEYAKINAN ${hasil.keyakinan.toUpperCase()}`} warna={warnaKeyakinan(hasil.keyakinan)} />
        </View>
        <Text style={{ ...typography.body, color: colors.teksRedup }}>
          {hasil.ringkas}
        </Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Penentu: {hasil.penentu}
        </Text>
      </View>

      <Panel style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Rekomendasi
        </Text>
        <Text style={{ ...typography.body, color: colors.teks }}>
          {hasil.rekomendasi}
        </Text>
      </Panel>
    </Card>
  );
}

function panah(arah: ArahMetrik): string {
  if (arah === 'naik') return '↑';
  if (arah === 'turun') return '↓';
  if (arah === 'datar') return '→';
  return '?';
}

function kataArah(arah: ArahMetrik): string {
  return arah === 'belum jelas' ? 'belum terbaca' : arah;
}

/**
 * Keyakinan rendah diberi warna amber, bukan merah: ia bukan kesalahan,
 * melainkan pemberitahuan bahwa datanya belum cukup untuk bertindak jauh.
 */
function warnaKeyakinan(keyakinan: 'rendah' | 'sedang' | 'tinggi'): string {
  if (keyakinan === 'tinggi') return colors.status.sukses.teks;
  if (keyakinan === 'sedang') return colors.teksRedup;
  return colors.status.peringatan.teks;
}
