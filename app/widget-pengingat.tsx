import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatJamMenit,
  jamPengingatUntuk,
  KATALOG_NOTIFIKASI,
  ringkasJadwal,
  ringkasJenisAktif,
  siapkanWidget,
  tanggalHariIni,
} from '@recomp/logika';
import type { JenisNotifikasi } from '@recomp/logika';
import { Card, PratinjauWidget, SectionHeader, SheetJamTimbang } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import {
  LABEL_SKENARIO_WIDGET,
  mockMasukanWidget,
  mockPengaturanPengingat,
  mockWaktuTimbang,
  type SkenarioWidget,
} from '@/mocks/widget';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Pengaturan widget & pengingat.
 *
 * Satu hal yang SENGAJA bukan pengaturan: nada. PRD mewajibkan notifikasi
 * netral, jadi layar ini menyatakannya sebagai janji, bukan sakelar — sakelar
 * "nada tegas" hanya akan menjadi jalan masuk bagi notifikasi yang menegur.
 *
 * Setiap jenis notifikasi punya sakelarnya sendiri (`KATALOG_NOTIFIKASI`):
 * orang yang terganggu pengingat ukur pekanan tidak perlu kehilangan
 * ringkasan mingguan untuk mematikannya.
 *
 * Fase 3 sisi frontend: pengaturan hidup di state layar ini. Task backend
 * menyimpannya ke `settings_notifications` dan menjadwalkan notifikasi lokal
 * di perangkat.
 */
export default function WidgetPengingatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [atur, setAtur] = useState(mockPengaturanPengingat);
  const [skenario, setSkenario] = useState<SkenarioWidget>('hari-ini');
  const [sekarang] = useState(() => new Date());
  // Lewat `siapkanWidget` yang sama dengan widget native: ringkasan kemarin
  // dibuang di sini, bukan disembunyikan oleh layar pratinjau.
  const ringkasan = useMemo(
    () => siapkanWidget(mockMasukanWidget(skenario, sekarang), tanggalHariIni()),
    [skenario, sekarang],
  );
  const [waktuTimbang] = useState(() => mockWaktuTimbang());
  const [sheetJamTerbuka, setSheetJamTerbuka] = useState(false);

  const ubah = (p: Partial<typeof atur>) => setAtur((lama) => ({ ...lama, ...p }));
  const ubahJenis = (jenis: JenisNotifikasi, v: boolean) =>
    setAtur((lama) => ({ ...lama, jenis: { ...lama.jenis, [jenis]: v } }));
  const aktif = KATALOG_NOTIFIKASI.filter((n) => atur.jenis[n.jenis]);
  const jadwal = useMemo(
    () => ({ hariKerjaMenit: atur.jamTimbangMenit, akhirPekanMenit: atur.jamAkhirPekanMenit }),
    [atur.jamTimbangMenit, atur.jamAkhirPekanMenit],
  );
  // Jam pratinjau notifikasi = jam yang berlaku HARI INI (hari kerja/akhir pekan).
  const jam = formatJamMenit(jamPengingatUntuk(tanggalHariIni(), jadwal));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={() => {
            ketukRingan();
            router.back();
          }}
          style={({ pressed }) => ({
            width: TAP_MIN,
            height: TAP_MIN,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderKuat,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ ...typography.title, color: colors.text }}>‹</Text>
        </Pressable>
        <Text style={{ ...typography.title, color: colors.text }}>Widget & pengingat</Text>
      </View>

      {/* --- Notifikasi per jenis ------------------------------------------ */}
      <View>
        <SectionHeader judul="Notifikasi" aksi={ringkasJenisAktif(atur.jenis)} />
        <Card flat>
          {KATALOG_NOTIFIKASI.map((n, i) => (
            <View key={n.jenis}>
              {i > 0 ? <Pemisah /> : null}
              <BarisSakelar
                judul={n.nama}
                keterangan={n.kapan}
                nilai={atur.jenis[n.jenis]}
                onUbah={(v) => ubahJenis(n.jenis, v)}
              />
              {n.jenis === 'timbang' && atur.jenis.timbang ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Jam pengingat: ${ringkasJadwal(jadwal)}`}
                  accessibilityHint="Membuka pengaturan jam"
                  onPress={() => {
                    ketukRingan();
                    setSheetJamTerbuka(true);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: TAP_MIN,
                    paddingHorizontal: spacing.lg,
                    paddingBottom: spacing.lg,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ ...typography.label, color: colors.textMuted }}>Jam</Text>
                  <Text style={{ ...typography.label, color: colors.text }}>{ringkasJadwal(jadwal)} ›</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </Card>
      </View>

      {/* Pratinjau: janji "netral" ditunjukkan, bukan hanya dikatakan — isi
          yang tampil di sini adalah isi yang dikirim, dari katalog yang sama. */}
      <View>
        <SectionHeader judul="Seperti ini di layar kunci" />
        {aktif.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {aktif.map((n) => (
              <PratinjauNotif key={n.jenis} waktu={n.waktuPratinjau ?? jam} judul={n.judul} isi={n.isi} />
            ))}
          </View>
        ) : (
          <Card>
            <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
              Tidak ada notifikasi yang dikirim. Widget layar kunci tetap diperbarui seperti biasa.
            </Text>
          </Card>
        )}
      </View>

      <Card style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.label, color: colors.text }}>Nada selalu netral, tanpa angka</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          Tidak ada notifikasi &ldquo;melebihi target&rdquo; atau peringatan berwarna. Berat, kalori, dan
          ukuran tubuh juga tidak pernah ikut di notifikasi — layar kunci bisa dibaca orang lain. Angkanya
          dibaca di app, tanpa penilaian.
        </Text>
      </Card>

      {/* --- Widget layar kunci -------------------------------------------- */}
      <View>
        <SectionHeader judul="Widget layar kunci" />
        <Card style={{ gap: spacing.lg }}>
          <PratinjauWidget ringkasan={ringkasan} tampilkanAngka={atur.widgetTampilkanAngka} sekarang={sekarang} />
          <PemilihSkenario terpilih={skenario} onPilih={setSkenario} />
          <BarisSakelar
            judul="Tampilkan angka di layar kunci"
            keterangan="Layar kunci bisa dilihat tanpa membuka kunci. Matikan bila tidak ingin sisa kalori & protein terlihat orang lain."
            nilai={atur.widgetTampilkanAngka}
            onUbah={(v) => ubah({ widgetTampilkanAngka: v })}
            tanpaPadding
          />
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, lineHeight: 19 }}>
            Memasang widget: tahan layar kunci › Sesuaikan › Layar Kunci › ketuk area widget › pilih Recomp.
          </Text>
        </Card>
      </View>
      <SheetJamTimbang
        terbuka={sheetJamTerbuka}
        onTutup={() => setSheetJamTerbuka(false)}
        jam={jadwal}
        waktuTimbang={waktuTimbang}
        onSimpan={(j) => ubah({ jamTimbangMenit: j.hariKerjaMenit, jamAkhirPekanMenit: j.akhirPekanMenit })}
      />
    </ScrollView>
  );
}

function BarisSakelar({
  judul,
  keterangan,
  nilai,
  onUbah,
  tanpaPadding = false,
}: {
  judul: string;
  keterangan: string;
  nilai: boolean;
  onUbah: (v: boolean) => void;
  tanpaPadding?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: tanpaPadding ? 0 : spacing.lg,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{judul}</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, lineHeight: 18 }}>
          {keterangan}
        </Text>
      </View>
      <Switch
        accessibilityLabel={judul}
        value={nilai}
        onValueChange={(v) => {
          ketukRingan();
          onUbah(v);
        }}
        trackColor={{ true: colors.jade, false: colors.surfaceSunken }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const SKENARIO = Object.keys(LABEL_SKENARIO_WIDGET) as SkenarioWidget[];

/**
 * Pratinjau keadaan layar kunci. Widget paling sering dilihat justru saat
 * TIDAK ada angka hari ini — lewat tengah malam, sebelum masuk, sebelum target
 * diatur — jadi keadaan itu ikut dipratinjau, bukan hanya hari yang lengkap.
 */
function PemilihSkenario({
  terpilih,
  onPilih,
}: {
  terpilih: SkenarioWidget;
  onPilih: (s: SkenarioWidget) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        Pratinjau keadaan
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel="Pratinjau keadaan widget"
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {SKENARIO.map((s) => {
          const aktif = s === terpilih;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected: aktif }}
              accessibilityLabel={`Pratinjau: ${LABEL_SKENARIO_WIDGET[s]}`}
              onPress={() => {
                if (aktif) return;
                ketukRingan();
                onPilih(s);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: aktif ? colors.borderKuat : colors.border,
                backgroundColor: aktif ? colors.surfaceSunken : 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: aktif ? colors.text : colors.textMuted }}>
                {LABEL_SKENARIO_WIDGET[s]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PratinjauNotif({ waktu, judul, isi }: { waktu: string; judul: string; isi: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Pratinjau notifikasi: ${judul}. ${isi}`}
      style={{
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>Recomp</Text>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>{waktu}</Text>
      </View>
      <Text style={{ ...typography.label, color: colors.text }}>{judul}</Text>
      <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>{isi}</Text>
    </View>
  );
}

function Pemisah() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />;
}
