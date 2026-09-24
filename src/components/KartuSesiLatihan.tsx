import { Fragment } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { formatAngka, formatBeban, formatJam, ringkasSesi } from '@recomp/logika';
import type { SesiLatihan } from '@recomp/logika';
import { Card, Pemisah } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { METADATA_SUMBER } from '@/lib/sumber';
import { colors, spacing, TAP_MIN, typography, ukuranIkon } from '@/theme';

type Props = {
  sesi: SesiLatihan;
  terbuka: boolean;
  onAlih: () => void;
};

/**
 * Satu sesi dari Hevy: ringkasan di kepala kartu, rincian per latihan saat
 * dibuka.
 *
 * Tertutup secara bawaan (kecuali sesi terbaru, yang dibuka layar): daftar
 * lima sesi yang semuanya terbuka adalah dinding set dan repetisi, dan yang
 * dicari orang di layar ini biasanya satu hal — "sesi kemarin berapa set?"
 * atau "bench saya naik tidak?".
 *
 * e1RM ditulis dengan warna dan label ESTIMASI di setiap baris, bukan hanya
 * dijelaskan sekali di bawah: ia hasil rumus, bukan beban yang pernah
 * diangkat, dan pembaca yang melompat langsung ke satu baris tetap harus bisa
 * membedakannya dari set yang benar-benar dilakukan.
 */
export function KartuSesiLatihan({ sesi, terbuka, onAlih }: Props) {
  const r = ringkasSesi(sesi);
  const estimasi = METADATA_SUMBER.estimasi;

  return (
    <Card flat>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: terbuka }}
        accessibilityLabel={`${sesi.nama}, ${formatJam(sesi.mulai)}, ${sesi.durasi_menit} menit, ${r.jumlahLatihan} latihan, ${r.jumlahSet} set, volume ${formatAngka(r.volumeKg)} kilogram`}
        accessibilityHint={terbuka ? 'Menutup rincian latihan' : 'Membuka rincian latihan'}
        onPress={() => {
          ketukRingan();
          onAlih();
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: TAP_MIN,
          padding: spacing.lg,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{sesi.nama}</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            {formatJam(sesi.mulai)} · {sesi.durasi_menit} menit · {r.jumlahLatihan} latihan · {r.jumlahSet} set
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{formatAngka(r.volumeKg)} kg</Text>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>volume</Text>
        </View>
        <Ionicons
          name={terbuka ? 'chevron-up' : 'chevron-down'}
          size={ukuranIkon.kecil}
          color={colors.teksSamar}
          accessibilityElementsHidden
        />
      </Pressable>

      {terbuka ? (
        <View>
          {r.latihan.map((l, i) => (
            <Fragment key={`${l.latihan}-${i}`}>
              {/* Pemisah penuh di bawah kepala kartu, bertakuk di antara latihan. */}
              <Pemisah arah={i === 0 ? 'penuh' : 'horizontal'} />
              <View
                accessible
                accessibilityLabel={
                  `${l.latihan}: ${l.set}.` +
                  (l.e1rmKg !== null ? ` e1RM estimasi ${formatBeban(l.e1rmKg)} dari ${l.setTerbaik}.` : '')
                }
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={{ ...typography.label, color: colors.teks }}>{l.latihan}</Text>
                  <Text
                    style={{
                      ...typography.labelBiasa,
                      color: colors.teksRedup,
                    }}
                  >
                    {l.set}
                  </Text>
                </View>
                {l.e1rmKg !== null ? (
                  <View style={{ alignItems: 'flex-end', gap: spacing.xxs }}>
                    <Text style={{ ...typography.label, color: colors.teks }}>≈ {formatBeban(l.e1rmKg)}</Text>
                    <Text style={{ ...typography.caption, color: estimasi.warna }}>e1RM · estimasi</Text>
                  </View>
                ) : null}
              </View>
            </Fragment>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
