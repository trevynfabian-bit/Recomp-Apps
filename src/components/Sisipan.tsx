import { Text } from 'react-native';
import { bobot, colors } from '@/theme';

/**
 * Keterangan pendek yang menempel setelah judul tebal, mis. "Rest · bawaan"
 * atau "Cut · aktif". Dipakai DI DALAM `<Text>` judul: ukuran dan tinggi baris
 * ikut judulnya, hanya warna dan ketebalannya yang diredam. Satu tempat untuk
 * pola ini, supaya layar tidak menimpa `fontWeight` sendiri-sendiri.
 */
export function Sisipan({ children }: { children: string }) {
  return <Text style={{ color: colors.teksSamar, fontWeight: bobot.biasa }}> · {children}</Text>;
}
