import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatWaktuRelatif } from '@recomp/logika';
import { Card, HeaderLayar, SectionHeader, SheetEksporData, SheetImporRiwayat, type SumberImpor, Tombol } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { useEkspor } from '@/state/ekspor';

type StatusImpor = { selesaiPada: string; ringkas: string } | null;

const KARTU: { sumber: SumberImpor; judul: string; isi: string }[] = [
  {
    sumber: 'hevy_csv',
    judul: 'Riwayat latihan Hevy',
    isi: 'Dari berkas ekspor CSV Hevy. Tren kekuatan dan evaluasi 4 mingguan langsung punya bahan.',
  },
  {
    sumber: 'apple_health',
    judul: 'Riwayat Apple Health',
    isi: 'Berat pagi, langkah, energi aktif, dan tidur dari masa sebelum app ini dipasang.',
  },
  {
    sumber: 'ukuran_lama',
    judul: 'Ukuran tubuh lama',
    isi: 'Dari tabel Excel atau catatan lama: pinggang, dada, leher, lengan, paha.',
  },
];

/**
 * Impor & ekspor: riwayat masuk sekali saat mulai, data keluar kapan saja.
 *
 * Impor riwayat sekali, saat mulai.
 *
 * Tanpa riwayat, rata-rata 7 hari butuh sepekan, laju pinggang butuh sebulan,
 * dan evaluasi 4 mingguan pertama baru ada setelah empat pekan memakai app.
 * Layar ini memotong masa tunggu itu — sekali saja, lalu sinkron otomatis
 * yang mengambil alih.
 *
 * "Sekali" bukan berarti terkunci: impor boleh diulang (mis. berkas yang lebih
 * lengkap), dan pengulangannya tidak menggandakan data. Janji itu — dan janji
 * bahwa berat yang diketik sendiri tidak ditimpa berat Apple Health — wajib
 * ditepati task backend yang menulis `import_jobs`.
 */
export default function ImporRiwayatScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Record<SumberImpor, StatusImpor>>({
    hevy_csv: null,
    apple_health: null,
    ukuran_lama: null,
  });
  const [terbuka, setTerbuka] = useState<SumberImpor | null>(null);
  const [eksporTerbuka, setEksporTerbuka] = useState(false);
  const ekspor = useEkspor();
  const sekarang = new Date();

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
      <HeaderLayar kembali judul="Impor & ekspor" subjudul="Riwayat masuk, data Anda keluar" />

      <View>
        <SectionHeader judul="Impor riwayat" aksi="sekali saja" />
        <View style={{ gap: spacing.md }}>
        {KARTU.map((k) => {
          const s = status[k.sumber];
          return (
            <Card key={k.sumber} style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{k.judul}</Text>
                <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                  {k.isi}
                </Text>
              </View>
              {s ? (
                <View style={{ gap: spacing.xxs }}>
                  <Text style={{ ...typography.label, color: colors.status.sukses.teks }}>
                    ✓ Diimpor {formatWaktuRelatif(s.selesaiPada, sekarang)}
                  </Text>
                  <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{s.ringkas}</Text>
                </View>
              ) : null}
              {s ? (
                <Tombol varian="bertepi" label="Impor lagi" onPress={() => setTerbuka(k.sumber)} />
              ) : (
                <Tombol label="Mulai impor" aksesLabel={`Mulai impor ${k.judul}`} onPress={() => setTerbuka(k.sumber)} />
              )}
            </Card>
          );
        })}
        </View>
      </View>

      {/* Ekspor: arah sebaliknya dari impor. Sheet yang sama dengan Privasi,
          jadi berkasnya dan status "siap" sama di kedua pintu. */}
      <View>
        <SectionHeader judul="Ekspor data" aksi="CSV & JSON" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ ...typography.bodyTebal, color: colors.teks }}>Semua data Anda, kapan saja</Text>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
              Catatan harian, makanan, ukuran, latihan, hasil lab, dan percakapan Coach dalam satu berkas zip berisi
              CSV (untuk Excel) dan JSON. Sel yang bisa dibaca sebagai rumus diamankan.
            </Text>
          </View>
          {ekspor.status.jenis === 'siap' ? (
            <Text style={{ ...typography.label, color: colors.status.sukses.teks }}>
              Berkas siap: {ekspor.status.namaBerkas}
            </Text>
          ) : ekspor.status.jenis === 'memproses' ? (
            <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>Berkas sedang disiapkan…</Text>
          ) : null}
          <Tombol varian="bertepi" label="Ekspor data saya" onPress={() => setEksporTerbuka(true)} />
        </Card>
      </View>

      <SheetEksporData terbuka={eksporTerbuka} onTutup={() => setEksporTerbuka(false)} />

      <SheetImporRiwayat
        sumber={terbuka}
        onTutup={() => setTerbuka(null)}
        onSelesai={(sumber, ringkas) =>
          setStatus((lama) => ({ ...lama, [sumber]: { selesaiPada: new Date().toISOString(), ringkas } }))
        }
      />
    </ScrollView>
  );
}
