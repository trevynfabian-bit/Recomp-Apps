import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  DaftarBaris,
  InputAngka,
  InputTarget,
  Isian,
  KerangkaSheet,
  MacroRow,
  PemilihAngka,
  PemilihTanggal,
  Panel,
  Pemisah,
  Pill,
  SectionHeader,
  Tombol,
  TombolBertepi,
  TombolIkon,
  TombolUtama,
  uraiAngka,
} from '@/components';
import { tanggalHariIni } from '@recomp/logika';
import { cariTarget, mockDailyLogHariIni, susunMacros } from '@/mocks/dailyLog';
import { colors, spacing, typography, useSkema } from '@/theme';

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
  const [tanggal, setTanggal] = useState(tanggalHariIni());
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
        <TombolIkon ikon="chevron-back" aksesLabel="Kembali" onPress={() => router.back()} />
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
          <Tombol label="Utama" onPress={() => undefined} />
          <Tombol label="Utama memproses" memproses onPress={() => undefined} />
          <Tombol label="Tersimpan" berhasil onPress={() => undefined} />
          <Tombol label="Utama nonaktif" nonaktif onPress={() => undefined} />
          <Tombol label="Hapus data" varian="merusak" ikon="trash-outline" onPress={() => undefined} />
          <Tombol label="Bertepi" varian="bertepi" onPress={() => undefined} />
          <Tombol label="Bertepi nonaktif" varian="bertepi" nonaktif onPress={() => undefined} />
          <Tombol label="Tautan teks" varian="teks" onPress={() => undefined} />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <Tombol label="Ubah" varian="teks" ukuran="kecil" onPress={() => undefined} />
            <Tombol label="Batal" varian="teks" nada="netral" ukuran="kecil" onPress={() => undefined} />
            <Tombol label="Hapus" varian="teks" nada="bahaya" ukuran="kecil" onPress={() => undefined} />
          </View>
        </Card>
        <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>Ukuran kecil</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Tombol label="Utama" ukuran="kecil" onPress={() => undefined} />
            <Tombol label="Bertepi" ukuran="kecil" varian="bertepi" onPress={() => undefined} />
            <Tombol label="Tambah" ukuran="kecil" varian="bertepi" ikon="add" onPress={() => undefined} />
            <Tombol label="Hapus" ukuran="kecil" varian="merusak" onPress={() => undefined} />
          </View>
          <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>Tombol ikon</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <TombolIkon ikon="chevron-back" aksesLabel="Kembali" onPress={() => undefined} />
            <TombolIkon ikon="add" aksesLabel="Tambah" onPress={() => undefined} />
            <TombolIkon ikon="close" aksesLabel="Tutup" bentuk="polos" onPress={() => undefined} />
            <TombolIkon ikon="add" aksesLabel="Tambah (nonaktif)" nonaktif onPress={() => undefined} />
          </View>
        </Card>
      </Bagian>

      <Bagian judul="Kartu & kontainer">
        <Card>
          <Text style={{ ...typography.bodySedang, color: colors.teks }}>Card</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Permukaan standar: padding lg, radius lg, tepi garis, bayangan kartu.
          </Text>
        </Card>
        <DaftarBaris style={{ marginTop: spacing.md }}>
          {['Baris pertama', 'Baris kedua', 'Baris ketiga'].map((b) => (
            <View key={b} style={{ padding: spacing.lg }}>
              <Text style={{ ...typography.bodySedang, color: colors.teks }}>{b}</Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>DaftarBaris: Pemisah otomatis</Text>
            </View>
          ))}
        </DaftarBaris>
        <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
          <Text style={{ ...typography.bodySedang, color: colors.teks }}>Panel di dalam kartu</Text>
          <Panel>
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>Angka yang dipakai</Text>
            <Text style={{ ...typography.labelBiasa, color: colors.teks }}>Rata-rata 7 hari · 74,5 kg</Text>
          </Panel>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup, flex: 1 }}>Kolom kiri</Text>
            <Pemisah arah="vertikal" />
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup, flex: 1 }}>Kolom kanan</Text>
          </View>
        </Card>
        {(['aksen', 'sukses', 'peringatan', 'bahaya'] as const).map((n) => (
          <Card key={n} nada={n} style={{ marginTop: spacing.md }}>
            <Text style={{ ...typography.bodySedang, color: colors.teks }}>Card nada=&quot;{n}&quot;</Text>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>Tepi bertint; maknanya tetap ditulis.</Text>
          </Card>
        ))}
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
          <Isian label="Email" placeholder="nama@contoh.id" keterangan="Sama dengan akun web." autoCapitalize="none" />
          <Isian label="Berat pagi" unit="kg" angka keyboardType="decimal-pad" defaultValue="74,6" />
          <Isian label="Pinggang" unit="cm" angka defaultValue="120" galat="Di luar rentang wajar 40–200 cm." />
          <Isian label="Nonaktif" defaultValue="Tidak bisa diubah" nonaktif />
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

      <Bagian judul="Pemilih angka & tanggal">
        <Card style={{ gap: spacing.xl }}>
          <PemilihAngka
            nilai={angka}
            onUbah={setAngka}
            langkah={0.1}
            min={30}
            maks={250}
            cadangan={74.6}
            unit="kg"
            unitAkses="kilogram"
            aksesLabel="Berat dalam kilogram"
            galat={(uraiAngka(angka) ?? 0) < 30 ? 'Masukkan berat antara 30 dan 250 kg' : null}
          />
          <PemilihTanggal tanggal={tanggal} onUbah={setTanggal} hariIni={tanggalHariIni()} mundurMaks={7} />
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
