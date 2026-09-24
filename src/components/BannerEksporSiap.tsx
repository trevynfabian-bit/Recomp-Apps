import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOTIF_EKSPOR_SIAP } from '@recomp/logika';
import { ketukBerhasil } from '@/lib/haptics';
import { useEkspor } from '@/state/ekspor';
import { bayangan, colors, radius, spacing, typography, ukuran, ukuranIkon } from '@/theme';
import { Tombol, TombolIkon } from './Tombol';

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
      style={{ position: 'absolute', bottom: insets.bottom + ukuran.bilahTab + spacing.xl, left: spacing.lg, right: spacing.lg }}
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
          ...bayangan.melayang,
        }}
      >
        <Ionicons name="document-attach-outline" size={ukuranIkon.baris} color={colors.teksRedup} />
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text style={{ ...typography.label, color: colors.teks }}>{NOTIF_EKSPOR_SIAP.judul}</Text>
          <Text style={{ ...typography.caption, color: gagal ? colors.status.bahaya.teks : colors.teksRedup }}>
            {gagal ? `Belum bisa ${web ? 'diunduh' : 'dibagikan'}; coba lagi.` : 'Berisi data kesehatan Anda.'}
          </Text>
        </View>
        <Tombol
          varian="teks"
          ukuran="kecil"
          label={web ? 'Unduh' : 'Bagikan'}
          aksesLabel={web ? 'Unduh berkas ekspor' : 'Bagikan berkas ekspor'}
          memproses={memproses}
          onPress={async () => {
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
        />
        <TombolIkon bentuk="polos" ikon="close" aksesLabel="Tutup pemberitahuan ekspor" onPress={tutupPemberitahuan} />
      </View>
    </View>
  );
}
