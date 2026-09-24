import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Card } from './Card';
import { PenandaSumber } from './PenandaSumber';
import { sumberBerat } from '@/lib/sumber';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { formatDesimal, formatTanggalPanjang } from '@recomp/logika';
import type { EntriBerat } from '@/mocks/dailyLog';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';
import type { SumberBerat } from '@/types/domain';

/** Langkah satu ketukan tombol −/+ (kg). */
const LANGKAH_KG = 0.1;
const BERAT_MIN = 30;
const BERAT_MAKS = 250;

/**
 * Selisih terhadap timbangan terakhir yang dianggap tidak wajar untuk semalam.
 * Di atas ini pengguna diminta mengonfirmasi — penjaga salah ketik, bukan
 * penghakiman atas angkanya.
 */
const AMBANG_KONFIRMASI_KG = 3;

/** Berapa lama tanda "Tersimpan" bertahan di kartu setelah sheet tertutup. */
const DURASI_TANDA_MS = 2200;

/** Tahap penyimpanan; dipakai untuk mengunci tombol dan memberi umpan balik. */
type StatusSimpan = 'idle' | 'konfirmasi' | 'menyimpan' | 'tersimpan' | 'gagal';

type Props = {
  /** Berat pagi hari ini; `null` bila belum ditimbang. */
  beratKg: number | null;
  sumber: SumberBerat | null;
  /** Berat tercatat terakhir sebelum hari ini — nilai awal saat belum menimbang. */
  beratSebelumnyaKg: number | null;
  /** Beberapa timbangan terakhir beserta asalnya, urut baru → lama. */
  riwayat: EntriBerat[];
  /**
   * Menyimpan berat. Boleh async dan boleh menolak — sheet menampilkan
   * status "Menyimpan…", "Tersimpan", atau "Gagal" sesuai hasilnya, jadi
   * penggantian ke penulisan Supabase nanti tidak mengubah komponen ini.
   */
  onSimpan: (beratKg: number) => void | Promise<void>;
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
  const [status, setStatus] = useState<StatusSimpan>('idle');
  const [baruTersimpan, setBaruTersimpan] = useState(false);
  const nilaiAwal = beratKg ?? beratSebelumnyaKg ?? 70;
  const [draf, setDraf] = useState(() => formatDesimal(nilaiAwal));

  // Samakan draf dengan data terbaru dan reset status setiap sheet dibuka.
  useEffect(() => {
    if (sheetTerbuka) {
      setDraf(formatDesimal(nilaiAwal));
      setStatus('idle');
    }
  }, [sheetTerbuka, nilaiAwal]);

  // Tanda "Tersimpan" di kartu hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!baruTersimpan) return;
    const t = setTimeout(() => setBaruTersimpan(false), DURASI_TANDA_MS);
    return () => clearTimeout(t);
  }, [baruTersimpan]);

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

  /** Selisih draf terhadap timbangan terakhir — dasar konfirmasi salah ketik. */
  const lompatan =
    drafAngka !== null && beratSebelumnyaKg !== null
      ? Math.abs(drafAngka - beratSebelumnyaKg)
      : 0;
  const perluKonfirmasi = lompatan > AMBANG_KONFIRMASI_KG;

  /** Tap Simpan: minta konfirmasi dulu bila lompatannya tidak wajar. */
  function tekanSimpan() {
    if (!valid || drafAngka === null) return;
    if (perluKonfirmasi && status !== 'konfirmasi') {
      ketukRingan();
      setStatus('konfirmasi');
      return;
    }
    void jalankanSimpan();
  }

  async function jalankanSimpan() {
    if (!valid || drafAngka === null) return;
    setStatus('menyimpan');
    try {
      await onSimpan(Math.round(drafAngka * 10) / 10);
      ketukBerhasil();
      setStatus('tersimpan');
      setBaruTersimpan(true);
      // Beri sekejap agar konfirmasi terbaca sebelum sheet menutup sendiri.
      setTimeout(() => setSheetTerbuka(false), 650);
    } catch {
      setStatus('gagal');
    }
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
                        color: selisih > 0 ? colors.amber : colors.aksenTeks.jade,
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
                    {baruTersimpan ? '' : 'ketuk untuk ubah'}
                  </Text>
                  {baruTersimpan ? (
                    <Text style={{ ...typography.caption, color: colors.aksenTeks.jade }}>
                      ✓ Tersimpan
                    </Text>
                  ) : null}
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
                    color: valid ? colors.text : colors.aksenTeks.coral,
                    textAlign: 'center',
                    padding: 0,
                  }}
                />
                <Text style={{ ...typography.title, color: colors.textFaint }}>kg</Text>
              </View>

              <TombolGeser label="+" onPress={() => geser(LANGKAH_KG)} />
            </View>

            {!valid ? (
              <Text style={{ ...typography.caption, color: colors.aksenTeks.coral, textAlign: 'center' }}>
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

            {/* Penjaga salah ketik: lompatan tak wajar diminta dikonfirmasi. */}
            {status === 'konfirmasi' ? (
              <View
                style={{
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.amber + '55',
                  // Tint di atas `surface` membuat teks redup di dalamnya jatuh
                  // ke 3,9:1; warnanya cukup dibawa tepi dan judulnya.
                  backgroundColor: colors.surfaceSunken,
                }}
              >
                <Text style={{ ...typography.label, color: colors.amber }}>
                  Beda {formatDesimal(lompatan)} kg dari timbangan terakhir
                </Text>
                <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
                  Lompatan sebesar ini biasanya salah ketik. Periksa sekali lagi, atau
                  lanjutkan bila memang benar.
                </Text>
              </View>
            ) : null}

            {status === 'gagal' ? (
              <View
                style={{
                  gap: spacing.xs,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.coral + '55',
                  backgroundColor: colors.surfaceSunken,
                }}
              >
                <Text style={{ ...typography.label, color: colors.aksenTeks.coral }}>
                  Gagal menyimpan
                </Text>
                <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
                  Angka Anda masih tersimpan di layar ini. Coba lagi.
                </Text>
              </View>
            ) : null}

            <View style={{ gap: spacing.md }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={labelTombolSimpan(status, perluKonfirmasi)}
                disabled={!valid || status === 'menyimpan' || status === 'tersimpan'}
                onPress={tekanSimpan}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: spacing.sm,
                  backgroundColor:
                    status === 'tersimpan'
                      ? colors.jade
                      : valid
                        ? colors.amber
                        : colors.surfaceSunken,
                  borderRadius: radius.lg,
                  minHeight: TAP_MIN,
                  justifyContent: 'center',
                  paddingVertical: spacing.lg,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {status === 'menyimpan' ? <ActivityIndicator size="small" color={colors.bg} /> : null}
                {status === 'tersimpan' ? (
                  <Text style={{ ...typography.bodyTebal, color: colors.bg }}>✓</Text>
                ) : null}
                <Text
                  style={{
                    ...typography.bodyTebal,
                    color:
                      status === 'tersimpan' || valid ? colors.bg : colors.textFaint,
                  }}
                >
                  {labelTombolSimpan(status, perluKonfirmasi)}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={status === 'menyimpan' || status === 'tersimpan'}
                onPress={() =>
                  status === 'konfirmasi' ? setStatus('idle') : setSheetTerbuka(false)
                }
                style={{ minHeight: TAP_MIN, justifyContent: 'center', alignItems: 'center' }}
              >
                <Text style={{ ...typography.label, color: colors.textFaint }}>
                  {status === 'konfirmasi' ? 'Periksa lagi' : 'Batal'}
                </Text>
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
        borderColor: colors.borderKuat,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.display, color: colors.text, lineHeight: 36 }}>{label}</Text>
    </Pressable>
  );
}

/** Teks tombol simpan sesuai tahap penyimpanan. */
function labelTombolSimpan(status: StatusSimpan, perluKonfirmasi: boolean): string {
  switch (status) {
    case 'menyimpan':
      return 'Menyimpan…';
    case 'tersimpan':
      return 'Tersimpan';
    case 'gagal':
      return 'Coba lagi';
    case 'konfirmasi':
      return 'Ya, simpan';
    default:
      return perluKonfirmasi ? 'Simpan…' : 'Simpan';
  }
}

/** Urai input pengguna; menerima koma maupun titik sebagai pemisah desimal. */
function urai(teks: string): number | null {
  const bersih = teks.replace(',', '.').trim();
  if (bersih === '') return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}
