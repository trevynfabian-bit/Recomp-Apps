import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatTanggalPanjang,
  kalimatRingkasanLab,
  kelompokkanPerTahun,
  posisiPenanda,
  ringkasHasilLab,
} from '@recomp/logika';
import type { HasilLab } from '@recomp/logika';
import { Card, SectionHeader } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockRiwayatLab } from '@/mocks/hasilLab';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Riwayat hasil lab.
 *
 * Hasil lab dibaca coach sebagai KONTEKS, bukan dasar diagnosis atau saran
 * dosis. Layar ini karena itu hanya menyatakan fakta dari kertas hasilnya:
 * panel, tanggal, laboratorium, jumlah penanda, dan penanda mana yang berada
 * di luar rentang rujukan LABORATORIUM itu sendiri — tanpa kata "tinggi",
 * "buruk", atau warna alarm. Artinya dibicarakan dengan dokter.
 *
 * Dikelompokkan per tahun, terbaru lebih dulu: hasil lab datang beberapa kali
 * setahun, dan membandingkan "September lalu" dengan "Desember sebelumnya"
 * adalah cara orang biasanya membacanya.
 *
 * Fase 4 sisi frontend: data tiruan (`@/mocks/hasilLab`).
 */
export default function HasilLabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const kelompok = kelompokkanPerTahun(mockRiwayatLab);

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
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ ...typography.title, color: colors.text }}>
            Hasil lab
          </Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            {mockRiwayatLab.length > 0 ? `${mockRiwayatLab.length} hasil tersimpan` : 'Belum ada yang tersimpan'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Ionicons name="flask-outline" size={20} color={colors.textMuted} />
        <Text style={{ flex: 1, ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          Dibaca coach sebagai konteks, bukan dasar saran dosis atau diagnosis. Rentang rujukan adalah milik
          laboratorium yang memeriksa; artinya dibicarakan dengan dokter.
        </Text>
      </View>

      {kelompok.length === 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>Belum ada hasil lab</Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
            Hasil lab yang Anda tambahkan akan tampil di sini, dikelompokkan per tahun, dan dibaca coach sebagai konteks.
          </Text>
        </Card>
      ) : null}

      {kelompok.map((k) => (
        <View key={k.tahun}>
          <SectionHeader judul={k.tahun} aksi={`${k.hasil.length} hasil`} />
          <View accessibilityRole="list" style={{ gap: spacing.md }}>
            {k.hasil.map((h) => (
              <KartuHasilLab key={h.id} hasil={h} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function KartuHasilLab({ hasil }: { hasil: HasilLab }) {
  const r = ringkasHasilLab(hasil);
  const tanggal = formatTanggalPanjang(hasil.tanggal).split(', ')[1];
  const ringkasan = kalimatRingkasanLab(r);
  const luar = r.diLuarRentang.map((p) => `${p.nama} ${posisiPenanda(p)}`);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View
        accessible
        accessibilityLabel={`${hasil.nama}, ${tanggal} ${hasil.tanggal.slice(0, 4)}${hasil.laboratorium ? `, ${hasil.laboratorium}` : ''}. ${ringkasan}.${luar.length ? ` ${luar.join('; ')}.` : ''}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
          <Text style={{ flex: 1, ...typography.body, fontWeight: '700', color: colors.text }}>{hasil.nama}</Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{tanggal}</Text>
        </View>
        {hasil.laboratorium ? (
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{hasil.laboratorium}</Text>
        ) : null}
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>{ringkasan}</Text>
        {r.diLuarRentang.length > 0 ? (
          <View style={{ gap: 2 }}>
            {r.diLuarRentang.map((p) => (
              <Text key={p.nama} style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
                · {p.nama}: {posisiPenanda(p)} rujukan
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
