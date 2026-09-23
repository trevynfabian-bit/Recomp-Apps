import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BannerDataMasuk, BannerEksporSiap } from '@/components';
import { segarkanPengingat } from '@/data/pengingat';
import { PenyediaEkspor } from '@/state/ekspor';
import { PenyediaProfil } from '@/state/profil';
import { PenyediaSesi, useSesi } from '@/state/sesi';
import { PenyediaSinkron } from '@/state/sinkron';
import { PenyediaTarget } from '@/state/target';
import { colors } from '@/theme';

/**
 * Root layout. Warna dark mode disetel eksplisit lewat `screenOptions`
 * (bukan tema react-navigation) supaya palet PRD berlaku di semua layar.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PenyediaSesi>
        <TumpukanAkar />
      </PenyediaSesi>
    </SafeAreaProvider>
  );
}

/**
 * Sesi memilih tumpukan: `Stack.Protected` membuat layar app TIDAK ADA bagi
 * yang keluar (tautan dalam ke /ukuran berakhir di layar masuk), dan layar
 * masuk tidak ada bagi yang sudah masuk. Keluar dari layar mana pun langsung
 * kembali ke layar masuk tanpa tiap layar memeriksanya sendiri.
 */
function TumpukanAkar() {
  const { status, pengguna } = useSesi();
  const sudahMasuk = status === 'masuk';

  // Jadwal pengingat disegarkan saat app dibuka dan setiap kali kembali ke
  // depan: hari bisa berganti, dan berat bisa masuk dari perangkat lain.
  // Hanya selama masuk — keluar membatalkan semuanya (`useSesi().keluar`).
  useEffect(() => {
    if (!sudahMasuk) return;
    const segarkan = () => void segarkanPengingat().catch(() => undefined);
    segarkan();
    const langganan = AppState.addEventListener('change', (s) => {
      if (s === 'active') segarkan();
    });
    return () => langganan.remove();
  }, [sudahMasuk]);

  // Sesi tersimpan sedang dibaca: layar kosong sewarna latar, bukan kilasan
  // layar masuk yang lalu hilang.
  if (status === 'memuat') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // State per akun dimulai dari nol setiap pengguna berganti (termasuk
  // keluar): akun berikutnya di perangkat ini tidak mewarisi profil, target,
  // koneksi, atau kiriman yang belum dibaca dari akun sebelumnya.
  return (
    <PenyediaProfil key={pengguna?.id ?? 'tamu'}>
      <PenyediaTarget>
        <PenyediaEkspor>
          <PenyediaSinkron>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Protected guard={sudahMasuk}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="ukuran" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="sumber-data" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="latihan" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="impor-riwayat" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="widget-pengingat" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="target-harian" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="privasi" options={{ animation: 'slide_from_right' }} />
              </Stack.Protected>
              <Stack.Protected guard={!sudahMasuk}>
                <Stack.Screen name="masuk" options={{ animation: 'fade' }} />
              </Stack.Protected>
            </Stack>
            {/* Di atas semua layar: kiriman Realtime bisa tiba di layar mana pun. */}
            {sudahMasuk ? <BannerDataMasuk /> : null}
            {/* Berkas ekspor yang selesai setelah sheet-nya ditutup. */}
            {sudahMasuk ? <BannerEksporSiap /> : null}
          </PenyediaSinkron>
        </PenyediaEkspor>
      </PenyediaTarget>
    </PenyediaProfil>
  );
}
