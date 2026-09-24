import { Text, View } from 'react-native';
import type { KecukupanTren } from '@recomp/logika';
import { JENDELA_HARI } from '@recomp/logika';
import { colors, radius, spacing, typography, ukuran } from '@/theme';

type Props = {
  kecukupan: KecukupanTren;
  /** `rataRata` menjelaskan dasar rata-rata; `arah` menjelaskan sinyal arah. */
  untuk: 'rataRata' | 'arah';
};

/**
 * Keterangan sejujurnya saat data masih tipis.
 *
 * Angkanya TETAP ditampilkan, bukan disembunyikan: layar kosong membuat
 * pengguna baru mengira app-nya rusak, sementara angka tanpa keterangan
 * membuatnya percaya pada dasar yang terlalu tipis. Yang benar adalah
 * menampilkan keduanya — angkanya dan seberapa tipis dasarnya.
 *
 * Tidak menampilkan apa pun kalau datanya memang sudah cukup, supaya
 * keterangan ini tidak jadi bising permanen.
 */
export function CatatanKecukupan({ kecukupan, untuk }: Props) {
  const pesan = susunPesan(kecukupan, untuk);
  if (!pesan) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <View
        style={{
          width: ukuran.titikKecil,
          height: ukuran.titikKecil,
          borderRadius: radius.pill,
          backgroundColor: colors.textFaint,
          marginTop: 5,
        }}
      />
      <Text style={{ ...typography.caption, color: colors.textFaint, flex: 1 }}>
        {pesan}
      </Text>
    </View>
  );
}

function susunPesan(k: KecukupanTren, untuk: 'rataRata' | 'arah'): string | null {
  if (!k.adaTimbangan) {
    return untuk === 'rataRata'
      ? 'Belum ada timbangan sama sekali. Catat berat pagi pertama Anda, dan grafik ini mulai terisi besok.'
      : null;
  }

  if (untuk === 'rataRata') {
    if (k.jendelaPenuh) return null;
    const n = k.jumlahDalamJendela;
    return (
      `Rata-rata ini berdasar ${n} dari ${JENDELA_HARI} hari. Semakin banyak hari yang ` +
      `ditimbang, semakin sedikit ia terpengaruh satu hari yang aneh.`
    );
  }

  if (k.cukupArah) return null;
  const lagi = k.hariLagiUntukArah;
  return (
    'Sinyal arah membandingkan rata-rata pekan ini dengan rata-rata pekan lalu, ' +
    `jadi ia butuh timbangan di dua pekan berbeda. ` +
    (lagi && lagi > 0
      ? `Kira-kira ${lagi} hari lagi bila Anda terus timbang pagi.`
      : 'Terus timbang pagi, angka ini muncul sendiri.')
  );
}
