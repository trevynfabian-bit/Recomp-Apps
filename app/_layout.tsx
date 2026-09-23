import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BannerDataMasuk } from '@/components';
import { PenyediaProfil } from '@/state/profil';
import { PenyediaSinkron } from '@/state/sinkron';
import { colors } from '@/theme';

/**
 * Root layout. Warna dark mode disetel eksplisit lewat `screenOptions`
 * (bukan tema react-navigation) supaya palet PRD berlaku di semua layar.
 */
export default function RootLayout() {
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
          </Stack>
          {/* Di atas semua layar: kiriman Realtime bisa tiba di layar mana pun. */}
          <BannerDataMasuk />
        </PenyediaSinkron>
      </PenyediaProfil>
    </SafeAreaProvider>
  );
}
