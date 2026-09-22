import { Text, View } from 'react-native';
import { METADATA_SUMBER } from '@/lib/sumber';
import { colors, radius, spacing, typography } from '@/theme';
import type { JenisSumber } from '@/types/domain';

type Props = {
  jenis: JenisSumber;
  /** `pill` untuk kartu longgar, `inline` untuk baris daftar yang padat. */
  tampilan?: 'inline' | 'pill';
  /** Teks tambahan setelah label, mis. nama layanan sumbernya. */
  detail?: string;
};

/**
 * Penanda asal angka: titik berwarna + label.
 * Warna & kata-katanya berasal dari satu sumber (`METADATA_SUMBER`), jadi
 * "Estimasi" tampak sama di mana pun ia muncul.
 */
export function PenandaSumber({ jenis, tampilan = 'inline', detail }: Props) {
  const meta = METADATA_SUMBER[jenis];
  const teks = detail ? `${meta.label} · ${detail}` : meta.label;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs + 1,
        alignSelf: 'flex-start',
        ...(tampilan === 'pill'
          ? {
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: 3,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: meta.warna + '55',
              backgroundColor: meta.warna + '1A',
            }
          : null),
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.warna }} />
      <Text style={{ ...typography.caption, color: meta.warna }}>{teks}</Text>
    </View>
  );
}

/** Keterangan arti tiap penanda, ditaruh sekali di bagian bawah layar. */
export function LegendaSumber() {
  const urutan: JenisSumber[] = ['manual', 'sinkron', 'estimasi'];

  return (
    <View style={{ gap: spacing.md }}>
      {urutan.map((jenis) => (
        <View key={jenis} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <View style={{ paddingTop: 5 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: METADATA_SUMBER[jenis].warna,
              }}
            />
          </View>
          <Text style={{ ...typography.caption, color: colors.textFaint, flex: 1, lineHeight: 16 }}>
            <Text style={{ color: METADATA_SUMBER[jenis].warna }}>
              {METADATA_SUMBER[jenis].label}
            </Text>
            {' — '}
            {METADATA_SUMBER[jenis].penjelasan}
          </Text>
        </View>
      ))}
    </View>
  );
}
