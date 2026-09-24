import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation } from 'expo-router';

/**
 * Menjaga layar yang punya isian belum disimpan dari SEMUA jalan keluar, bukan
 * hanya tombol kembali di header: selama `kotor`, gestur geser-kembali iOS
 * dimatikan dan tombol kembali Android memanggil `mintaKeluar` (yang
 * menampilkan konfirmasi) alih-alih langsung menutup layar.
 */
export function useJagaKeluar(kotor: boolean, mintaKeluar: () => void): void {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !kotor });
  }, [navigation, kotor]);

  useEffect(() => {
    if (!kotor) return;
    const langganan = BackHandler.addEventListener('hardwareBackPress', () => {
      mintaKeluar();
      return true;
    });
    return () => langganan.remove();
  }, [kotor, mintaKeluar]);
}
