import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAngka } from '@recomp/logika';
import { Card, HeroNumber, MacroRow, Pill, SectionHeader, TombolBertepi, TombolUtama } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { cariTarget, mockDailyLogHariIni, susunMacros } from '@/mocks/dailyLog';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Layar contoh arah visual (docs/desain/arah-visual.md).
 *
 * Bukan fitur: satu layar acuan yang menaruh palet semantik, tangga tipografi,
 * token jarak/radius, dan komposisi kartu berdampingan, supaya keputusan
 * desain bisa dinilai di perangkat sebelum diterapkan ke 19 layar. Hanya
 * dibuka dari Pengaturan pada build pengembangan. Data dari `src/mocks`.
 */

// Varian tipografi bab 2.3. Dipindahkan ke `src/theme/tokens.ts` di Fase 2;
// di sini dulu supaya layar contoh bisa menilainya sebelum tokennya resmi.
const usulanTipografi = {
  hero: { ...typography.hero, lineHeight: 68 },
  display: { ...typography.display, lineHeight: 40 },
  title: { ...typography.title, lineHeight: 26 },
  body: { ...typography.body, lineHeight: 24 },
  bodySedang: { ...typography.body, fontWeight: '600', lineHeight: 24 },
  bodyTebal: { ...typography.body, fontWeight: '700', lineHeight: 24 },
  label: { ...typography.label, lineHeight: 19 },
  labelBiasa: { ...typography.label, fontWeight: '500', lineHeight: 19 },
  caption: { ...typography.caption, lineHeight: 16 },
} as const;

/** Palet semantik bab 1: peran → warna isian & warna teks kecil. */
const PERAN: { nama: string; isian: string; teks: string; arti: string }[] = [
  { nama: 'aksen', isian: colors.amber, teks: colors.amber, arti: 'CTA, angka hero, tab aktif' },
  { nama: 'sukses', isian: colors.jade, teks: colors.aksenTeks.jade, arti: 'on-track, tersambung' },
  { nama: 'peringatan', isian: colors.amber, teks: colors.amber, arti: 'mendekati batas' },
  { nama: 'bahaya', isian: colors.coral, teks: colors.aksenTeks.coral, arti: 'lewat batas, hapus' },
  { nama: 'info', isian: colors.macro.karbo, teks: colors.macroTeks.karbo, arti: 'estimasi, keterangan' },
];

const NETRAL: { nama: string; warna: string }[] = [
  { nama: 'latar', warna: colors.bg },
  { nama: 'permukaan', warna: colors.surface },
  { nama: 'permukaanCekung', warna: colors.surfaceSunken },
  { nama: 'garis', warna: colors.border },
  { nama: 'garisKontrol', warna: colors.borderKuat },
];

const JARAK = [
  { nama: 'xxs', nilai: 2 },
  ...Object.entries(spacing).map(([nama, nilai]) => ({ nama, nilai })),
];

export default function ArahVisualScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const log = mockDailyLogHariIni;
  const target = cariTarget(log.day_type_id, 'Lean Gain');
  // Kalori sudah jadi angka hero; baris makro di bawahnya tidak mengulangnya.
  const makro = susunMacros(log, target).filter((m) => m.key !== 'kalori' && m.key !== 'karbo');
  const sisa = target.target_kalori - log.kalori;

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
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ ...usulanTipografi.title, color: colors.text }}>
            Arah visual
          </Text>
          <Text style={{ ...usulanTipografi.labelBiasa, color: colors.textFaint }}>
            Layar acuan · data tiruan
          </Text>
        </View>
      </View>

      {/* Komposisi: satu angka hero, lalu kartu pendukung dengan kepadatan rapat. */}
      <Card style={{ paddingVertical: spacing.xl, gap: spacing.xl }}>
        <HeroNumber
          label="Sisa kalori hari ini"
          nilai={formatAngka(sisa)}
          unit="kcal"
          keterangan={`dari target ${formatAngka(target.target_kalori)} kcal`}
        />
        <View style={{ gap: spacing.lg }}>
          {makro.map((m) => (
            <MacroRow key={m.key} macro={m} mode="sisa" />
          ))}
        </View>
      </Card>

      <View>
        <SectionHeader judul="Palet · status" aksi="isian / teks" />
        <Card style={{ gap: spacing.md }}>
          {PERAN.map((p) => (
            <View key={p.nama} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: p.isian }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ ...usulanTipografi.bodySedang, color: p.teks }}>{p.nama}</Text>
                <Text style={{ ...usulanTipografi.labelBiasa, color: colors.textFaint }}>{p.arti}</Text>
              </View>
              <Pill label={p.nama} warna={p.teks} />
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader judul="Palet · netral" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {NETRAL.map((n) => (
              <View
                key={n.nama}
                accessibilityLabel={n.nama}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: n.warna,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            ))}
          </View>
          <Text style={{ ...usulanTipografi.body, color: colors.text }}>teks — isi utama</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.textMuted }}>teksRedup — pendukung</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.textFaint }}>teksSamar — label & unit</Text>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Tipografi" aksi="ukuran / tinggi baris" />
        <Card style={{ gap: spacing.md }}>
          <Text style={{ ...usulanTipografi.display, color: colors.text }}>Display 34/40</Text>
          <Text style={{ ...usulanTipografi.title, color: colors.text }}>Title 20/26</Text>
          <Text style={{ ...usulanTipografi.bodyTebal, color: colors.text }}>Body tebal 16/24 · 700</Text>
          <Text style={{ ...usulanTipografi.bodySedang, color: colors.text }}>Body sedang 16/24 · 600</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.text }}>Body 16/24 · 500</Text>
          <Text style={{ ...usulanTipografi.label, color: colors.textMuted }}>Label 13/19 · 600</Text>
          <Text style={{ ...usulanTipografi.labelBiasa, color: colors.textMuted }}>
            Label biasa 13/19 · 500 — teks keterangan dua baris atau lebih memakai gaya ini, dengan tinggi baris yang
            sudah dibawa tokennya.
          </Text>
          <Text style={{ ...usulanTipografi.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
            Caption 11/16 · label grup
          </Text>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Jarak & radius" />
        <Card style={{ gap: spacing.sm }}>
          {JARAK.map((j) => (
            <View key={j.nama} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Text style={{ ...usulanTipografi.label, color: colors.textMuted, width: 40 }}>{j.nama}</Text>
              <View style={{ width: j.nilai * 4, height: 8, borderRadius: radius.pill, backgroundColor: colors.amber }} />
              <Text style={{ ...usulanTipografi.caption, color: colors.textFaint }}>{j.nilai}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            {(['sm', 'md', 'lg', 'xl'] as const).map((r) => (
              <View
                key={r}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: radius[r],
                  backgroundColor: colors.surfaceSunken,
                  borderWidth: 1,
                  borderColor: colors.borderKuat,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...usulanTipografi.caption, color: colors.textFaint }}>{r}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Aksi" />
        <Card style={{ gap: spacing.md }}>
          <TombolUtama label="Simpan" onPress={() => undefined} />
          <TombolBertepi label="Batal" onPress={() => undefined} />
          <TombolUtama label="Hapus data" merusak onPress={() => undefined} />
        </Card>
      </View>
    </ScrollView>
  );
}
