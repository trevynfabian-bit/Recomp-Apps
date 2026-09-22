import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card } from './Card';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, typography } from '@/theme';

/** Batas panjang catatan; cukup untuk konteks sehari, tidak untuk jurnal. */
const MAKS_KARAKTER = 500;

type Props = {
  catatan: string | null;
  onSimpan: (catatan: string | null) => void;
};

/**
 * Catatan bebas per hari (`daily_logs.catatan`).
 * Ketuk kartu untuk menyunting di tempat — tidak perlu pindah layar. Catatan
 * kosong disimpan sebagai `null`, bukan string kosong, supaya "belum diisi"
 * dan "sengaja dikosongkan" tidak tertukar di database.
 */
export function KartuCatatan({ catatan, onSimpan }: Props) {
  const [menyunting, setMenyunting] = useState(false);
  const [draf, setDraf] = useState(catatan ?? '');
  const inputRef = useRef<TextInput>(null);

  // Mulai menyunting dari isi terbaru, bukan sisa draf sebelumnya.
  useEffect(() => {
    if (menyunting) setDraf(catatan ?? '');
  }, [menyunting, catatan]);

  function simpan() {
    ketukBerhasil();
    const bersih = draf.trim();
    onSimpan(bersih === '' ? null : bersih);
    setMenyunting(false);
  }

  if (!menyunting) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={catatan ? 'Ubah catatan hari ini' : 'Tambah catatan hari ini'}
        onPress={() => {
          ketukRingan();
          setMenyunting(true);
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card>
          <View style={{ gap: spacing.md }}>
            <Text
              style={{
                ...typography.body,
                color: catatan ? colors.textMuted : colors.textFaint,
                lineHeight: 24,
              }}
            >
              {catatan ?? 'Belum ada catatan untuk hari ini.'}
            </Text>
            <Text style={{ ...typography.caption, color: colors.amber }}>
              {catatan ? 'Ketuk untuk ubah' : 'Ketuk untuk menulis'}
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <TextInput
          ref={inputRef}
          value={draf}
          onChangeText={setDraf}
          multiline
          autoFocus
          maxLength={MAKS_KARAKTER}
          placeholder="Tidur, energi, cedera, atau apa pun yang menjelaskan angka hari ini…"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Catatan hari ini"
          style={{
            ...typography.body,
            color: colors.text,
            lineHeight: 24,
            minHeight: 96,
            textAlignVertical: 'top',
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: spacing.md,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            {draf.length} / {MAKS_KARAKTER}
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenyunting(false)}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 2,
                borderRadius: radius.pill,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.textFaint }}>Batal</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={simpan}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 2,
                borderRadius: radius.pill,
                backgroundColor: colors.amber,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.bg }}>Simpan</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}
