import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from './Card';
import { MacroRow } from './MacroRow';
import { PenandaSumber } from './PenandaSumber';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';
import type { MacroProgress, ModeMakro } from '@/types/domain';

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
              <Text style={{ ...typography.caption, color: colors.textFaint, flex: 1 }}>
                Total di atas memuat {jumlahEstimasi} entri hasil perkiraan.
              </Text>
            </View>
          ) : null}
          <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
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
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.pill,
        padding: spacing.xs,
        gap: spacing.xs,
      }}
    >
      {opsi.map((o) => {
        const aktif = o.nilai === mode;
        return (
          <Pressable
            key={o.nilai}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={`Tampilkan ${o.label}`}
            onPress={() => {
              if (aktif) return;
              ketukRingan();
              onGanti(o.nilai);
            }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              alignItems: 'center',
              backgroundColor: aktif ? colors.surface : 'transparent',
              borderWidth: 1,
              borderColor: aktif ? colors.border : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                ...typography.label,
                color: aktif ? colors.text : colors.textFaint,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
