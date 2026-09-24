import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatJam, isiWidgetLingkar, teksWidget, teksWidgetSebaris } from '@recomp/logika';
import type { RingkasanWidget } from '@recomp/logika';
import { colors, layarKunci, radius, spacing, typography } from '@/theme';

type Props = {
  ringkasan: RingkasanWidget;
  tampilkanAngka: boolean;
  /** Untuk label "Sisa per 07.12" saat angkanya sudah lebih dari sejam. */
  sekarang?: Date;
};

/* Warna, huruf, dan ukuran layar kunci: `layarKunci` di src/theme (monokrom, tidak ikut skema). */
const { warna, huruf, ukuran } = layarKunci;

/**
 * Pratinjau widget layar kunci: tiga ukuran iOS dalam satu layar kunci tiruan.
 *   • sebaris  — di atas jam: "1.120 kcal · 57 g protein";
 *   • bundar   — cincin porsi target yang terpakai + sisa di tengah;
 *   • persegi  — judul + dua baris.
 *
 * Semua teksnya dari fungsi @recomp/logika yang SAMA dengan yang ditiru widget
 * native (`targets/widget/TeksWidget.swift`), jadi yang terlihat di sini adalah
 * yang terlihat di iPhone — termasuk saat angka disembunyikan.
 */
export function PratinjauWidget({ ringkasan, tampilkanAngka, sekarang }: Props) {
  const persegi = teksWidget(ringkasan, tampilkanAngka, sekarang);
  const sebaris = teksWidgetSebaris(ringkasan, tampilkanAngka);
  const lingkar = isiWidgetLingkar(ringkasan, tampilkanAngka);

  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: warna.latar,
      }}
    >
      <Text
        accessibilityLabel={`Pratinjau widget sebaris: ${sebaris}`}
        numberOfLines={1}
        style={{ ...typography.label, color: warna.teksRedup }}
      >
        {sebaris}
      </Text>
      <Text style={{ ...huruf.jam, color: warna.jam }}>
        {formatJam(new Date().toISOString())}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, alignItems: 'center' }}>
        <WidgetLingkar
          angka={lingkar.angka}
          satuan={lingkar.satuan}
          terpakai={lingkar.terpakai}
          aksesLabel={lingkar.aksesLabel}
        />
        <View
          accessible
          accessibilityLabel={`Pratinjau widget persegi: ${persegi.aksesLabel}`}
          style={{
            width: ukuran.persegiLebar,
            minHeight: ukuran.persegiTinggiMin,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: warna.isian,
            gap: ukuran.jarakBaris,
          }}
        >
          <Text style={{ ...typography.caption, color: warna.teksRedup, textTransform: 'uppercase' }}>
            {persegi.judul}
          </Text>
          <Text numberOfLines={1} style={{ ...typography.label, color: warna.teks }}>{persegi.baris1}</Text>
          <Text numberOfLines={1} style={{ ...typography.label, ...huruf.barisKedua, color: warna.teksRedup }}>
            {persegi.baris2}
          </Text>
        </View>
      </View>

      {tampilkanAngka && ringkasan.dihitungPada ? (
        <Text style={{ ...typography.caption, color: colors.teksSamar, marginTop: spacing.md }}>
          dihitung server {formatJam(ringkasan.dihitungPada)}
        </Text>
      ) : null}
    </View>
  );
}

const UKURAN_LINGKAR = ukuran.cincin;
const TEBAL = ukuran.tebalCincin;

function WidgetLingkar({
  angka,
  satuan,
  terpakai,
  aksesLabel,
}: {
  angka: string;
  satuan: string;
  terpakai: number | null;
  aksesLabel: string;
}) {
  const r = (UKURAN_LINGKAR - TEBAL) / 2;
  const keliling = 2 * Math.PI * r;
  return (
    <View
      accessible
      accessibilityLabel={`Pratinjau widget bundar: ${aksesLabel}`}
      style={{ width: UKURAN_LINGKAR, height: UKURAN_LINGKAR, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={UKURAN_LINGKAR} height={UKURAN_LINGKAR} style={{ position: 'absolute' }}>
        <Circle cx={UKURAN_LINGKAR / 2} cy={UKURAN_LINGKAR / 2} r={r} stroke={warna.isian} strokeWidth={TEBAL} fill="none" />
        {/* Busur nol tidak digambar: ujung bulat pada panjang nol menjadi titik. */}
        {terpakai !== null && terpakai > 0 ? (
          <Circle
            cx={UKURAN_LINGKAR / 2}
            cy={UKURAN_LINGKAR / 2}
            r={r}
            stroke={warna.teks}
            strokeWidth={TEBAL}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${keliling * terpakai} ${keliling}`}
            // Mulai dari jam 12, searah jarum jam — seperti gauge iOS.
            transform={`rotate(-90 ${UKURAN_LINGKAR / 2} ${UKURAN_LINGKAR / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={{ ...typography.label, ...huruf.angkaCincin, color: warna.teks }}>{angka}</Text>
      <Text style={{ ...huruf.satuanCincin, color: warna.teksRedup }}>{satuan}</Text>
    </View>
  );
}
