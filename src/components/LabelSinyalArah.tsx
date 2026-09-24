import { Text, View } from 'react-native';
import { arahSesuaiFase, formatDesimal } from '@recomp/logika';
import type { Fase, SinyalArah } from '@recomp/logika';
import { colors, radius, spacing, typography, ukuran } from '@/theme';

type Props = {
  sinyal: SinyalArah;
  fase: Fase;
  /** `ringkas` untuk dipakai di dalam baris stat; `penuh` untuk kartu sendiri. */
  tampilan?: 'ringkas' | 'penuh';
};

/**
 * Label arah berat sepekan.
 *
 * Menyebut arah DAN kecocokannya dengan fase. Arah saja tidak bermakna: naik
 * 0,4 kg/minggu adalah persis yang diinginkan saat Lean Gain dan persis yang
 * tidak diinginkan saat Cut. Tanpa konteks itu, pengguna harus menafsirkan
 * sendiri — dan di situlah orang salah menyimpulkan.
 *
 * Warna mengikuti KECOCOKAN, bukan arah: jade untuk sesuai rencana, amber untuk
 * berlawanan. Panah tetap menunjukkan arah sebenarnya, jadi identitas tidak
 * bergantung warna saja.
 */
export function LabelSinyalArah({ sinyal, fase, tampilan = 'penuh' }: Props) {
  const cocok = arahSesuaiFase(sinyal.arah, fase);
  const warna =
    cocok === 'sesuai'
      ? colors.aksenTeks.jade
      : cocok === 'berlawanan'
        ? colors.amber
        : colors.textMuted;

  const panah =
    sinyal.arah === 'naik' ? '↑' : sinyal.arah === 'turun' ? '↓' : sinyal.arah === 'datar' ? '→' : '·';

  const besar =
    sinyal.perubahanKg !== null ? `${formatDesimal(Math.abs(sinyal.perubahanKg))} kg` : '—';

  if (tampilan === 'ringkas') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text style={{ ...typography.label, color: warna }}>{panah}</Text>
        <Text style={{ ...typography.label, color: warna }}>{besar}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: ukuran.celahTitik,
            paddingHorizontal: spacing.md,
            paddingVertical: ukuran.chip.vertikal,
            borderRadius: radius.pill,
            backgroundColor: warna + '1A',
            borderWidth: 1,
            borderColor: warna + '55',
          }}
        >
          <Text style={{ ...typography.label, color: warna }}>{panah}</Text>
          <Text style={{ ...typography.label, color: warna }}>
            {/* `capitalize` di CSS mengubah TIAP kata; frasa seperti
                "belum cukup data" jadi salah. Cukup huruf pertama. */}
            {sinyal.arah.charAt(0).toUpperCase() + sinyal.arah.slice(1)}
          </Text>
        </View>

        {cocok !== 'belum bisa dinilai' ? (
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {kalimatKecocokan(cocok, fase)}
          </Text>
        ) : null}
      </View>

      <Text style={{ ...typography.body, color: colors.textMuted }}>
        {kalimatSinyal(sinyal)}
      </Text>
    </View>
  );
}

/** Keterangan singkat kecocokan arah terhadap fase; nadanya deskriptif. */
function kalimatKecocokan(cocok: string, fase: Fase): string {
  switch (cocok) {
    case 'sesuai':
      return `sejalan dengan fase ${fase}`;
    case 'belum bergerak':
      return `fase ${fase} mengharapkan pergerakan`;
    case 'berlawanan':
      return `berlawanan dengan fase ${fase}`;
    default:
      return '';
  }
}

/** Kalimat utama sinyal arah; menyebut ambang supaya "datar" tidak terasa ajaib. */
function kalimatSinyal(sinyal: SinyalArah): string {
  if (sinyal.perubahanKg === null) {
    return 'Belum cukup timbangan untuk membandingkan dua pekan. Terus timbang pagi, angka ini muncul sendiri.';
  }
  const besar = formatDesimal(Math.abs(sinyal.perubahanKg));
  if (sinyal.arah === 'datar') {
    return `Rata-rata bergerak ${besar} kg dalam sepekan — masih di bawah ambang ${formatDesimal(sinyal.ambangKg)} kg, jadi ini terbaca datar.`;
  }
  return `Rata-rata ${sinyal.arah} ${besar} kg dibanding pekan lalu.`;
}
