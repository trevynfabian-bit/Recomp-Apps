import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatJam, isiWidgetLingkar, teksWidget, teksWidgetSebaris } from '@recomp/logika';
import type { RingkasanWidget } from '@recomp/logika';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  ringkasan: RingkasanWidget;
  tampilkanAngka: boolean;
  /** Untuk label "Sisa per 07.12" saat angkanya sudah lebih dari sejam. */
  sekarang?: Date;
};

/*
 * Warna layar kunci. iOS menggambar widget layar kunci MONOKROM (vibrant) di
 * atas wallpaper; tiga tingkat putih transparan ini meniru itu. Tidak ada
 * aksen amber atau coral di sini dengan sengaja — pratinjau yang berwarna
 * menjanjikan warna yang tidak akan pernah muncul di layar kunci sungguhan.
 */
const PUTIH = '#FFFFFF';
const PUTIH_REDUP = '#FFFFFFB3';
const PUTIH_LATAR = '#FFFFFF24';

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
        backgroundColor: '#0B0C10',
      }}
    >
      <Text
        accessibilityLabel={`Pratinjau widget sebaris: ${sebaris}`}
        numberOfLines={1}
        style={{ ...typography.label, color: PUTIH_REDUP }}
      >
        {sebaris}
      </Text>
      <Text style={{ fontSize: 56, fontWeight: '300', color: '#E9EAEE', letterSpacing: -1.5 }}>
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
            width: 160,
            minHeight: 72,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: PUTIH_LATAR,
            gap: 1,
          }}
        >
          <Text style={{ ...typography.caption, color: PUTIH_REDUP, textTransform: 'uppercase' }}>
            {persegi.judul}
          </Text>
          <Text numberOfLines={1} style={{ ...typography.label, color: PUTIH }}>{persegi.baris1}</Text>
          <Text numberOfLines={1} style={{ ...typography.label, fontWeight: '500', color: PUTIH_REDUP }}>
            {persegi.baris2}
          </Text>
        </View>
      </View>

      {tampilkanAngka && ringkasan.dihitungPada ? (
        <Text style={{ ...typography.caption, color: colors.textFaint, marginTop: spacing.md }}>
          dihitung server {formatJam(ringkasan.dihitungPada)}
        </Text>
      ) : null}
    </View>
  );
}

/** Ukuran widget bundar layar kunci iOS, dalam pt. */
const UKURAN_LINGKAR = 72;
const TEBAL = 6;

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
        <Circle cx={UKURAN_LINGKAR / 2} cy={UKURAN_LINGKAR / 2} r={r} stroke={PUTIH_LATAR} strokeWidth={TEBAL} fill="none" />
        {/* Busur nol tidak digambar: ujung bulat pada panjang nol menjadi titik. */}
        {terpakai !== null && terpakai > 0 ? (
          <Circle
            cx={UKURAN_LINGKAR / 2}
            cy={UKURAN_LINGKAR / 2}
            r={r}
            stroke={PUTIH}
            strokeWidth={TEBAL}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${keliling * terpakai} ${keliling}`}
            // Mulai dari jam 12, searah jarum jam — seperti gauge iOS.
            transform={`rotate(-90 ${UKURAN_LINGKAR / 2} ${UKURAN_LINGKAR / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={{ ...typography.label, fontWeight: '700', color: PUTIH }}>{angka}</Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: PUTIH_REDUP }}>{satuan}</Text>
    </View>
  );
}
