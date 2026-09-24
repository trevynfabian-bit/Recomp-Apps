import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  HeroNumber,
  IndikatorSinkron,
  KartuCatatan,
  KartuTimbangPagi,
  LegendaSumber,
  PanelRingkasanMakro,
  PemilihTipeHari,
  PenandaSumber,
  Pill,
  SectionHeader,
  SheetCatatFoto,
  TombolUtama,
  type EntriMakananBaru,
} from '@/components';
import { formatAngka, formatMakro, formatTanggalPanjang, tanggalHariIni, tipeHariBerlaku } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import { batalkanPengingatTimbangHariIni } from '@/lib/notifikasi';
import { supabaseSiap } from '@/lib/supabase';
import { useProfil } from '@/state/profil';
import { useHariIni } from '@/state/hariIni';
import { useTarget } from '@/state/target';
import { simpanCatatanHarian } from '@/data/catatan';
import { hitungEstimasi, sumberMakanan } from '@/lib/sumber';
import {
  beratTerakhirSebelum,
  mockDailyLogHariIni,
  mockFoodLogsHariIni,
  mockProfile,
  riwayatBeratTerakhir,
  simpanBeratStub,
  susunMacros,
} from '@/mocks/dailyLog';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';
import type { DailyLog, FoodLog } from '@/types/domain';

/**
 * Layar utama Log Harian.
 * Fase 1 frontend: seluruh angka berasal dari data tiruan di `@/mocks/dailyLog`
 * dan perubahan hanya hidup di state layar ini. Penggantian ke Supabase
 * dilakukan di task layer backend tanpa mengubah layout.
 */
export default function LogHarianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profil } = useProfil();
  // Target dari penyedia bersama: yang disunting di Pengaturan langsung dipakai di sini.
  const { cariTarget, tipeHari } = useTarget();
  // Tipe hari bersama: dipilih di sini atau di halaman Target, satu keadaan.
  const { dayTypeId, override, deteksi, pilihTipeHari, kembalikanAuto } = useHariIni();

  // Log hari ini disimpan di state supaya kartu Timbang Pagi & pemilih tipe hari
  // bisa menulis balik. Semua angka target diturunkan dari state ini.
  const [log, setLog] = useState<DailyLog>(mockDailyLogHariIni);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>(mockFoodLogsHariIni);
  const [sheetFotoTerbuka, setSheetFotoTerbuka] = useState(false);

  const fase = profil.fase_aktif;

  // Aturan bersama (`tipeHariBerlaku`); tipe pertama hanya jaring terakhir
  // bila akun tidak punya tipe bawaan sama sekali.
  const dayType = tipeHariBerlaku(tipeHari, dayTypeId) ?? tipeHari[0];
  const target = cariTarget(dayTypeId, fase);
  const macros = susunMacros(log, target);

  // Target belum diisi (mis. tipe hari baru): tidak ada "sisa" untuk dihitung.
  const sisaKalori = target ? target.target_kalori - log.kalori : null;
  const sisaProtein = target ? target.target_protein_g - log.protein_g : null;
  const sisaLemak = target ? target.target_lemak_g - log.lemak_g : null;
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
    // Sudah timbang: pengingat pagi ini tidak perlu datang lagi.
    if (log.tanggal === tanggalHariIni()) void batalkanPengingatTimbangHariIni().catch(() => undefined);
  }

  /**
   * Simpan catatan harian.
   *
   * Fase 1 masih berjalan di atas data tiruan dan belum punya layar masuk,
   * jadi penulisan ke Supabase hanya dilakukan bila kredensialnya sudah diisi.
   * Tanpa itu app tetap bisa diklik-klik seperti biasa. Galat sengaja
   * dilemparkan kembali supaya kartu yang menampilkannya, bukan ditelan di sini.
   */
  async function simpanCatatan(catatan: string | null) {
    if (supabaseSiap) {
      await simpanCatatanHarian(log.tanggal, catatan);
    }
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.latar }}
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
          <Text style={{ ...typography.title, color: colors.teks }}>Hai, {profil.nama}</Text>
          <Text style={{ ...typography.label, color: colors.teksSamar, marginTop: spacing.xxs }}>
            {formatTanggalPanjang(log.tanggal)}
          </Text>
          {/* Seberapa segar angka di bawahnya; ketuk untuk membuka Sumber data. */}
          <View style={{ marginTop: spacing.sm }}>
            <IndikatorSinkron />
          </View>
        </View>
        <Pill label={fase} warna={colors.status.sukses.teks} />
      </View>

      {/* Angka utama: sisa kalori hari ini */}
      <Card style={{ paddingVertical: spacing.xl }}>
        {target && sisaKalori !== null ? (
          <HeroNumber
            label="Sisa kalori hari ini"
            nilai={formatAngka(sisaKalori)}
            unit="kcal"
            keterangan={`${formatAngka(log.kalori)} dari target ${formatAngka(target.target_kalori)} kcal`}
            warna={sisaKalori >= 0 ? colors.aksen.besar : colors.status.bahaya.isian}
          />
        ) : (
          <View accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
            <Text style={{ ...typography.caption, color: colors.teksRedup }}>SISA KALORI HARI INI</Text>
            <Text style={{ ...typography.title, color: colors.teks }}>
              Target {dayType.nama} · {fase} belum diisi
            </Text>
            <Text style={{ ...typography.body, color: colors.teksRedup }}>
              Tanpa target, sisanya belum bisa dihitung. Tercatat {formatAngka(log.kalori)} kcal; makanan dan timbangan
              tetap tersimpan seperti biasa.
            </Text>
            <TombolUtama
              label="Isi target"
              aksesLabel={`Isi target ${dayType.nama} untuk fase ${fase}`}
              onPress={() => router.push({ pathname: '/target-harian', params: { isi: dayTypeId } })}
            />
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.xl,
            paddingTop: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.garis,
          }}
        >
          <StatKecil label="Sisa protein" nilai={sisaProtein !== null ? formatMakro(sisaProtein) : '–'} unit={sisaProtein !== null ? 'g' : ''} warna={colors.status.sukses.teks} />
          <View style={{ width: 1, backgroundColor: colors.garis }} />
          <StatKecil label="Sisa lemak" nilai={sisaLemak !== null ? formatMakro(sisaLemak) : '–'} unit={sisaLemak !== null ? 'g' : ''} warna={colors.teks} />
          <View style={{ width: 1, backgroundColor: colors.garis }} />
          <StatKecil label="Tipe hari" nilai={dayType.nama} unit="" warna={colors.teks} kecil />
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
        <SectionHeader judul="Tipe hari" aksi={override ? 'diubah manual' : 'auto'} />
        <PemilihTipeHari
          daftar={tipeHari}
          terpilihId={dayTypeId}
          target={target}
          fase={fase}
          override={override}
          deteksi={deteksi}
          onPilih={pilihTipeHari}
          onKembalikanAuto={kembalikanAuto}
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Lihat target semua tipe hari"
          onPress={() => router.push('/target-harian')}
          style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: TAP_MIN, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ ...typography.label, color: colors.aksen.teks }}>Target semua tipe hari ›</Text>
        </Pressable>
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
                borderTopColor: colors.garis,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xs, paddingRight: spacing.md }}>
                <Text style={{ ...typography.body, color: colors.teks }} numberOfLines={1}>
                  {food.nama_makanan}
                </Text>
                {/* Asal tiap entri ditandai, termasuk yang dicatat manual. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <PenandaSumber jenis={sumberMakanan(food.sumber)} />
                  <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                    P {formatMakro(food.protein_g)}g · L {formatMakro(food.lemak_g)}g · K{' '}
                    {formatMakro(food.karbo_g)}g
                  </Text>
                </View>
              </View>
              <Text style={{ ...typography.label, color: colors.aksen.teks }}>
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
              borderTopColor: colors.garis,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ ...typography.body }}>📷</Text>
            <Text style={{ ...typography.label, color: colors.aksen.teks }}>Catat makan via foto</Text>
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
            backgroundColor: colors.permukaanCekung,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
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
      <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xxs }}>
        <Text style={{ ...(kecil ? typography.body : typography.title), color: warna }}>{nilai}</Text>
        {unit ? <Text style={{ ...typography.caption, color: colors.teksSamar }}>{unit}</Text> : null}
      </View>
    </View>
  );
}
