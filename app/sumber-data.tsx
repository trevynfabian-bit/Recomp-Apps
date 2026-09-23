import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kesehatanKoneksi, ringkasanKoneksi, urutkanKoneksi } from '@recomp/logika';
import type { KoneksiSumber, SumberData } from '@recomp/logika';
import {
  Card,
  HeroNumber,
  KartuSumberData,
  SectionHeader,
  SheetHubungkanSumber,
  SheetPutuskanSumber,
} from '@/components';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { mockHubungkan, mockKoneksiSumber, mockPutuskan } from '@/mocks/sumberData';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/** Seberapa sering "12 menit lalu" disegarkan selama layar terbuka. */
const SEGARKAN_MS = 60_000;

/**
 * Layar Sumber Data: apakah data dari Apple Health, WHOOP, Strava, dan Hevy
 * benar-benar mengalir.
 *
 * Pertanyaan yang dijawab layar ini bukan "apa saja yang terhubung", melainkan
 * "apakah ada yang perlu saya lakukan". Karena itu angka utamanya adalah jumlah
 * sumber yang AKTIF, kartu yang butuh tindakan diurutkan paling atas, dan tiap
 * kartu hanya menawarkan satu tindakan yang relevan untuk keadaannya.
 *
 * Fase 3 sisi frontend: koneksi berasal dari data tiruan yang disimpan di state
 * layar ini, dan alur menghubungkan/memutuskan memakai fungsi tiruan yang
 * DISUNTIKKAN ke sheet-nya (`mockHubungkan`, `mockPutuskan`). Task backend cukup
 * menukar kedua fungsi itu dan sumber daftar koneksinya dengan
 * `health_connections`, izin HealthKit, dan OAuth yang sebenarnya.
 */
export default function SumberDataScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sekarang, setSekarang] = useState(() => new Date());
  const [koneksi, setKoneksi] = useState<KoneksiSumber[]>(() => mockKoneksiSumber(sekarang));

  // Waktu relatif ("12 menit lalu") dan status "terlambat" bergantung jam,
  // jadi keduanya disegarkan selama layar terbuka — bukan dibekukan saat dibuka.
  useEffect(() => {
    const id = setInterval(() => setSekarang(new Date()), SEGARKAN_MS);
    return () => clearInterval(id);
  }, []);

  // Urutan ditetapkan SEKALI saat layar dibuka. Kalau diurutkan ulang setiap
  // kali status berubah, kartu yang baru saja disambungkan ulang akan melompat
  // ke bawah tepat di bawah jari pengguna.
  const [urutan] = useState<SumberData[]>(() =>
    urutkanKoneksi(koneksi, sekarang).map((k) => k.sumber),
  );
  const tampil = useMemo(
    () =>
      urutan
        .map((s) => koneksi.find((k) => k.sumber === s))
        .filter((k): k is KoneksiSumber => k !== undefined),
    [urutan, koneksi],
  );

  const ringkasan = ringkasanKoneksi(koneksi, sekarang);

  function ubah(sumber: SumberData, perubahan: Partial<KoneksiSumber>) {
    setKoneksi((lama) => lama.map((k) => (k.sumber === sumber ? { ...k, ...perubahan } : k)));
  }

  // Sheet yang sedang terbuka; `null` berarti tertutup.
  const [akanDihubungkan, setAkanDihubungkan] = useState<SumberData | null>(null);
  const [akanDiputuskan, setAkanDiputuskan] = useState<SumberData | null>(null);

  function terhubung(sumber: SumberData) {
    ubah(sumber, {
      status: 'terhubung',
      terhubungPada: new Date().toISOString(),
      sinkronTerakhir: null,
      galatTerakhir: null,
      masukHariIni: [],
    });
  }

  function sinkronSekarang(sumber: SumberData) {
    ubah(sumber, { sinkronTerakhir: new Date().toISOString(), galatTerakhir: null });
    setSekarang(new Date());
    ketukBerhasil();
  }

  async function putuskan(sumber: SumberData, hapusData: boolean) {
    await mockPutuskan(sumber, hapusData);
    ubah(sumber, {
      status: 'belum',
      terhubungPada: null,
      sinkronTerakhir: null,
      galatTerakhir: null,
      masukHariIni: [],
    });
  }

  const keteranganHero =
    ringkasan.perluPerhatian > 0
      ? `${ringkasan.perluPerhatian} sumber perlu perhatian`
      : ringkasan.belum > 0
        ? `${ringkasan.belum} belum dihubungkan`
        : 'Semua data mengalir';

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
        <View>
          <Text style={{ ...typography.title, color: colors.text }}>Sumber data</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            Apple Health, WHOOP, Strava, Hevy
          </Text>
        </View>
      </View>

      <HeroNumber
        label="Sumber aktif"
        nilai={String(ringkasan.aktif)}
        unit={`dari ${ringkasan.total}`}
        keterangan={keteranganHero}
        warna={ringkasan.perluPerhatian > 0 ? colors.amber : colors.aksenTeks.jade}
      />

      <View style={{ gap: spacing.md }}>
        {tampil.map((k) => (
          <KartuSumberData
            key={k.sumber}
            koneksi={k}
            kesehatan={kesehatanKoneksi(k, sekarang)}
            onHubungkan={() => setAkanDihubungkan(k.sumber)}
            onSinkronSekarang={() => sinkronSekarang(k.sumber)}
            onPutuskan={() => setAkanDiputuskan(k.sumber)}
          />
        ))}
      </View>

      {/* Anti-dobel dijelaskan di sini, di tempat orang menghubungkan perangkat
          kedua — bukan di layar kalori, tempat angka yang "terlalu kecil" baru
          terasa aneh. */}
      <View>
        <SectionHeader judul="Tanpa hitungan ganda" />
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
            Kalau dua perangkat mencatat olahraga yang sama, hanya sumber dengan prioritas
            tertinggi yang dihitung untuk olahraga itu di hari itu.
          </Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
            Langkah dan energi aktif memakai total dari satu sumber saja, tidak pernah
            dijumlahkan antar perangkat.
          </Text>
        </Card>
      </View>

      <SheetHubungkanSumber
        sumber={akanDihubungkan}
        onTutup={() => setAkanDihubungkan(null)}
        hubungkan={mockHubungkan}
        onTerhubung={terhubung}
      />
      <SheetPutuskanSumber
        sumber={akanDiputuskan}
        onTutup={() => setAkanDiputuskan(null)}
        putuskan={putuskan}
      />
    </ScrollView>
  );
}
