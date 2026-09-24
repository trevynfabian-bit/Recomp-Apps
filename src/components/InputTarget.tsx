import { View } from 'react-native';
import { Isian } from './Isian';

/**
 * Satu kolom angka pada form target (kalori, protein, lemak, batas sat fat).
 *
 * Kolom yang galatnya sedang tampil diberi tepi coral yang lebih tebal —
 * disertai kalimat galat di bawah form dan petunjuk untuk pembaca layar,
 * tidak pernah warna saja. Kalori memakai papan angka tanpa desimal; gram
 * memakai papan desimal.
 */
export function InputTarget({
  label,
  unit,
  nilai,
  aksesLabel,
  ditandai,
  onUbah,
  onTinggalkan,
  nonaktif,
}: {
  label: string;
  unit: string;
  nilai: string;
  aksesLabel: string;
  /** Ada galat yang sedang ditampilkan untuk kolom ini. */
  ditandai: boolean;
  onUbah: (teks: string) => void;
  onTinggalkan: () => void;
  nonaktif: boolean;
}) {
  return (
    // Dua kolom per baris; lebar minimum menjaga label panjang tidak terpotong.
    <View style={{ flexBasis: '46%', flexGrow: 1, minWidth: 130 }}>
      <Isian
        label={label}
        unit={unit}
        angka
        value={nilai}
        onChangeText={onUbah}
        onBlur={onTinggalkan}
        nonaktif={nonaktif}
        ditandai={ditandai}
        aksesLabel={aksesLabel}
        accessibilityHint={ditandai ? 'Isian ini perlu diperbaiki; keterangannya di bawah kartu' : undefined}
        keyboardType={unit === 'kcal' ? 'number-pad' : 'decimal-pad'}
        inputMode={unit === 'kcal' ? 'numeric' : 'decimal'}
        selectTextOnFocus
      />
    </View>
  );
}
