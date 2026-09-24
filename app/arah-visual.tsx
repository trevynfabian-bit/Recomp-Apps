import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAngka } from '@recomp/logika';
import { Card, HeaderLayar, HeroNumber, MacroRow, Pill, SectionHeader, TombolBertepi, TombolUtama } from '@/components';
import { cariTarget, mockDailyLogHariIni, susunMacros } from '@/mocks/dailyLog';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Layar contoh arah visual (docs/desain/arah-visual.md).
 *
 * Bukan fitur: satu layar acuan yang menaruh palet semantik, tangga tipografi,
 * token jarak/radius, dan komposisi kartu berdampingan, supaya keputusan
 * desain bisa dinilai di perangkat sebelum diterapkan ke 19 layar. Hanya
 * dibuka dari Pengaturan pada build pengembangan. Data dari `src/mocks`.
 */

// Semua gaya kini resmi di `src/theme/tokens.ts`, tinggi baris sudah dibawa tokennya.
const usulanTipografi = typography;

/** Palet semantik bab 1: peran → warna isian & warna teks kecil. */
/** Dibaca saat render: `colors` berganti isi saat skema berganti. */
const peran = (): { nama: string; isian: string; teks: string; arti: string }[] => [
  { nama: 'aksen', isian: colors.aksen.isian, teks: colors.aksen.isian, arti: 'CTA, angka hero, tab aktif' },
  { nama: 'sukses', isian: colors.status.sukses.isian, teks: colors.status.sukses.teks, arti: 'on-track, tersambung' },
  { nama: 'peringatan', isian: colors.aksen.isian, teks: colors.aksen.isian, arti: 'mendekati batas' },
  { nama: 'bahaya', isian: colors.status.bahaya.isian, teks: colors.status.bahaya.teks, arti: 'lewat batas, hapus' },
  { nama: 'info', isian: colors.macro.karbo, teks: colors.macroTeks.karbo, arti: 'estimasi, keterangan' },
];

const netral = (): { nama: string; warna: string }[] => [
  { nama: 'latar', warna: colors.latar },
  { nama: 'permukaan', warna: colors.permukaan },
  { nama: 'permukaanCekung', warna: colors.permukaanCekung },
  { nama: 'garis', warna: colors.garis },
  { nama: 'garisKontrol', warna: colors.garisKontrol },
];

const JARAK = Object.entries(spacing).map(([nama, nilai]) => ({ nama, nilai }));

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
      style={{ flex: 1, backgroundColor: colors.latar }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <HeaderLayar
        kembali
        judul="Arah visual"
        subjudul="Layar acuan · data tiruan"
      />

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
          {peran().map((p) => (
            <View key={p.nama} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: p.isian }} />
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text style={{ ...usulanTipografi.bodySedang, color: p.teks }}>{p.nama}</Text>
                <Text style={{ ...usulanTipografi.labelBiasa, color: colors.teksSamar }}>{p.arti}</Text>
              </View>
              <Pill diKartu label={p.nama} warna={p.teks} />
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader judul="Palet · netral" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {netral().map((n) => (
              <View
                key={n.nama}
                accessibilityLabel={n.nama}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: n.warna,
                  borderWidth: 1,
                  borderColor: colors.garis,
                }}
              />
            ))}
          </View>
          <Text style={{ ...usulanTipografi.body, color: colors.teks }}>teks — isi utama</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.teksRedup }}>teksRedup — pendukung</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.teksSamar }}>teksSamar — label & unit</Text>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Tipografi" aksi="ukuran / tinggi baris" />
        <Card style={{ gap: spacing.md }}>
          <Text style={{ ...usulanTipografi.display, color: colors.teks }}>Display 34/40</Text>
          <Text style={{ ...usulanTipografi.title, color: colors.teks }}>Title 20/26</Text>
          <Text style={{ ...usulanTipografi.bodyTebal, color: colors.teks }}>Body tebal 16/24 · 700</Text>
          <Text style={{ ...usulanTipografi.bodySedang, color: colors.teks }}>Body sedang 16/24 · 600</Text>
          <Text style={{ ...usulanTipografi.body, color: colors.teks }}>Body 16/24 · 500</Text>
          <Text style={{ ...usulanTipografi.label, color: colors.teksRedup }}>Label 13/19 · 600</Text>
          <Text style={{ ...usulanTipografi.labelBiasa, color: colors.teksRedup }}>
            Label biasa 13/19 · 500 — teks keterangan dua baris atau lebih memakai gaya ini, dengan tinggi baris yang
            sudah dibawa tokennya.
          </Text>
          <Text style={{ ...usulanTipografi.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
            Caption 11/16 · label grup
          </Text>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Jarak & radius" />
        <Card style={{ gap: spacing.sm }}>
          {JARAK.map((j) => (
            <View key={j.nama} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Text style={{ ...usulanTipografi.label, color: colors.teksRedup, width: 40 }}>{j.nama}</Text>
              <View style={{ width: j.nilai * 4, height: 8, borderRadius: radius.pill, backgroundColor: colors.aksen.isian }} />
              <Text style={{ ...usulanTipografi.caption, color: colors.teksSamar }}>{j.nilai}</Text>
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
                  backgroundColor: colors.permukaanCekung,
                  borderWidth: 1,
                  borderColor: colors.garisKontrol,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...usulanTipografi.caption, color: colors.teksSamar }}>{r}</Text>
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
