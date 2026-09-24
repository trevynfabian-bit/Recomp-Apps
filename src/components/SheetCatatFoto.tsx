import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { InputAngka } from './InputAngka';
import { Pill } from './Pill';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { analisisFotoStub, type HasilAnalisisFoto } from '@/mocks/fotoAi';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';
import type { FoodLog } from '@/types/domain';

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
    [kalori, protein, lemak, karbo, satFat].every((v) => urai(v) !== null);

  function simpan() {
    if (!valid) return;
    ketukBerhasil();
    onSimpan({
      nama_makanan: nama.trim(),
      foto_url: null, // Fase 4 mengisi ini dengan objek di Supabase Storage.
      kalori: Math.round(urai(kalori) ?? 0),
      protein_g: urai(protein) ?? 0,
      lemak_g: urai(lemak) ?? 0,
      karbo_g: urai(karbo) ?? 0,
      sat_fat_g: urai(satFat) ?? 0,
      sumber: 'foto_ai',
    });
    onTutup();
  }

  return (
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000AA' }}
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
              <TahapMenganalisis />
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

                <View style={{ gap: spacing.xs }}>
                  <Text style={{ ...typography.caption, color: colors.teksRedup }}>Nama makanan</Text>
                  <TextInput
                    value={nama}
                    onChangeText={setNama}
                    accessibilityLabel="Nama makanan"
                    style={{
                      ...typography.body,
                      color: colors.teks,
                      backgroundColor: colors.permukaanCekung,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.garisKontrol,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.md,
                    }}
                  />
                </View>

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
                  <TombolUtama label="Simpan" aktif={valid} onPress={simpan} />
                  <TombolTeks label="Foto ulang" onPress={() => setTahap('pilih')} />
                </View>
              </View>
            )}

            {tahap !== 'hasil' ? <TombolTeks label="Batal" onPress={onTutup} /> : null}
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
          height: 160,
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
        <Text style={{ ...typography.display, color: colors.teksSamar }}>📷</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Belum ada foto
        </Text>
      </View>

      <TombolUtama label="Ambil foto" aktif onPress={onMulai} />
      <TombolSekunder label="Pilih dari galeri" onPress={onMulai} />

      <Text style={{ ...typography.caption, color: colors.teksSamar, textAlign: 'center' }}>
        Fase 1 memakai hasil analisis tiruan — kamera & AI asli dipasang di Fase 4.
      </Text>
    </View>
  );
}

/** Tahap tunggu selama "analisis" berjalan. */
function TahapMenganalisis() {
  return (
    <View style={{ height: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
      <ActivityIndicator size="large" color={colors.aksen.teks} />
      <Text style={{ ...typography.body, color: colors.teksRedup }}>Menganalisis foto…</Text>
      <Text style={{ ...typography.caption, color: colors.teksSamar, textAlign: 'center' }}>
        Hasilnya berupa estimasi dan masih bisa Anda koreksi.
      </Text>
    </View>
  );
}

function TombolUtama({
  label,
  aktif,
  onPress,
}: {
  label: string;
  aktif: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!aktif}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: aktif ? colors.aksen.isian : colors.permukaanCekung,
        borderRadius: radius.lg,
        minHeight: TAP_MIN,
        justifyContent: 'center',
        paddingVertical: spacing.lg,
        alignItems: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{ ...typography.bodyTebal, color: aktif ? colors.diAtasIsian : colors.teksSamar }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TombolSekunder({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.garisKontrol,
        backgroundColor: colors.permukaanCekung,
        minHeight: TAP_MIN,
        justifyContent: 'center',
        paddingVertical: spacing.lg,
        alignItems: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ ...typography.bodySedang, color: colors.teks }}>{label}</Text>
    </Pressable>
  );
}

function TombolTeks({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: TAP_MIN, justifyContent: 'center', alignItems: 'center' }}
    >
      <Text style={{ ...typography.label, color: colors.teksSamar }}>{label}</Text>
    </Pressable>
  );
}

/** Urai input angka; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
