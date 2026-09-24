import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  InputAngka,
  InputTarget,
  KerangkaSheet,
  MacroRow,
  Pill,
  SectionHeader,
  TombolBertepi,
  TombolUtama,
} from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { cariTarget, mockDailyLogHariIni, susunMacros } from '@/mocks/dailyLog';
import { colors, radius, spacing, TAP_MIN, typography, useSkema } from '@/theme';

/**
 * Peraga komponen (docs/desain/audit-komponen.md).
 *
 * Setiap komponen inti dalam SEMUA keadaannya — normal, nonaktif, memproses,
 * galat — di satu layar, dalam skema yang sedang berlaku. Dipakai untuk menilai
 * komponen tanpa harus mencari layar yang kebetulan memunculkan keadaan itu.
 * Hanya dibuka dari Pengaturan pada build pengembangan. Data dari `src/mocks`.
 *
 * Halaman ini tumbuh bersama task Komponen Inti Terpadu: setiap komponen inti
 * baru ditambahkan di sini dalam task yang membuatnya.
 */
export default function PeragaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const skema = useSkema();
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [angka, setAngka] = useState('74,6');
  const [target, setTarget] = useState('3100');
  const log = mockDailyLogHariIni;
  const makro = susunMacros(log, cariTarget(log.day_type_id, 'Lean Gain'));

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
            backgroundColor: colors.permukaan,
            borderWidth: 1,
            borderColor: colors.garisKontrol,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ ...typography.title, color: colors.teks }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text accessibilityRole="header" style={{ ...typography.title, color: colors.teks }}>
            Peraga komponen
          </Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Skema {skema} · data tiruan
          </Text>
        </View>
      </View>

      <Bagian judul="Tombol & aksi">
        <Card style={{ gap: spacing.md }}>
          <TombolUtama label="Utama" onPress={() => undefined} />
          <TombolUtama label="Utama memproses" memproses onPress={() => undefined} />
          <TombolUtama label="Utama nonaktif" nonaktif onPress={() => undefined} />
          <TombolUtama label="Merusak" merusak onPress={() => undefined} />
          <TombolBertepi label="Bertepi" onPress={() => undefined} />
          <TombolBertepi label="Bertepi nonaktif" nonaktif onPress={() => undefined} />
        </Card>
      </Bagian>

      <Bagian judul="Kartu & kontainer">
        <Card>
          <Text style={{ ...typography.bodySedang, color: colors.teks }}>Card</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Permukaan standar: padding lg, radius lg, tepi garis, bayangan kartu.
          </Text>
        </Card>
        <Card flat style={{ marginTop: spacing.md }}>
          {['Baris pertama', 'Baris kedua'].map((b, i) => (
            <View
              key={b}
              style={{
                padding: spacing.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.garis,
              }}
            >
              <Text style={{ ...typography.bodySedang, color: colors.teks }}>{b}</Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>Card flat untuk daftar baris</Text>
            </View>
          ))}
        </Card>
      </Bagian>

      <Bagian judul="Label & pill">
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Pill diKartu label="Aksen" warna={colors.aksen.teks} />
            <Pill diKartu label="Sukses" warna={colors.status.sukses.teks} />
            <Pill diKartu label="Bahaya" warna={colors.status.bahaya.teks} />
            <Pill diKartu label="Info" warna={colors.status.info.teks} />
            <Pill diKartu label="Netral" />
          </View>
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Di atas kartu pill tanpa isian (`diKartu`); pill bertint hanya di atas latar layar.
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
          <Pill label="Lean Gain" warna={colors.status.sukses.teks} />
          <Pill label="Estimasi" warna={colors.status.peringatan.teks} />
        </View>
      </Bagian>

      <Bagian judul="Formulir & input">
        <Card style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <InputAngka label="Berat" nilai={angka} unit="kg" onUbah={setAngka} />
            <InputAngka label="Protein" nilai="42" unit="g" onUbah={() => undefined} warna={colors.macroTeks.protein} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <InputTarget
              label="Kalori"
              unit="kcal"
              nilai={target}
              aksesLabel="Target kalori"
              ditandai={false}
              onUbah={setTarget}
              onTinggalkan={() => undefined}
              nonaktif={false}
            />
            <InputTarget
              label="Lemak (galat)"
              unit="g"
              nilai="0"
              aksesLabel="Target lemak"
              ditandai
              onUbah={() => undefined}
              onTinggalkan={() => undefined}
              nonaktif={false}
            />
          </View>
        </Card>
      </Bagian>

      <Bagian judul="Angka & makro">
        <Card style={{ gap: spacing.lg }}>
          {makro.slice(0, 3).map((m) => (
            <MacroRow key={m.key} macro={m} mode="sisa" />
          ))}
        </Card>
      </Bagian>

      <Bagian judul="Sheet">
        <TombolBertepi label="Buka KerangkaSheet" onPress={() => setSheetTerbuka(true)} />
        <KerangkaSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} label="Peraga">
          <Text style={{ ...typography.title, color: colors.teks }}>Kerangka sheet</Text>
          <Text style={{ ...typography.body, color: colors.teksRedup }}>
            Selubung, pegangan, label, dan isi yang bisa digulir.
          </Text>
          <TombolUtama label="Tutup" onPress={() => setSheetTerbuka(false)} />
        </KerangkaSheet>
      </Bagian>
    </ScrollView>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <View>
      <SectionHeader judul={judul} />
      {children}
    </View>
  );
}
