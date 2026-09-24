import { Pressable, Text, View } from 'react-native';
import { formatDesimal, formatMakro, type Fase, type StatusBatasPinggang } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

type Props = {
  status: StatusBatasPinggang;
  batasCm: number | null;
  pinggangCm: number;
  /** Fase aktif; menentukan apakah batas ini sedang relevan. */
  fase: Fase;
  /** Membuka pengaturan batas. */
  onUbahBatas: () => void;
  /** Membuka layar Budget tempat fase diganti. */
  onLihatFase: () => void;
};

/**
 * Banner peringatan pinggang terhadap batas.
 *
 * Muncul HANYA saat ada yang perlu diputuskan — lewat batas, atau menuju ke
 * sana dalam beberapa pekan. Banner "aman" yang selalu tampil akan terbaca
 * sebagai hiasan dalam seminggu, dan saat akhirnya berubah jadi peringatan,
 * matanya sudah terlatih melewatinya.
 *
 * Nadanya tetap deskriptif. Ini garis yang PENGGUNA tetapkan sendiri, jadi
 * banner ini mengembalikan keputusannya kepada dia, bukan memberi vonis:
 * menaikkan batas dan beralih ke Cut sama-sama pilihan yang sah, dan keduanya
 * disediakan sebagai tombol.
 */
export function BannerBatasPinggang({
  status,
  batasCm,
  pinggangCm,
  fase,
  onUbahBatas,
  onLihatFase,
}: Props) {
  if (status.keadaan === 'aman' || status.keadaan === 'belum-ditetapkan' || batasCm === null) {
    return null;
  }

  const lewat = status.keadaan === 'lewat';
  const dasar = lewat ? colors.coral : colors.amber;
  const teksJudul = lewat ? colors.aksenTeks.coral : colors.amber;

  const judul = lewat
    ? status.selisihCm === 0
      ? `Pinggang pas di batas ${formatDesimal(batasCm)} cm`
      : `Pinggang ${formatDesimal(status.selisihCm!)} cm di atas batas Anda`
    : `Sisa ${formatDesimal(Math.abs(status.selisihCm!))} cm sampai batas`;

  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: dasar + '55',
        backgroundColor: dasar + '14',
      }}
    >
      {/* Bentuk + teks, bukan warna saja: peringatan tidak boleh hanya terbaca
          oleh yang bisa membedakan coral dari amber. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ ...typography.body, color: teksJudul }}>{lewat ? '▲' : '●'}</Text>
        <Text style={{ ...typography.bodyTebal, color: teksJudul, flex: 1 }}>
          {judul}
        </Text>
      </View>

      <Text style={{ ...typography.caption, color: colors.textFaint }}>
        Pinggang terakhir {formatDesimal(pinggangCm)} cm, batas yang Anda tetapkan{' '}
        {formatDesimal(batasCm)} cm.
        {status.lajuPerPekan !== null && status.lajuPerPekan !== 0
          ? ` Beberapa pencatatan terakhir bergerak ${teksLaju(status.lajuPerPekan)} cm per pekan.`
          : ''}
        {!lewat && status.pekanLagi !== null
          ? // formatMakro: 2 pekan, bukan "2,0 pekan" — desimal di sini
            // menyiratkan ketelitian yang tidak dimiliki perkiraan ini.
            ` Dengan laju itu, batasnya tercapai sekitar ${formatMakro(status.pekanLagi)} pekan lagi.`
          : ''}
      </Text>

      <Text style={{ ...typography.caption, color: colors.textFaint }}>
        {pesanKeputusan(lewat, fase)}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TombolAksi
          label={fase === 'Cut' ? 'Lihat fase' : 'Fase & budget'}
          utama={lewat}
          warna={dasar}
          onPress={onLihatFase}
        />
        <TombolAksi label="Ubah batas" utama={false} warna={dasar} onPress={onUbahBatas} />
      </View>
    </View>
  );
}

/**
 * Apa yang sebenarnya perlu diputuskan, sesuai fase yang sedang berjalan.
 * Saat Cut, pinggang melewati batas berarti hal yang berbeda daripada saat Lean
 * Gain — menyamakan keduanya akan memberi saran yang salah.
 */
function pesanKeputusan(lewat: boolean, fase: Fase): string {
  if (fase === 'Cut') {
    return lewat
      ? 'Anda sedang Cut, jadi batas ini belum tercapai dari arah yang diharapkan. Periksa apakah defisitnya memang berjalan di layar Budget, atau setel ulang batasnya bila sudah tidak relevan.'
      : 'Anda sedang Cut, jadi arah yang diharapkan justru menjauh dari batas. Kalau angkanya malah mendekat, periksa dulu asupan sepekan terakhir di layar Budget.';
  }

  const fasenya = fase === 'Lean Gain' ? 'Lean Gain' : 'Maintenance';
  return lewat
    ? `Ini garis yang Anda tetapkan sendiri, dan sekarang tercapai saat ${fasenya}. Dua pilihan sama-sama sah: beralih ke Cut, atau menaikkan batas secara sadar karena Anda memang bersedia menerima lebih. Yang tidak disarankan cuma membiarkannya tanpa diputuskan.`
    : `Belum tercapai, tapi arahnya ke sana saat ${fasenya}. Memutuskannya sekarang — sambil angkanya masih di bawah batas — jauh lebih mudah daripada nanti.`;
}

function teksLaju(laju: number): string {
  return `${laju > 0 ? '+' : '−'}${formatDesimal(Math.abs(laju))}`;
}

function TombolAksi({
  label,
  utama,
  warna,
  onPress,
}: {
  label: string;
  utama: boolean;
  warna: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: TAP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: utama ? warna : colors.borderKuat,
        backgroundColor: utama ? warna : 'transparent',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          ...typography.label,
          color: utama ? colors.diAtasIsian : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
