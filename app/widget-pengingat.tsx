import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatJamMenit,
  jamPengingatUntuk,
  NOTIF_RINGKASAN,
  NOTIF_TIMBANG,
  ringkasJadwal,
  tanggalHariIni,
} from '@recomp/logika';
import { Card, PratinjauWidget, SectionHeader, SheetJamTimbang } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockPengaturanPengingat, mockRingkasanWidget, mockWaktuTimbang } from '@/mocks/widget';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Pengaturan widget & pengingat.
 *
 * Satu hal yang SENGAJA bukan pengaturan: nada. PRD mewajibkan notifikasi
 * netral, jadi layar ini menyatakannya sebagai janji, bukan sakelar — sakelar
 * "nada tegas" hanya akan menjadi jalan masuk bagi notifikasi yang menegur.
 *
 * Fase 3 sisi frontend: pengaturan hidup di state layar ini. Task backend
 * menyimpannya ke `settings_notifications` dan menjadwalkan notifikasi lokal
 * di perangkat.
 */
export default function WidgetPengingatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [atur, setAtur] = useState(mockPengaturanPengingat);
  const [ringkasan] = useState(() => mockRingkasanWidget());
  const [waktuTimbang] = useState(() => mockWaktuTimbang());
  const [sheetJamTerbuka, setSheetJamTerbuka] = useState(false);

  const ubah = (p: Partial<typeof atur>) => setAtur((lama) => ({ ...lama, ...p }));
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

      {/* --- Pengingat timbang pagi --------------------------------------- */}
      <View>
        <SectionHeader judul="Pengingat" />
        <Card flat>
          <BarisSakelar
            judul="Timbang pagi"
            keterangan="Hanya dikirim bila berat pagi belum tercatat — dari app atau Apple Health."
            nilai={atur.timbangAktif}
            onUbah={(v) => ubah({ timbangAktif: v })}
          />
          {atur.timbangAktif ? (
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
          <Pemisah />
          <BarisSakelar
            judul="Ringkasan mingguan siap"
            keterangan="Senin pagi, saat ringkasan pekan lalu selesai dibuat."
            nilai={atur.ringkasanAktif}
            onUbah={(v) => ubah({ ringkasanAktif: v })}
          />
        </Card>
      </View>

      {/* Pratinjau notifikasi: janji "netral" ditunjukkan, bukan hanya dikatakan. */}
      {atur.timbangAktif || atur.ringkasanAktif ? (
        <View style={{ gap: spacing.sm }}>
          {atur.timbangAktif ? (
            <PratinjauNotif waktu={jam} judul={NOTIF_TIMBANG.judul} isi={NOTIF_TIMBANG.isi} />
          ) : null}
          {atur.ringkasanAktif ? (
            <PratinjauNotif waktu="Sen" judul={NOTIF_RINGKASAN.judul} isi={NOTIF_RINGKASAN.isi} />
          ) : null}
        </View>
      ) : null}

      <Card style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.label, color: colors.text }}>Nada selalu netral</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          Tidak ada notifikasi &ldquo;melebihi target&rdquo; atau peringatan berwarna. Pengingat membantu
          kebiasaan; angkanya dibaca di app, tanpa penilaian.
        </Text>
      </Card>

      {/* --- Widget layar kunci -------------------------------------------- */}
      <View>
        <SectionHeader judul="Widget layar kunci" />
        <Card style={{ gap: spacing.lg }}>
          <PratinjauWidget ringkasan={ringkasan} tampilkanAngka={atur.widgetTampilkanAngka} />
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
