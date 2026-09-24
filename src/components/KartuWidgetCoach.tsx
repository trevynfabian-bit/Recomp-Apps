import Svg, { Circle, Path } from 'react-native-svg';
import { Text, View } from 'react-native';
import { formatMakro, rasio } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';
import type { WidgetCoach } from '@/types/domain';
import { colors, radius, spacing, typography, ukuran } from '@/theme';

/** Ukuran sparkline; cukup untuk melihat bentuk, bukan untuk membaca nilai. */
const SPARK_LEBAR = 88;
const SPARK_TINGGI = 28;

type Props = {
  widget: WidgetCoach;
};

/**
 * Kartu angka yang dirender app atas permintaan coach.
 *
 * Alasan kartu ini ada, bukan sekadar angka di dalam kalimat: coach TIDAK
 * menghitung sendiri. Ia memanggil fungsi, app yang menghitung dari data asli,
 * dan hasilnya dikembalikan sebagai kartu. Angka di chat karena itu dijamin
 * sama persis dengan angka di layar Tren atau Log Harian — tidak ada ruang bagi
 * model untuk salah menyalin satu digit, dan itu jenis kesalahan yang paling
 * sulit disadari pembacanya.
 *
 * Nama fungsinya ikut dicetak, redup, di kaki kartu. Kalau suatu saat angkanya
 * terasa aneh, itu satu-satunya cara melacak dari mana ia datang.
 */
export function KartuWidgetCoach({ widget }: Props) {
  return (
    <View
      style={{
        maxWidth: '88%',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {widget.jenis === 'angka' ? <IsiAngka widget={widget} /> : <IsiMakro widget={widget} />}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <PenandaSumber jenis={widget.sumber} />
        <Text style={{ ...typography.caption, color: colors.textFaint, flex: 1 }}>
          · dihitung app lewat {widget.fungsi}
        </Text>
      </View>
    </View>
  );
}

/** Stat tile: label, angka besar, delta, plus sparkline bila deretnya ada. */
function IsiAngka({ widget }: { widget: Extract<WidgetCoach, { jenis: 'angka' }> }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        {widget.label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flex: 1 }}>
          <Text style={{ ...typography.display, color: colors.text }}>{widget.nilai}</Text>
          <Text style={{ ...typography.label, color: colors.textFaint }}>{widget.unit}</Text>
        </View>

        {widget.deret && widget.deret.length > 1 ? <Sparkline nilai={widget.deret} /> : null}
      </View>

      {widget.delta ? (
        <Text style={{ ...typography.label, color: warnaDelta(widget.arahDelta) }}>
          {widget.delta}
        </Text>
      ) : null}

      {widget.keterangan ? (
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          {widget.keterangan}
        </Text>
      ) : null}
    </View>
  );
}

/** Baris makro dengan bar terpakai/target. */
function IsiMakro({ widget }: { widget: Extract<WidgetCoach, { jenis: 'makro' }> }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        {widget.label}
      </Text>

      {widget.baris.map((b) => {
        const isi = rasio(b.terpakai, b.target);
        return (
          <View key={b.nama} style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text style={{ ...typography.caption, color: colors.macroTeks[b.kunci] }}>
                {b.nama}
              </Text>
              <Text style={{ ...typography.caption, color: colors.textMuted }}>
                {formatMakro(b.terpakai)} / {formatMakro(b.target)}
              </Text>
            </View>
            {/* Track memakai surfaceSunken, sama seperti MacroRow — bukan tint
                hue-nya sendiri. Tint 18% cuma memberi 2,7:1 terhadap isiannya
                pada karbo dan sat fat, jadi batas "sudah terpakai" justru
                menghilang pada dua makro yang paling perlu diawasi. */}
            <View
              style={{
                height: ukuran.track,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceSunken,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${isi * 100}%`,
                  height: '100%',
                  borderRadius: radius.pill,
                  backgroundColor: colors.macro[b.kunci],
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Sparkline: bentuk deret, bukan nilainya.
 *
 * Tanpa sumbu dan tanpa label angka — itu memang bukan tugasnya; angka
 * pentingnya sudah dicetak besar di sebelahnya. Titik terakhir diberi cincin
 * warna permukaan supaya tetap terbaca saat ia menimpa garisnya sendiri.
 */
function Sparkline({ nilai }: { nilai: number[] }) {
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);
  const rentang = maks - min || 1;
  const x = (i: number) => (SPARK_LEBAR * i) / (nilai.length - 1);
  const y = (n: number) => 3 + (SPARK_TINGGI - 6) * (1 - (n - min) / rentang);
  const jalur = nilai.map((n, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(n)}`).join(' ');

  return (
    <Svg width={SPARK_LEBAR} height={SPARK_TINGGI}>
      <Path
        d={jalur}
        stroke={colors.amber}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <Circle
        cx={x(nilai.length - 1)}
        cy={y(nilai[nilai.length - 1])}
        r={4}
        fill={colors.amber}
        stroke={colors.surface}
        strokeWidth={2}
      />
    </Svg>
  );
}

/**
 * Warna delta mengikuti ARAH TUJUAN, bukan tanda plus/minus.
 *
 * Naik 0,3 kg itu yang diinginkan saat Lean Gain dan tidak diinginkan saat Cut;
 * mewarnai semua kenaikan merah akan menyesatkan separuh pengguna. Karena itu
 * arahnya ditentukan pengirim kartu, bukan disimpulkan dari tandanya.
 */
function warnaDelta(arah: 'sesuai' | 'berlawanan' | 'netral' | undefined): string {
  if (arah === 'sesuai') return colors.aksenTeks.jade;
  if (arah === 'berlawanan') return colors.amber;
  return colors.textMuted;
}
