import { useState } from 'react';
import { Text, View } from 'react-native';
import { Card } from './Card';
import { MacroRow } from './MacroRow';
import { PenandaSumber } from './PenandaSumber';

import { colors, spacing, typography } from '@/theme';
import type { MacroProgress, ModeMakro } from '@/types/domain';
import { PilihanSegmen } from './PilihanSegmen';

type Props = {
  macros: MacroProgress[];
  /** Berapa entri makanan hari ini yang berasal dari estimasi (foto AI). */
  jumlahEstimasi?: number;
};

/**
 * Panel Ringkasan Makro & Sisa.
 * Satu sakelar menukar SEMUA baris antara "Sisa" (berapa lagi yang tersedia)
 * dan "Terpakai" (berapa yang sudah masuk), jadi pengguna tidak perlu
 * menghitung sendiri di kepala.
 */
export function PanelRingkasanMakro({ macros, jumlahEstimasi = 0 }: Props) {
  const [mode, setMode] = useState<ModeMakro>('sisa');

  return (
    <Card>
      <View style={{ gap: spacing.lg }}>
        <SakelarMode mode={mode} onGanti={setMode} />

        <View style={{ gap: spacing.xl }}>
          {macros.map((macro) => (
            <MacroRow key={macro.key} macro={macro} mode={mode} />
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          {/* Angka total bisa tercampur estimasi — katakan terus terang. */}
          {jumlahEstimasi > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <PenandaSumber jenis="estimasi" />
              <Text style={{ ...typography.caption, color: colors.teksSamar, flex: 1 }}>
                Total di atas memuat {jumlahEstimasi} entri hasil perkiraan.
              </Text>
            </View>
          ) : null}
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Sat fat dihitung sebagai BATAS, bukan sasaran. Karbo sengaja tidak
            ditargetkan — hanya dicatat.
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Sakelar dua pilihan: Sisa / Terpakai. */
function SakelarMode({
  mode,
  onGanti,
}: {
  mode: ModeMakro;
  onGanti: (m: ModeMakro) => void;
}) {
  const opsi: { nilai: ModeMakro; label: string }[] = [
    { nilai: 'sisa', label: 'Sisa' },
    { nilai: 'terpakai', label: 'Terpakai' },
  ];

  return (
    <PilihanSegmen opsi={opsi} terpilih={mode} onPilih={onGanti} aksesAwalan="Tampilkan" />
  );
}
