import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kesehatanKoneksi, ringkasanKoneksi, urutkanKoneksi } from '@recomp/logika';
import type { KoneksiSumber, SumberData } from '@recomp/logika';
import {
  BarisTautan,
  Card,
  HeaderLayar,
  KartuHero,
  KartuSumberData,
  SectionHeader,
  SheetHubungkanSumber,
  SheetPutuskanSumber,
} from '@/components';
import { ketukBerhasil, ketukRingan } from '@/lib/haptics';
import { mockHubungkan, mockPutuskan } from '@/mocks/sumberData';
import { useSinkron } from '@/state/sinkron';
import { colors, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Layar Sumber Data: apakah data dari Apple Health, WHOOP, Strava, dan Hevy
 * benar-benar mengalir.
 *
 * Pertanyaan yang dijawab layar ini bukan "apa saja yang terhubung", melainkan
 * "apakah ada yang perlu saya lakukan". Karena itu angka utamanya adalah jumlah
 * sumber yang AKTIF, kartu yang butuh tindakan diurutkan paling atas, dan tiap
 * kartu hanya menawarkan satu tindakan yang relevan untuk keadaannya.
 *
 * Fase 3 sisi frontend: koneksi berasal dari data tiruan di penyedia sinkron
 * bersama (`useSinkron`), dan alur menghubungkan/memutuskan memakai fungsi tiruan yang
 * DISUNTIKKAN ke sheet-nya (`mockHubungkan`, `mockPutuskan`). Task backend cukup
 * menukar kedua fungsi itu dan sumber daftar koneksinya dengan
 * `health_connections`, izin HealthKit, dan OAuth yang sebenarnya.
 */
export default function SumberDataScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Koneksi dan jam dibaca dari penyedia sinkron BERSAMA, bukan state layar:
  // indikator di layar Hari Ini membaca daftar yang sama, jadi menyambung ulang
  // di sini langsung menghapus "perlu perhatian" di sana.
  const { koneksi, ubahKoneksi: ubah, sekarang } = useSinkron();

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
        judul="Sumber data"
        subjudul="Apple Health, WHOOP, Strava, Hevy"
      />

      <KartuHero
        label="Sumber aktif"
        nilai={String(ringkasan.aktif)}
        unit={`dari ${ringkasan.total}`}
        keterangan={keteranganHero}
        nada="netral"
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
            tautan={
              k.sumber === 'hevy'
                ? { label: 'Lihat latihan dari Hevy', onPress: () => router.push('/latihan') }
                : undefined
            }
          />
        ))}
      </View>

      {/* Riwayat lama: pintu satu kali, di bawah sumber yang mengalir. */}
      <Card flat>
        <BarisTautan
          judul="Impor riwayat lama"
          keterangan="Sekali saja: Hevy CSV, Apple Health, ukuran tubuh"
          aksesLabel="Impor riwayat lama: Hevy, Apple Health, ukuran tubuh"
          onPress={() => router.push('/impor-riwayat')}
        />
      </Card>

      {/* Anti-dobel dijelaskan di sini, di tempat orang menghubungkan perangkat
          kedua — bukan di layar kalori, tempat angka yang "terlalu kecil" baru
          terasa aneh. */}
      <View>
        <SectionHeader judul="Tanpa hitungan ganda" />
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Kalau dua perangkat mencatat olahraga yang sama, hanya sumber dengan prioritas
            tertinggi yang dihitung untuk olahraga itu di hari itu.
          </Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
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
