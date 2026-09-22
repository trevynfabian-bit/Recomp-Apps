import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Card } from './Card';
import { PenandaSumber } from './PenandaSumber';
import { sumberBerat } from '@/lib/sumber';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { formatDesimal, formatTanggalPanjang } from '@/lib/format';
import type { EntriBerat } from '@/mocks/dailyLog';
import { colors, radius, spacing, typography } from '@/theme';
import type { SumberBerat } from '@/types/domain';

/** Langkah satu ketukan tombol −/+ (kg). */
const LANGKAH_KG = 0.1;
const BERAT_MIN = 30;
const BERAT_MAKS = 250;

type Props = {
  /** Berat pagi hari ini; `null` bila belum ditimbang. */
  beratKg: number | null;
  sumber: SumberBerat | null;
  /** Berat tercatat terakhir sebelum hari ini — nilai awal saat belum menimbang. */
  beratSebelumnyaKg: number | null;
  /** Beberapa timbangan terakhir beserta asalnya, urut baru → lama. */
  riwayat: EntriBerat[];
  onSimpan: (beratKg: number) => void;
};

/**
 * Kartu Timbang Pagi — mode cepat DUA TAP.
 *
 * Tap 1: ketuk kartu → sheet terbuka dengan angka sudah terisi
 *        (berat hari ini, atau berat terakhir bila belum menimbang).
 * Tap 2: ketuk Simpan.
 *
 * Tombol −/+ dan input angka tersedia untuk koreksi, tapi tidak wajib dilewati:
 * jalur tercepat tetap dua tap dan papan ketik tidak muncul sendiri.
 */
export function KartuTimbangPagi({
  beratKg,
  sumber,
  beratSebelumnyaKg,
  riwayat,
  onSimpan,
}: Props) {
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const nilaiAwal = beratKg ?? beratSebelumnyaKg ?? 70;
  const [draf, setDraf] = useState(() => formatDesimal(nilaiAwal));

  // Samakan draf dengan data terbaru setiap kali sheet dibuka.
  useEffect(() => {
    if (sheetTerbuka) setDraf(formatDesimal(nilaiAwal));
  }, [sheetTerbuka, nilaiAwal]);

  const drafAngka = urai(draf);
  const valid = drafAngka !== null && drafAngka >= BERAT_MIN && drafAngka <= BERAT_MAKS;
  const selisih =
    beratKg !== null && beratSebelumnyaKg !== null ? beratKg - beratSebelumnyaKg : null;
  const jenisSumber = beratKg !== null ? sumberBerat(sumber) : null;

  function geser(delta: number) {
    ketukRingan();
    const dasar = urai(draf) ?? nilaiAwal;
    const berikut = Math.min(Math.max(dasar + delta, BERAT_MIN), BERAT_MAKS);
    // Bulatkan ke 0,1 agar tidak muncul galat pembulatan biner.
    setDraf(formatDesimal(Math.round(berikut * 10) / 10));
  }

  function simpan() {
    if (!valid || drafAngka === null) return;
    ketukBerhasil();
    onSimpan(Math.round(drafAngka * 10) / 10);
    setSheetTerbuka(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          beratKg !== null
            ? `Berat pagi ${formatDesimal(beratKg)} kilogram. Ketuk untuk mengubah.`
            : 'Belum menimbang pagi ini. Ketuk untuk mencatat.'
        }
        onPress={() => {
          ketukRingan();
          setSheetTerbuka(true);
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: spacing.xs }}>
              <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
                Timbang pagi
              </Text>

              {beratKg !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                  <Text style={{ ...typography.display, color: colors.text }}>
                    {formatDesimal(beratKg)}
                  </Text>
                  <Text style={{ ...typography.label, color: colors.textFaint }}>kg</Text>
                  {selisih !== null && Math.abs(selisih) >= 0.05 ? (
                    <Text
                      style={{
                        ...typography.label,
                        color: selisih > 0 ? colors.amber : colors.jade,
                      }}
                    >
                      {selisih > 0 ? '+' : '−'}
                      {formatDesimal(Math.abs(selisih))}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ ...typography.display, color: colors.textFaint }}>—</Text>
              )}

              {jenisSumber !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <PenandaSumber
                    jenis={jenisSumber}
                    detail={jenisSumber === 'sinkron' ? 'Apple Health' : undefined}
                  />
                  <Text style={{ ...typography.caption, color: colors.textFaint }}>
                    ketuk untuk ubah
                  </Text>
                </View>
              ) : (
                <Text style={{ ...typography.caption, color: colors.textFaint }}>
                  Belum ditimbang · ketuk untuk catat
                </Text>
              )}
            </View>

            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: colors.amber + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ ...typography.title, color: colors.amber }}>
                {beratKg === null ? '+' : '›'}
              </Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <Modal
        visible={sheetTerbuka}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetTerbuka(false)}
      >
        <Pressable
          accessibilityLabel="Tutup"
          onPress={() => setSheetTerbuka(false)}
          style={{ flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' }}
        >
          {/* Hentikan propagasi agar ketukan di dalam sheet tidak menutupnya. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderTopWidth: 1,
              borderColor: colors.border,
              padding: spacing.xl,
              paddingBottom: spacing.xxl + spacing.lg,
              gap: spacing.xl,
            }}
          >
            <View style={{ alignItems: 'center', gap: spacing.xs }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: radius.pill,
                  backgroundColor: colors.border,
                  marginBottom: spacing.sm,
                }}
              />
              <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
                Berat pagi
              </Text>
            </View>

            {/* Baris angka: −  74,6 kg  + */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <TombolGeser label="−" onPress={() => geser(-LANGKAH_KG)} />

              {/* `flex: 1` menahan grup tengah agar tombol + tidak terdorong keluar layar. */}
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: spacing.xs,
                }}
              >
                <TextInput
                  value={draf}
                  onChangeText={setDraf}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                  accessibilityLabel="Berat dalam kilogram"
                  style={{
                    ...typography.hero,
                    fontSize: 52,
                    // Lebar eksplisit: tanpa ini input memakai lebar bawaan
                    // (~20 karakter) dan mendorong tombol + keluar layar.
                    width: 140,
                    color: valid ? colors.text : colors.coral,
                    textAlign: 'center',
                    padding: 0,
                  }}
                />
                <Text style={{ ...typography.title, color: colors.textFaint }}>kg</Text>
              </View>

              <TombolGeser label="+" onPress={() => geser(LANGKAH_KG)} />
            </View>

            {!valid ? (
              <Text style={{ ...typography.caption, color: colors.coral, textAlign: 'center' }}>
                Masukkan berat antara {BERAT_MIN} dan {BERAT_MAKS} kg
              </Text>
            ) : null}

            {/* Asal angka yang sedang diubah, plus akibat menyimpannya. */}
            {jenisSumber !== null ? (
              <View
                style={{
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceSunken,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ ...typography.caption, color: colors.textFaint }}>Asal angka</Text>
                  <PenandaSumber
                    jenis={jenisSumber}
                    detail={jenisSumber === 'sinkron' ? 'Apple Health' : undefined}
                  />
                </View>
                {jenisSumber === 'sinkron' ? (
                  <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
                    Angka ini ditarik dari Apple Health. Menyimpan di sini akan
                    menggantinya dengan catatan manual Anda.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Timbangan sebelumnya beserta asalnya masing-masing. */}
            {riwayat.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
                  Timbangan sebelumnya
                </Text>
                {riwayat.map((r) => (
                  <View
                    key={r.tanggal}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                    }}
                  >
                    <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
                      {formatTanggalPanjang(r.tanggal)}
                    </Text>
                    <PenandaSumber jenis={sumberBerat(r.sumber_berat) ?? 'manual'} />
                    <Text style={{ ...typography.label, color: colors.text, width: 56, textAlign: 'right' }}>
                      {formatDesimal(r.berat_pagi_kg)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ ...typography.caption, color: colors.textFaint, textAlign: 'center' }}>
                Belum ada catatan berat sebelumnya
              </Text>
            )}

            <View style={{ gap: spacing.md }}>
              <Pressable
                accessibilityRole="button"
                disabled={!valid}
                onPress={simpan}
                style={({ pressed }) => ({
                  backgroundColor: valid ? colors.amber : colors.surfaceSunken,
                  borderRadius: radius.lg,
                  paddingVertical: spacing.lg,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{
                    ...typography.body,
                    fontWeight: '700',
                    color: valid ? colors.bg : colors.textFaint,
                  }}
                >
                  Simpan
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setSheetTerbuka(false)}
                style={{ paddingVertical: spacing.sm, alignItems: 'center' }}
              >
                <Text style={{ ...typography.label, color: colors.textFaint }}>Batal</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Tombol bulat −/+ untuk menggeser berat 0,1 kg per ketukan. */
function TombolGeser({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Tambah 0,1 kg' : 'Kurangi 0,1 kg'}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.display, color: colors.text, lineHeight: 36 }}>{label}</Text>
    </Pressable>
  );
}

/** Urai input pengguna; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}
