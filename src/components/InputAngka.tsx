import { View } from 'react-native';
import { colors } from '@/theme';
import { Isian } from './Isian';

type Props = {
  label: string;
  nilai: string;
  unit: string;
  onUbah: (teks: string) => void;
  /** Warna aksen label; dipakai untuk membedakan makro. */
  warna?: string;
};

/**
 * Kolom angka kecil dengan label & unit, dipakai form koreksi hasil AI.
 * Pembungkus `Isian` yang mengisi lebar baris (dua kolom berdampingan).
 */
export function InputAngka({ label, nilai, unit, onUbah, warna = colors.teksRedup }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <Isian
        label={label}
        unit={unit}
        warnaLabel={warna}
        angka
        value={nilai}
        onChangeText={onUbah}
        keyboardType="decimal-pad"
        inputMode="decimal"
        selectTextOnFocus
      />
    </View>
  );
}
