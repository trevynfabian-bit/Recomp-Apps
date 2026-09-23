import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BannerDataMasuk } from '@/components';
import { segarkanPengingat } from '@/data/pengingat';
import { PenyediaProfil } from '@/state/profil';
import { PenyediaSinkron } from '@/state/sinkron';
import { colors } from '@/theme';

/**
 * Root layout. Warna dark mode disetel eksplisit lewat `screenOptions`
 * (bukan tema react-navigation) supaya palet PRD berlaku di semua layar.
 */
export default function RootLayout() {
  // Jadwal pengingat disegarkan saat app dibuka dan setiap kali kembali ke
  // depan: hari bisa berganti, dan berat bisa masuk dari perangkat lain.
  useEffect(() => {
    const segarkan = () => void segarkanPengingat().catch(() => undefined);
    segarkan();
    const langganan = AppState.addEventListener('change', (s) => {
      if (s === 'active') segarkan();
    });
    return () => langganan.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <PenyediaProfil>
        <PenyediaSinkron>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="ukuran" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="sumber-data" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="latihan" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="impor-riwayat" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="widget-pengingat" options={{ animation: 'slide_from_right' }} />
          </Stack>
          {/* Di atas semua layar: kiriman Realtime bisa tiba di layar mana pun. */}
          <BannerDataMasuk />
        </PenyediaSinkron>
      </PenyediaProfil>
    </SafeAreaProvider>
  );
}
