import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card } from './Card';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/** Batas panjang catatan; cukup untuk konteks sehari, tidak untuk jurnal. */
const MAKS_KARAKTER = 500;

type Props = {
  catatan: string | null;
  /**
   * Menyimpan catatan. Boleh async dan boleh menolak — kartu menampilkan
   * status "Menyimpan…" dan pesan gagal tanpa membuang tulisan pengguna.
   */
  onSimpan: (catatan: string | null) => void | Promise<void>;
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
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Mulai menyunting dari isi terbaru, bukan sisa draf sebelumnya.
  useEffect(() => {
    if (menyunting) {
      setDraf(catatan ?? '');
      setGalat(null);
    }
  }, [menyunting, catatan]);

  async function simpan() {
    const bersih = draf.trim();
    setMenyimpan(true);
    setGalat(null);
    try {
      await onSimpan(bersih === '' ? null : bersih);
      ketukBerhasil();
      setMenyunting(false);
    } catch (e) {
      // Tetap di mode sunting supaya tulisan pengguna tidak hilang.
      setGalat(e instanceof Error ? e.message : 'Gagal menyimpan catatan.');
    } finally {
      setMenyimpan(false);
    }
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
                color: catatan ? colors.teksRedup : colors.teksSamar,
              }}
            >
              {catatan ?? 'Belum ada catatan untuk hari ini.'}
            </Text>
            <Text style={{ ...typography.caption, color: colors.aksen.teks }}>
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
          placeholderTextColor={colors.teksSamar}
          accessibilityLabel="Catatan hari ini"
          style={{
            ...typography.body,
            color: colors.teks,
            minHeight: 96,
            textAlignVertical: 'top',
            backgroundColor: colors.permukaanCekung,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.garisKontrol,
            padding: spacing.md,
          }}
        />

        {galat ? (
          <Text style={{ ...typography.caption, color: colors.status.bahaya.teks }}>
            {galat}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            {draf.length} / {MAKS_KARAKTER}
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              disabled={menyimpan}
              onPress={() => setMenyunting(false)}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.teksSamar }}>Batal</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={menyimpan}
              onPress={simpan}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                backgroundColor: menyimpan ? colors.permukaanCekung : colors.aksen.isian,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text
                style={{
                  ...typography.label,
                  color: menyimpan ? colors.teksSamar : colors.diAtasIsian,
                }}
              >
                {menyimpan ? 'Menyimpan…' : 'Simpan'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}
