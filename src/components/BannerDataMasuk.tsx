import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAngka, PROFIL_SUMBER } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';
import { useSinkron } from '@/state/sinkron';
import { bayangan, colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/** Berapa lama banner tampil sebelum menutup sendiri. */
const LAMA_TAMPIL_MS = 6000;

/**
 * Banner "data baru masuk" saat kiriman tiba lewat Realtime.
 *
 * Tanpanya, angka di layar berubah sendiri di depan mata — sisa langkah yang
 * tiba-tiba bertambah seribu terlihat seperti galat, bukan seperti sinkron.
 * Banner menyebut SUMBERNYA dengan penanda yang sama dengan di seluruh app
 * ("Sinkron · Apple Health"), jadi pembaca tahu angka itu data mentah dari
 * perangkat, bukan taksiran.
 *
 * Menutup sendiri dan bisa diketuk untuk ditutup; tidak pernah menghalangi
 * layar. Pembaca layar mendapat pengumuman yang sama lewat
 * `announceForAccessibility`, karena banner yang hanya terlihat tidak ada bagi
 * pengguna VoiceOver.
 */
export function BannerDataMasuk() {
  const insets = useSafeAreaInsets();
  const { kejadianTerbaru, tutupKejadian } = useSinkron();

  const nama = kejadianTerbaru ? PROFIL_SUMBER[kejadianTerbaru.sumber].nama : '';
  const isi = kejadianTerbaru
    ? kejadianTerbaru.masuk.map((m) => `${formatAngka(m.jumlah)} ${m.label}`).join(' · ')
    : '';

  useEffect(() => {
    if (!kejadianTerbaru) return;
    AccessibilityInfo.announceForAccessibility(`Data baru dari ${nama}: ${isi}`);
    const id = setTimeout(tutupKejadian, LAMA_TAMPIL_MS);
    return () => clearTimeout(id);
  }, [kejadianTerbaru, nama, isi, tutupKejadian]);

  if (!kejadianTerbaru) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.lg, right: spacing.lg }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Data baru dari ${nama}: ${isi}. Ketuk untuk menutup.`}
        onPress={tutupKejadian}
        style={({ pressed }) => ({
          minHeight: TAP_MIN,
          gap: spacing.xs,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.permukaan,
          borderWidth: 1,
          borderColor: colors.garisKontrol,
          opacity: pressed ? 0.8 : 1,
          ...bayangan.melayang,
        })}
      >
        <PenandaSumber jenis="sinkron" detail={nama} />
        <Text style={{ ...typography.label, color: colors.teks }}>Masuk: {isi}</Text>
      </Pressable>
    </View>
  );
}
