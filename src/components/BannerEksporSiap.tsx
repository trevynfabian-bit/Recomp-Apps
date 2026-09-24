import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOTIF_EKSPOR_SIAP } from '@recomp/logika';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { useEkspor } from '@/state/ekspor';
import { BAYANGAN_MELAYANG, colors, radius, spacing, TAP_MIN, typography, ukuranIkon } from '@/theme';

/**
 * Pemberitahuan "ekspor data siap" di dalam app, untuk berkas yang selesai
 * disiapkan setelah sheet ekspornya ditutup.
 *
 * Tidak menutup sendiri seperti banner data masuk: ada tindakan yang
 * ditunggu, dan pemberitahuan yang hilang sebelum dibaca membuat berkasnya
 * seolah tidak pernah jadi. Bisa ditutup kapan saja; berkasnya tetap siap di
 * sheet ekspor. Pembaca layar mendapat pengumuman yang sama.
 */
export function BannerEksporSiap() {
  const insets = useSafeAreaInsets();
  const { status, perluDiberitahu, tutupPemberitahuan, serahkan } = useEkspor();
  const [memproses, setMemproses] = useState(false);
  const [gagal, setGagal] = useState(false);
  const tampil = perluDiberitahu && status.jenis === 'siap';
  const web = Platform.OS === 'web';

  useEffect(() => {
    if (!tampil) return;
    setGagal(false);
    AccessibilityInfo.announceForAccessibility(`${NOTIF_EKSPOR_SIAP.judul}. ${NOTIF_EKSPOR_SIAP.isi}`);
  }, [tampil]);

  if (!tampil) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', bottom: insets.bottom + 72, left: spacing.lg, right: spacing.lg }}
    >
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.xs,
          paddingVertical: spacing.sm,
          borderRadius: radius.lg,
          backgroundColor: colors.permukaan,
          borderWidth: 1,
          borderColor: colors.garisKontrol,
          ...BAYANGAN_MELAYANG,
        }}
      >
        <Ionicons name="document-attach-outline" size={ukuranIkon.baris} color={colors.teksRedup} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={{ ...typography.label, color: colors.teks }}>{NOTIF_EKSPOR_SIAP.judul}</Text>
          <Text style={{ ...typography.caption, color: gagal ? colors.status.bahaya.teks : colors.teksRedup }}>
            {gagal ? `Belum bisa ${web ? 'diunduh' : 'dibagikan'}; coba lagi.` : 'Berisi data kesehatan Anda.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={web ? 'Unduh berkas ekspor' : 'Bagikan berkas ekspor'}
          accessibilityState={{ busy: memproses, disabled: memproses }}
          disabled={memproses}
          onPress={async () => {
            ketukRingan();
            setMemproses(true);
            try {
              await serahkan();
              ketukBerhasil();
            } catch {
              setGagal(true);
            } finally {
              setMemproses(false);
            }
          }}
          style={({ pressed }) => ({
            minHeight: TAP_MIN,
            paddingHorizontal: spacing.md,
            justifyContent: 'center',
            opacity: pressed || memproses ? 0.6 : 1,
          })}
        >
          <Text style={{ ...typography.label, color: colors.aksen.teks }}>{web ? 'Unduh' : 'Bagikan'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup pemberitahuan ekspor"
          onPress={() => {
            ketukRingan();
            tutupPemberitahuan();
          }}
          style={({ pressed }) => ({
            width: TAP_MIN,
            height: TAP_MIN,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close" size={ukuranIkon.sedang} color={colors.teksRedup} />
        </Pressable>
      </View>
    </View>
  );
}
