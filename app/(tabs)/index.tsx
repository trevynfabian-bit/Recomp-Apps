import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  HeroNumber,
  KartuCatatan,
  KartuTimbangPagi,
  LegendaSumber,
  PanelRingkasanMakro,
  PemilihTipeHari,
  PenandaSumber,
  Pill,
  SectionHeader,
  SheetCatatFoto,
  type EntriMakananBaru,
} from '@/components';
import { formatAngka, formatMakro, formatTanggalPanjang } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import { deteksiTipeHari } from '@recomp/logika';
import { hitungEstimasi, sumberMakanan } from '@/lib/sumber';
import { mockWorkoutsHariIni } from '@/mocks/workout';
import {
  beratTerakhirSebelum,
  cariTarget,
  mockDailyLogHariIni,
  mockDayTypes,
  mockFoodLogsHariIni,
  mockProfile,
  riwayatBeratTerakhir,
  simpanBeratStub,
  susunMacros,
} from '@/mocks/dailyLog';
import { colors, radius, spacing, typography } from '@/theme';
import type { DailyLog, FoodLog } from '@/types/domain';

/**
 * Layar utama Log Harian.
 * Fase 1 frontend: seluruh angka berasal dari data tiruan di `@/mocks/dailyLog`
 * dan perubahan hanya hidup di state layar ini. Penggantian ke Supabase
 * dilakukan di task layer backend tanpa mengubah layout.
 */
export default function LogHarianScreen() {
  const insets = useSafeAreaInsets();

  // Log hari ini disimpan di state supaya kartu Timbang Pagi & pemilih tipe hari
  // bisa menulis balik. Semua angka target diturunkan dari state ini.
  const [log, setLog] = useState<DailyLog>(mockDailyLogHariIni);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>(mockFoodLogsHariIni);
  const [sheetFotoTerbuka, setSheetFotoTerbuka] = useState(false);

  const fase = mockProfile.fase_aktif;

  // Tanpa override, tipe hari MENGIKUTI hasil deteksi dari workout hari ini;
  // dengan override, pilihan pengguna yang menang.
  const deteksi = deteksiTipeHari(mockWorkoutsHariIni, mockDayTypes);
  const dayTypeId =
    log.day_type_override || deteksi.dayTypeId === null ? log.day_type_id : deteksi.dayTypeId;

  const dayType = mockDayTypes.find((d) => d.id === dayTypeId) ?? mockDayTypes[0];
  const target = cariTarget(dayTypeId, fase);
  const macros = susunMacros(log, target);

  const sisaKalori = target.target_kalori - log.kalori;
  const sisaProtein = target.target_protein_g - log.protein_g;
  const sisaLemak = target.target_lemak_g - log.lemak_g;
  const beratSebelumnya = beratTerakhirSebelum(log.tanggal);
  const jumlahEstimasi = hitungEstimasi(foodLogs);

  /**
   * Simpan berat pagi. Sengaja async supaya kartu bisa menampilkan status
   * "Menyimpan…"/"Tersimpan"/"Gagal"; error dibiarkan naik agar kartu yang
   * menanganinya, bukan ditelan di sini.
   */
  async function simpanBeratPagi(beratKg: number) {
    await simpanBeratStub(beratKg);
    setLog((prev) => ({ ...prev, berat_pagi_kg: beratKg, sumber_berat: 'manual' }));
  }

  function simpanCatatan(catatan: string | null) {
    setLog((prev) => ({ ...prev, catatan }));
  }

  /**
   * Tambah entri makanan. Totalnya langsung diakumulasikan ke `daily_logs`
   * supaya angka utama, sisa makro, dan bar progress ikut bergerak.
   */
  function tambahMakanan(entri: EntriMakananBaru) {
    const baru: FoodLog = {
      ...entri,
      id: `food-${Date.now()}`,
      daily_log_id: log.id,
    };
    setFoodLogs((prev) => [...prev, baru]);
    setLog((prev) => ({
      ...prev,
      kalori: prev.kalori + baru.kalori,
      protein_g: prev.protein_g + baru.protein_g,
      lemak_g: prev.lemak_g + baru.lemak_g,
      karbo_g: prev.karbo_g + baru.karbo_g,
      sat_fat_g: prev.sat_fat_g + baru.sat_fat_g,
    }));
  }

  /**
   * Ganti tipe hari secara manual. `target_kalori` ikut diperbarui karena
   * kolom itu adalah SNAPSHOT target hari tersebut di `daily_logs`.
   */
  function pilihTipeHari(idBaru: string) {
    const targetBaru = cariTarget(idBaru, fase);
    setLog((prev) => ({
      ...prev,
      day_type_id: idBaru,
      day_type_override: true,
      target_kalori: targetBaru.target_kalori,
    }));
  }

  /** Buang override dan ikuti lagi tebakan dari workout. */
  function kembalikanAuto() {
    const idAuto = deteksi.dayTypeId ?? log.day_type_id;
    const targetAuto = cariTarget(idAuto, fase);
    setLog((prev) => ({
      ...prev,
      day_type_id: idAuto,
      day_type_override: false,
      target_kalori: targetAuto.target_kalori,
    }));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      {/* Header: sapaan + tanggal + fase aktif */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ ...typography.title, color: colors.text }}>Hai, {mockProfile.nama}</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            {formatTanggalPanjang(log.tanggal)}
          </Text>
        </View>
        <Pill label={fase} warna={colors.aksenTeks.jade} />
      </View>

      {/* Angka utama: sisa kalori hari ini */}
      <Card style={{ paddingVertical: spacing.xl }}>
        <HeroNumber
          label="Sisa kalori hari ini"
          nilai={formatAngka(sisaKalori)}
          unit="kcal"
          keterangan={`${formatAngka(log.kalori)} dari target ${formatAngka(target.target_kalori)} kcal`}
          warna={sisaKalori >= 0 ? colors.amber : colors.coral}
        />

        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.xl,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <StatKecil label="Sisa protein" nilai={formatMakro(sisaProtein)} unit="g" warna={colors.aksenTeks.jade} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil label="Sisa lemak" nilai={formatMakro(sisaLemak)} unit="g" warna={colors.text} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil label="Tipe hari" nilai={dayType.nama} unit="" warna={colors.text} kecil />
        </View>
      </Card>

      {/* Timbang pagi — jalur tercepat: ketuk kartu, lalu Simpan (dua tap) */}
      <KartuTimbangPagi
        beratKg={log.berat_pagi_kg}
        sumber={log.sumber_berat}
        beratSebelumnyaKg={beratSebelumnya}
        riwayat={riwayatBeratTerakhir(log.tanggal, 3)}
        onSimpan={simpanBeratPagi}
      />

      {/* Tipe hari — mengganti pilihan langsung menukar target harian */}
      <View>
        <SectionHeader judul="Tipe hari" aksi={log.day_type_override ? 'diubah manual' : 'auto'} />
        <PemilihTipeHari
          daftar={mockDayTypes}
          terpilihId={dayTypeId}
          target={target}
          fase={fase}
          override={log.day_type_override}
          deteksi={deteksi}
          onPilih={pilihTipeHari}
          onKembalikanAuto={kembalikanAuto}
        />
      </View>

      {/* Rincian makro vs target absolut hari ini */}
      <View>
        <SectionHeader judul="Makro hari ini" aksi={`target ${dayType.nama} · ${fase}`} />
        <PanelRingkasanMakro macros={macros} jumlahEstimasi={jumlahEstimasi} />
      </View>

      {/* Daftar makanan hari ini + jalan masuk catat via foto */}
      <View>
        <SectionHeader
          judul="Makanan"
          aksi={
            jumlahEstimasi > 0
              ? `${foodLogs.length} entri · ${jumlahEstimasi} estimasi`
              : `${foodLogs.length} entri`
          }
        />
        <Card flat>
          {foodLogs.map((food, i) => (
            <View
              key={food.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1, gap: 4, paddingRight: spacing.md }}>
                <Text style={{ ...typography.body, color: colors.text }} numberOfLines={1}>
                  {food.nama_makanan}
                </Text>
                {/* Asal tiap entri ditandai, termasuk yang dicatat manual. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <PenandaSumber jenis={sumberMakanan(food.sumber)} />
                  <Text style={{ ...typography.caption, color: colors.textFaint }}>
                    P {formatMakro(food.protein_g)}g · L {formatMakro(food.lemak_g)}g · K{' '}
                    {formatMakro(food.karbo_g)}g
                  </Text>
                </View>
              </View>
              <Text style={{ ...typography.label, color: colors.amber }}>
                {formatAngka(food.kalori)} kcal
              </Text>
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Catat makan via foto"
            onPress={() => {
              ketukRingan();
              setSheetFotoTerbuka(true);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              padding: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ ...typography.body }}>📷</Text>
            <Text style={{ ...typography.label, color: colors.amber }}>Catat makan via foto</Text>
          </Pressable>
        </Card>
      </View>

      {/* Catatan bebas per hari */}
      <View>
        <SectionHeader judul="Catatan hari ini" />
        <KartuCatatan catatan={log.catatan} onSimpan={simpanCatatan} />
      </View>

      <SheetCatatFoto
        terbuka={sheetFotoTerbuka}
        onTutup={() => setSheetFotoTerbuka(false)}
        onSimpan={tambahMakanan}
      />

      {/* Arti tiap penanda, dijelaskan sekali di bawah */}
      <View>
        <SectionHeader judul="Arti penanda" />
        <Card>
          <LegendaSumber />
        </Card>
      </View>

      {/* Penanda eksplisit bahwa Fase 1 masih memakai data tiruan */}
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            Data tiruan · belum tersambung Supabase
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Tiga statistik pendukung di bawah angka utama; lebarnya dibagi rata. */
function StatKecil({
  label,
  nilai,
  unit,
  warna,
  kecil = false,
}: {
  label: string;
  nilai: string;
  unit: string;
  warna: string;
  kecil?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
      <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={{ ...(kecil ? typography.body : typography.title), color: warna }}>{nilai}</Text>
        {unit ? <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text> : null}
      </View>
    </View>
  );
}
