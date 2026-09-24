import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { formatDesimal } from '@recomp/logika';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';
import { Tombol } from './Tombol';

/** Satu ketukan tombol −/+ (cm). */
const LANGKAH_CM = 0.5;
const BATAS_MIN = 50;
const BATAS_MAKS = 160;

type StatusSimpan = 'idle' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /** Batas yang berlaku sekarang; null bila belum pernah ditetapkan. */
  batasCm: number | null;
  /** Lingkar pinggang terakhir — pembanding hidup saat menggeser batas. */
  pinggangSekarangCm: number;
  /** Lingkar pinggang pada pencatatan pertama, dipakai sebagai saran jangkar. */
  pinggangAwalCm: number | null;
  onSimpan: (batasCm: number) => void | Promise<void>;
};

/**
 * Pengaturan batas pinggang.
 *
 * Batas ini bukan target dan bukan penilaian — ia GARIS KEPUTUSAN. Saat Lean
 * Gain, sebagian kenaikan berat memang lemak; yang perlu diputuskan adalah
 * seberapa banyak yang masih bersedia diterima sebelum beralih ke Cut. Kalau
 * angkanya tidak ditetapkan di muka, keputusan itu diambil belakangan dengan
 * angka yang sudah terlanjur naik, dan hampir selalu ditunda.
 *
 * Karena itu sheet ini selalu menampilkan JARAK ke pinggang sekarang saat
 * angkanya digeser: batas yang berarti "sisa 0,2 cm" dan batas yang berarti
 * "sisa 3 cm" adalah dua keputusan yang sangat berbeda, dan itu tidak terlihat
 * dari angka batasnya sendiri.
 */
export function SheetBatasPinggang({
  terbuka,
  onTutup,
  batasCm,
  pinggangSekarangCm,
  pinggangAwalCm,
  onSimpan,
}: Props) {
  const nilaiAwal = batasCm ?? bulat(pinggangSekarangCm + 2);
  const [draf, setDraf] = useState(() => formatDesimal(nilaiAwal));
  const [status, setStatus] = useState<StatusSimpan>('idle');

  useEffect(() => {
    if (!terbuka) return;
    setDraf(formatDesimal(nilaiAwal));
    setStatus('idle');
  }, [terbuka, nilaiAwal]);

  const angka = urai(draf);
  const valid = angka !== null && angka >= BATAS_MIN && angka <= BATAS_MAKS;
  const sisa = angka !== null ? bulat(angka - pinggangSekarangCm) : null;
  const sudahLewat = sisa !== null && sisa < 0;

  /** Jangkar konkret; angka batas jauh lebih mudah dipilih relatif terhadap sesuatu. */
  const saran = [
    { label: '+1,0 cm dari sekarang', nilai: bulat(pinggangSekarangCm + 1) },
    { label: '+2,0 cm dari sekarang', nilai: bulat(pinggangSekarangCm + 2) },
    ...(pinggangAwalCm !== null && pinggangAwalCm !== pinggangSekarangCm
      ? [{ label: `pinggang awal (${formatDesimal(pinggangAwalCm)})`, nilai: bulat(pinggangAwalCm) }]
      : []),
  ];

  function geser(delta: number) {
    ketukRingan();
    const dasar = angka ?? nilaiAwal;
    const berikut = Math.min(Math.max(dasar + delta, BATAS_MIN), BATAS_MAKS);
    setDraf(formatDesimal(Math.round(berikut * 10) / 10));
    if (status === 'gagal') setStatus('idle');
  }

  async function simpan() {
    if (!valid || angka === null) return;
    setStatus('menyimpan');
    try {
      await onSimpan(Math.round(angka * 10) / 10);
      ketukBerhasil();
      setStatus('tersimpan');
      setTimeout(onTutup, 650);
    } catch {
      setStatus('gagal');
    }
  }

  const terkunci = status === 'menyimpan' || status === 'tersimpan';

  return (
    <Modal visible={terbuka} transparent animationType="slide" onRequestClose={onTutup}>
      <View style={{ flex: 1, backgroundColor: colors.selubung, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Tutup" onPress={onTutup} style={{ flex: 1 }} />

        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              paddingTop: spacing.md,
              paddingBottom: spacing.md,
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                width: ukuran.pegangan.lebar,
                height: ukuran.pegangan.tinggi,
                borderRadius: radius.pill,
                backgroundColor: colors.garis,
              }}
            />
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              Batas pinggang
            </Text>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
          >
            {/* − 86,0 cm + */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <TombolGeser
                label="−"
                aksesLabel={`Kurangi ${formatDesimal(LANGKAH_CM)} sentimeter`}
                onPress={() => geser(-LANGKAH_CM)}
              />
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
                  onChangeText={(t) => {
                    setDraf(t);
                    if (status === 'gagal') setStatus('idle');
                  }}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                  accessibilityLabel="Batas pinggang dalam sentimeter"
                  style={{
                    ...typography.hero,
                    fontSize: 52,
                    // Lebar eksplisit: tanpa ini input di web memakai lebar
                    // bawaannya dan mendorong tombol + keluar layar.
                    width: 140,
                    color: valid ? colors.teks : colors.status.bahaya.teks,
                    textAlign: 'center',
                    padding: 0,
                  }}
                />
                <Text style={{ ...typography.title, color: colors.teksSamar }}>cm</Text>
              </View>
              <TombolGeser
                label="+"
                aksesLabel={`Tambah ${formatDesimal(LANGKAH_CM)} sentimeter`}
                onPress={() => geser(LANGKAH_CM)}
              />
            </View>

            {!valid ? (
              <Text
                style={{ ...typography.caption, color: colors.status.bahaya.teks, textAlign: 'center' }}
              >
                Masukkan batas antara {BATAS_MIN} dan {BATAS_MAKS} cm.
              </Text>
            ) : (
              /* Jarak ke pinggang sekarang — arti sebenarnya dari angka di atas. */
              <View
                style={{
                  gap: spacing.xs,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  // Latarnya tetap surfaceSunken di kedua keadaan; yang berubah
                  // cuma tepinya, supaya teks redup di dalamnya tidak ikut
                  // kehilangan kontras saat keadaannya berubah.
                  backgroundColor: colors.permukaanCekung,
                  borderWidth: 1,
                  borderColor: sudahLewat ? tint(colors.status.bahaya.isian, 'tepi') : 'transparent',
                }}
              >
                <Text
                  style={{
                    ...typography.label,
                    color: sudahLewat ? colors.status.bahaya.teks : colors.teks,
                  }}
                >
                  {sisa === 0
                    ? 'Pas di batas'
                    : sudahLewat
                      ? `Sudah ${formatDesimal(Math.abs(sisa!))} cm di atas batas ini`
                      : `Sisa ${formatDesimal(sisa!)} cm sampai batas`}
                </Text>
                <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                  Pinggang terakhir Anda {formatDesimal(pinggangSekarangCm)} cm.
                  {sudahLewat
                    ? ' Menetapkan batas di bawah angka sekarang boleh saja — artinya sinyalnya aktif sejak hari ini.'
                    : ''}
                </Text>
              </View>
            )}

            {/* Jangkar siap pakai */}
            <View style={{ gap: spacing.sm }}>
              <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
                Pilih cepat
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {saran.map((s) => (
                  <Pressable
                    key={s.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Setel batas ke ${formatDesimal(s.nilai)} sentimeter, ${s.label}`}
                    onPress={() => {
                      ketukRingan();
                      setDraf(formatDesimal(s.nilai));
                    }}
                    style={({ pressed }) => ({
                      minHeight: TAP_MIN,
                      justifyContent: 'center',
                      paddingHorizontal: spacing.lg,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: colors.garisKontrol,
                      backgroundColor: colors.permukaanCekung,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ ...typography.label, color: colors.teksRedup }}>
                      {formatDesimal(s.nilai)} · {s.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Apa arti batas ini, supaya tidak terbaca sebagai target. */}
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              Batas ini bukan target dan bukan penilaian atas tubuh Anda — ia garis keputusan. Saat
              Lean Gain, sebagian kenaikan berat memang lemak; yang perlu diputuskan adalah berapa
              banyak yang masih bersedia Anda terima sebelum beralih ke Cut. Menetapkannya SEKARANG,
              saat angkanya belum naik, jauh lebih mudah daripada memutuskannya nanti — dan itulah
              sebabnya keputusan ini hampir selalu tertunda.
            </Text>

            {status === 'gagal' ? (
              <View
                style={{
                  gap: spacing.xs,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: tint(colors.status.bahaya.isian, 'tepi'),
                  backgroundColor: colors.permukaanCekung,
                }}
              >
                <Text style={{ ...typography.label, color: colors.status.bahaya.teks }}>
                  Gagal menyimpan
                </Text>
                <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                  Angka Anda masih ada di layar ini. Coba lagi.
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.md, paddingBottom: spacing.xl }}>
              <Tombol
                label={labelSimpan(status)}
                onPress={() => void simpan()}
                nonaktif={!valid}
                memproses={status === 'menyimpan'}
                berhasil={status === 'tersimpan'}
              />

              <Tombol
                varian="teks"
                ukuran="kecil"
                nada="netral"
                label="Batal"
                nonaktif={terkunci}
                sejajar="tengah"
                onPress={onTutup}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Tombol bulat −/+ untuk menggeser batas setengah sentimeter. */
function TombolGeser({
  label,
  aksesLabel,
  onPress,
}: {
  label: string;
  aksesLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: radius.pill,
        backgroundColor: colors.permukaanCekung,
        borderWidth: 1,
        borderColor: colors.garisKontrol,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.display, color: colors.teks, lineHeight: 36 }}>{label}</Text>
    </Pressable>
  );
}

function labelSimpan(status: StatusSimpan): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    default:
      return 'Simpan batas';
  }
}

/** Urai input pengguna; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}

function bulat(n: number): number {
  return Math.round(n * 10) / 10;
}
