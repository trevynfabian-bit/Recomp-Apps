import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatWaktuRelatif } from '@recomp/logika';
import { Card, SheetImporRiwayat, TombolBertepi, TombolUtama, type SumberImpor } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

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
  const router = useRouter();
  const [status, setStatus] = useState<Record<SumberImpor, StatusImpor>>({
    hevy_csv: null,
    apple_health: null,
    ukuran_lama: null,
  });
  const [terbuka, setTerbuka] = useState<SumberImpor | null>(null);
  const sekarang = new Date();

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
          <Text style={{ ...typography.title, color: colors.text }}>Impor riwayat</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            Sekali saja, supaya tren tidak mulai dari nol
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        {KARTU.map((k) => {
          const s = status[k.sumber];
          return (
            <Card key={k.sumber} style={{ gap: spacing.md }}>
              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>{k.judul}</Text>
                <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
                  {k.isi}
                </Text>
              </View>
              {s ? (
                <View style={{ gap: 2 }}>
                  <Text style={{ ...typography.label, color: colors.aksenTeks.jade }}>
                    ✓ Diimpor {formatWaktuRelatif(s.selesaiPada, sekarang)}
                  </Text>
                  <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{s.ringkas}</Text>
                </View>
              ) : null}
              {s ? (
                <TombolBertepi label="Impor lagi" onPress={() => setTerbuka(k.sumber)} />
              ) : (
                <TombolUtama label="Mulai impor" aksesLabel={`Mulai impor ${k.judul}`} onPress={() => setTerbuka(k.sumber)} />
              )}
            </Card>
          );
        })}
      </View>

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
