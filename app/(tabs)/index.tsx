import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  HeroNumber,
  KartuTimbangPagi,
  MacroRow,
  Pill,
  SectionHeader,
} from '@/components';
import { formatAngka, formatTanggalPanjang } from '@/lib/format';
import {
  beratTerakhirSebelum,
  mockFoodLogsHariIni,
  mockProfile,
  mockSnapshotHariIni,
} from '@/mocks/dailyLog';
import { colors, radius, spacing, typography } from '@/theme';
import type { DailyLog } from '@/types/domain';

/**
 * Layar utama Log Harian.
 * Fase 1 frontend: seluruh angka berasal dari data tiruan di `@/mocks/dailyLog`
 * dan perubahan hanya hidup di state layar ini. Penggantian ke Supabase
 * dilakukan di task layer backend tanpa mengubah layout.
 */
export default function LogHarianScreen() {
  const insets = useSafeAreaInsets();
  const snapshot = mockSnapshotHariIni();
  const { dayType, target, fase, macros } = snapshot;

  // Log hari ini disimpan di state supaya kartu Timbang Pagi bisa menulis balik.
  const [log, setLog] = useState<DailyLog>(snapshot.log);

  const sisaKalori = target.target_kalori - log.kalori;
  const sisaProtein = target.target_protein_g - log.protein_g;
  const sisaLemak = target.target_lemak_g - log.lemak_g;
  const beratSebelumnya = beratTerakhirSebelum(log.tanggal);

  function simpanBeratPagi(beratKg: number) {
    setLog((prev) => ({ ...prev, berat_pagi_kg: beratKg, sumber_berat: 'manual' }));
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
        <Pill label={fase} warna={colors.jade} />
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
          <StatKecil label="Sisa protein" nilai={formatAngka(sisaProtein)} unit="g" warna={colors.jade} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil label="Sisa lemak" nilai={formatAngka(sisaLemak)} unit="g" warna={colors.text} />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil label="Tipe hari" nilai={dayType.nama} unit="" warna={colors.text} kecil />
        </View>
      </Card>

      {/* Timbang pagi — jalur tercepat: ketuk kartu, lalu Simpan (dua tap) */}
      <KartuTimbangPagi
        beratKg={log.berat_pagi_kg}
        sumber={log.sumber_berat}
        beratSebelumnyaKg={beratSebelumnya}
        onSimpan={simpanBeratPagi}
      />

      {/* Rincian makro vs target absolut hari ini */}
      <View>
        <SectionHeader judul="Makro hari ini" aksi={`target ${dayType.nama} · ${fase}`} />
        <Card>
          <View style={{ gap: spacing.lg }}>
            {macros.map((macro) => (
              <MacroRow key={macro.key} macro={macro} />
            ))}
          </View>
          <Text style={{ ...typography.caption, color: colors.textFaint, marginTop: spacing.lg }}>
            Sat fat dihitung sebagai BATAS, bukan sasaran. Karbo tidak ditargetkan.
          </Text>
        </Card>
      </View>

      {/* Daftar makanan hari ini */}
      <View>
        <SectionHeader judul="Makanan" aksi={`${mockFoodLogsHariIni.length} entri`} />
        <Card flat>
          {mockFoodLogsHariIni.map((food, i) => (
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
              <View style={{ flex: 1, gap: 2, paddingRight: spacing.md }}>
                <Text style={{ ...typography.body, color: colors.text }} numberOfLines={1}>
                  {food.nama_makanan}
                </Text>
                <Text style={{ ...typography.caption, color: colors.textFaint }}>
                  P {formatAngka(food.protein_g)}g · L {formatAngka(food.lemak_g)}g · K{' '}
                  {formatAngka(food.karbo_g)}g
                </Text>
              </View>
              <Text style={{ ...typography.label, color: colors.amber }}>
                {formatAngka(food.kalori)} kcal
              </Text>
            </View>
          ))}
        </Card>
      </View>

      {/* Catatan bebas per hari */}
      <View>
        <SectionHeader judul="Catatan hari ini" />
        <Card>
          <Text
            style={{
              ...typography.body,
              color: log.catatan ? colors.textMuted : colors.textFaint,
              lineHeight: 24,
            }}
          >
            {log.catatan ?? 'Belum ada catatan untuk hari ini.'}
          </Text>
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
