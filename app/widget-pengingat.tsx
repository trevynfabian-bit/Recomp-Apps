import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatJamMenit,
  geserJamTimbang,
  LANGKAH_JAM_MENIT,
  NOTIF_RINGKASAN,
  NOTIF_TIMBANG,
  RENTANG_JAM_TIMBANG,
} from '@recomp/logika';
import { Card, PratinjauWidget, SectionHeader } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockPengaturanPengingat, mockRingkasanWidget } from '@/mocks/widget';
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

  const ubah = (p: Partial<typeof atur>) => setAtur((lama) => ({ ...lama, ...p }));
  const jam = formatJamMenit(atur.jamTimbangMenit);

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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.lg,
              }}
            >
              <Text style={{ ...typography.label, color: colors.textMuted }}>Jam</Text>
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={`Jam pengingat timbang, ${jam}`}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={(e) =>
                  ubah({
                    jamTimbangMenit: geserJamTimbang(
                      atur.jamTimbangMenit,
                      e.nativeEvent.actionName === 'increment' ? LANGKAH_JAM_MENIT : -LANGKAH_JAM_MENIT,
                    ),
                  })
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
              >
                <TombolGeser
                  label="−"
                  nonaktif={atur.jamTimbangMenit <= RENTANG_JAM_TIMBANG.min}
                  onPress={() => ubah({ jamTimbangMenit: geserJamTimbang(atur.jamTimbangMenit, -LANGKAH_JAM_MENIT) })}
                />
                <Text style={{ ...typography.title, color: colors.text, minWidth: 72, textAlign: 'center' }}>{jam}</Text>
                <TombolGeser
                  label="+"
                  nonaktif={atur.jamTimbangMenit >= RENTANG_JAM_TIMBANG.maks}
                  onPress={() => ubah({ jamTimbangMenit: geserJamTimbang(atur.jamTimbangMenit, LANGKAH_JAM_MENIT) })}
                />
              </View>
            </View>
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

function TombolGeser({ label, onPress, nonaktif }: { label: string; onPress: () => void; nonaktif: boolean }) {
  return (
    <Pressable
      // Dibungkus elemen `adjustable` di atas; pembaca layar memakai aksi
      // naik/turun pada pembungkusnya, bukan dua tombol terpisah.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      disabled={nonaktif}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        width: TAP_MIN,
        height: TAP_MIN,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.borderKuat,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: nonaktif ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.title, color: colors.text }}>{label}</Text>
    </Pressable>
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
