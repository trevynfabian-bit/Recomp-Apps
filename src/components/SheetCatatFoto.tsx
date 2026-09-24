import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { InputAngka } from './InputAngka';
import { Pill } from './Pill';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { analisisFotoStub, type HasilAnalisisFoto } from '@/mocks/fotoAi';
import { colors, radius, spacing, typography, ukuran, ukuranIkon } from '@/theme';
import type { FoodLog } from '@/types/domain';
import { Isian } from './Isian';
import { KeadaanMemuat } from './Keadaan';
import { uraiAngka } from './Pemilih';
import { Tombol } from './Tombol';

/** Entri makanan baru yang siap disimpan (tanpa id & relasi, diisi pemanggil). */
export type EntriMakananBaru = Omit<FoodLog, 'id' | 'daily_log_id'>;

type Tahap = 'pilih' | 'menganalisis' | 'hasil';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  onSimpan: (entri: EntriMakananBaru) => void;
};

/**
 * Alur Catat Makan via Foto (data tiruan).
 *
 * pilih → menganalisis → hasil → Simpan.
 * Hasil AI SELALU bisa dikoreksi sebelum disimpan dan ditandai `sumber:'foto_ai'`
 * supaya di mana pun ia muncul nanti tetap terbaca sebagai ESTIMASI, bukan data
 * mentah — pembedaan yang diminta PRD.
 *
 * Fase 1 memakai `analisisFotoStub`; pengambilan foto asli dan panggilan ke
 * Edge Function dipasang di Fase 4 tanpa mengubah alur layar ini.
 */
export function SheetCatatFoto({ terbuka, onTutup, onSimpan }: Props) {
  const [tahap, setTahap] = useState<Tahap>('pilih');
  const [keyakinan, setKeyakinan] = useState<HasilAnalisisFoto['keyakinan']>('sedang');
  const [nama, setNama] = useState('');
  const [kalori, setKalori] = useState('');
  const [protein, setProtein] = useState('');
  const [lemak, setLemak] = useState('');
  const [karbo, setKarbo] = useState('');
  const [satFat, setSatFat] = useState('');

  // Setiap kali sheet dibuka, mulai lagi dari tahap awal.
  useEffect(() => {
    if (terbuka) setTahap('pilih');
  }, [terbuka]);

  async function jalankanAnalisis() {
    ketukRingan();
    setTahap('menganalisis');
    const hasil = await analisisFotoStub();
    setNama(hasil.nama_makanan);
    setKalori(String(hasil.kalori));
    setProtein(String(hasil.protein_g));
    setLemak(String(hasil.lemak_g));
    setKarbo(String(hasil.karbo_g));
    setSatFat(String(hasil.sat_fat_g));
    setKeyakinan(hasil.keyakinan);
    setTahap('hasil');
  }

  const valid =
    nama.trim() !== '' &&
    [kalori, protein, lemak, karbo, satFat].every((v) => uraiAngka(v) !== null);

  function simpan() {
    if (!valid) return;
    ketukBerhasil();
    onSimpan({
      nama_makanan: nama.trim(),
      foto_url: null, // Fase 4 mengisi ini dengan objek di Supabase Storage.
      kalori: Math.round(uraiAngka(kalori) ?? 0),
      protein_g: uraiAngka(protein) ?? 0,
      lemak_g: uraiAngka(lemak) ?? 0,
      karbo_g: uraiAngka(karbo) ?? 0,
      sat_fat_g: uraiAngka(satFat) ?? 0,
      sumber: 'foto_ai',
    });
    onTutup();
  }

  return (
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.selubung }}
      >
        <View
          style={{
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
            maxHeight: '88%',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: spacing.md }}>
            <View
              style={{ width: ukuran.pegangan.lebar, height: ukuran.pegangan.tinggi, borderRadius: radius.pill, backgroundColor: colors.garis }}
            />
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: spacing.xl,
              paddingBottom: spacing.xxl + spacing.lg,
              gap: spacing.xl,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: spacing.xs, alignItems: 'center' }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
                Catat makan via foto
              </Text>
            </View>

            {tahap === 'pilih' ? (
              <TahapPilih onMulai={jalankanAnalisis} />
            ) : tahap === 'menganalisis' ? (
              <KeadaanMemuat label="Menganalisis foto…" keterangan="Hasilnya berupa estimasi dan masih bisa Anda koreksi." />
            ) : (
              <View style={{ gap: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                  <Pill
                    diKartu
                    label={`Estimasi AI · keyakinan ${keyakinan}`}
                    warna={
                      keyakinan === 'tinggi'
                        ? colors.status.sukses.teks
                        : keyakinan === 'sedang'
                          ? colors.status.peringatan.teks
                          : colors.status.bahaya.teks
                    }
                  />
                </View>

                <Isian label="Nama makanan" value={nama} onChangeText={setNama} />

                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <InputAngka label="Kalori" unit="kcal" nilai={kalori} onUbah={setKalori} warna={colors.macroTeks.kalori} />
                  <InputAngka label="Protein" unit="g" nilai={protein} onUbah={setProtein} warna={colors.macroTeks.protein} />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <InputAngka label="Lemak" unit="g" nilai={lemak} onUbah={setLemak} warna={colors.macroTeks.lemak} />
                  <InputAngka label="Karbo" unit="g" nilai={karbo} onUbah={setKarbo} warna={colors.macroTeks.karbo} />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <InputAngka label="Sat fat" unit="g" nilai={satFat} onUbah={setSatFat} warna={colors.macroTeks.satFat} />
                  <View style={{ flex: 1 }} />
                </View>

                <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                  Angka di atas adalah tebakan dari foto. Periksa dan koreksi bila perlu —
                  entri ini akan disimpan bertanda estimasi.
                </Text>

                <View style={{ gap: spacing.md }}>
                  <Tombol label="Simpan" nonaktif={!valid} onPress={simpan} />
                  <Tombol label="Foto ulang" varian="teks" nada="netral" sejajar="tengah" onPress={() => setTahap('pilih')} />
                </View>
              </View>
            )}

            {tahap !== 'hasil' ? <Tombol label="Batal" varian="teks" nada="netral" sejajar="tengah" onPress={onTutup} /> : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Tahap awal: pilih sumber foto. Keduanya memicu analisis tiruan yang sama. */
function TahapPilih({ onMulai }: { onMulai: () => void }) {
  return (
    <View style={{ gap: spacing.lg }}>
      <View
        style={{
          height: ukuran.bingkaiFoto,
          borderRadius: radius.lg,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.garis,
          backgroundColor: colors.permukaanCekung,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}
      >
        <Ionicons name="camera-outline" size={ukuranIkon.hasil} color={colors.teksSamar} accessibilityElementsHidden />
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Foto makanan tampil di sini
        </Text>
      </View>

      <Tombol label="Ambil foto" onPress={onMulai} />
      <Tombol label="Pilih dari galeri" varian="bertepi" onPress={onMulai} />

      <Text style={{ ...typography.caption, color: colors.teksSamar, textAlign: 'center' }}>
        Fase 1 memakai hasil analisis tiruan — kamera & AI asli dipasang di Fase 4.
      </Text>
    </View>
  );
}
