import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatAngka,
  labelTanggalRelatif,
  MAKS_REPS_E1RM,
  ringkasPekan,
  tanggalDariWaktu,
  tanggalHariIni,
} from '@recomp/logika';
import type { SesiLatihan } from '@recomp/logika';
import { Card, HeroNumber, KartuSesiLatihan, SectionHeader, TombolIkon } from '@/components';
import { mockSesiLatihan } from '@/mocks/latihan';
import { colors, spacing, typography } from '@/theme';

/**
 * Layar Latihan: sesi yang masuk dari Hevy.
 *
 * HANYA BACA. Latihan dicatat di Hevy dan PRD sengaja tidak memindahkannya ke
 * sini — dua tempat mencatat set yang sama pasti berselisih. Tidak ada tombol
 * tambah atau ubah, dan layar ini mengatakannya di bawah judul supaya orang
 * tidak mencarinya.
 *
 * Fase 3 sisi frontend: data tiruan; task backend menukarnya dengan
 * `workouts` + `workout_sets` yang ditarik cron Hevy.
 */
export default function LatihanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sesi] = useState<SesiLatihan[]>(() => mockSesiLatihan());
  const hariIni = tanggalHariIni();

  // Sesi terbaru dibuka lebih dulu: itu yang hampir selalu dicari.
  const terbaru = useMemo(
    () => [...sesi].sort((a, b) => b.mulai.localeCompare(a.mulai)),
    [sesi],
  );
  const [terbuka, setTerbuka] = useState<Set<string>>(() => new Set(terbaru[0] ? [terbaru[0].id] : []));

  const kelompok = useMemo(() => {
    const hasil: { tanggal: string; sesi: SesiLatihan[] }[] = [];
    for (const s of terbaru) {
      const t = tanggalDariWaktu(s.mulai);
      const akhir = hasil[hasil.length - 1];
      if (akhir && akhir.tanggal === t) akhir.sesi.push(s);
      else hasil.push({ tanggal: t, sesi: [s] });
    }
    return hasil;
  }, [terbaru]);

  const pekan = ringkasPekan(sesi, hariIni);

  function alih(id: string) {
    setTerbuka((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

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
        <View>
          <Text style={{ ...typography.title, color: colors.teks }}>Latihan</Text>
          <Text style={{ ...typography.label, color: colors.teksSamar, marginTop: spacing.xxs }}>
            Dibaca dari Hevy · dicatat di Hevy, bukan di sini
          </Text>
        </View>
      </View>

      <HeroNumber
        label="Pekan ini"
        nilai={String(pekan.jumlahSesi)}
        unit="sesi"
        keterangan={pekan.jumlahSesi > 0 ? `Volume ${formatAngka(pekan.volumeKg)} kg` : 'Belum ada sesi pekan ini'}
      />

      {kelompok.length === 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.bodySedang, color: colors.teks }}>
            Belum ada latihan dari Hevy
          </Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Latihan yang Anda catat di Hevy masuk otomatis setiap jam setelah Hevy dihubungkan di
            Sumber data.
          </Text>
        </Card>
      ) : (
        kelompok.map((k) => (
          <View key={k.tanggal}>
            <SectionHeader judul={labelTanggalRelatif(k.tanggal, hariIni)} />
            <View style={{ gap: spacing.md }}>
              {k.sesi.map((s) => (
                <KartuSesiLatihan key={s.id} sesi={s} terbuka={terbuka.has(s.id)} onAlih={() => alih(s.id)} />
              ))}
            </View>
          </View>
        ))
      )}

      <Card style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.label, color: colors.teks }}>Tentang e1RM</Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Perkiraan beban maksimal untuk satu repetisi, dihitung dengan rumus Epley dari set terbaik
          tiap latihan. Hanya set dengan paling banyak {MAKS_REPS_E1RM} repetisi yang dipakai; di atas
          itu, perkiraannya terlalu jauh dari beban sebenarnya. Latihan berat badan (BB) tidak
          diperkirakan.
        </Text>
      </Card>
    </ScrollView>
  );
}
