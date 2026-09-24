import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Card,
  HeaderLayar,
  HeroPengganti,
  IndikatorSinkron,
  KartuCatatan,
  KartuHero,
  KartuTimbangPagi,
  LegendaSumber,
  PanelRingkasanMakro,
  PemilihTipeHari,
  PenandaSumber,
  Pill,
  SectionHeader,
  SheetCatatFoto,
  Tombol,
  TombolUtama,
  type EntriMakananBaru,
} from '@/components';
import { formatAngka, formatMakro, formatTanggalPanjang, tanggalHariIni, tipeHariBerlaku } from '@recomp/logika';
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
      <HeaderLayar
        judul={`Hai, ${profil.nama}`}
        subjudul={formatTanggalPanjang(log.tanggal)}
        aksi={<Pill label={fase} warna={colors.status.sukses.teks} />}
        // Seberapa segar angka di bawahnya; ketuk untuk membuka Sumber data.
        bawah={<IndikatorSinkron />}
      />

      {/* Angka utama: sisa kalori hari ini */}
      <KartuHero
        label="Sisa kalori hari ini"
        nilai={sisaKalori !== null ? formatAngka(sisaKalori) : '—'}
        unit="kcal"
        keterangan={target ? `${formatAngka(log.kalori)} dari target ${formatAngka(target.target_kalori)} kcal` : undefined}
        nada={sisaKalori !== null && sisaKalori < 0 ? 'bahaya' : 'aksen'}
        pengganti={
          target && sisaKalori !== null ? undefined : (
            <HeroPengganti
              label="Sisa kalori hari ini"
              judul={`Target ${dayType.nama} · ${fase} belum diisi`}
              keterangan={`Tanpa target, sisanya belum bisa dihitung. Tercatat ${formatAngka(log.kalori)} kcal; makanan dan timbangan tetap tersimpan seperti biasa.`}
              aksi={
                <Tombol
                  label="Isi target"
                  aksesLabel={`Isi target ${dayType.nama} untuk fase ${fase}`}
                  onPress={() => router.push({ pathname: '/target-harian', params: { isi: dayTypeId } })}
                />
              }
            />
          )
        }
        stat={[
          { label: 'Sisa protein', nilai: sisaProtein !== null ? formatMakro(sisaProtein) : '–', unit: sisaProtein !== null ? 'g' : undefined, warna: colors.status.sukses.teks },
          { label: 'Sisa lemak', nilai: sisaLemak !== null ? formatMakro(sisaLemak) : '–', unit: sisaLemak !== null ? 'g' : undefined },
          { label: 'Tipe hari', nilai: dayType.nama, kata: true },
        ]}
      />

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
        <Tombol
          varian="teks"
          ukuran="kecil"
          label="Target semua tipe hari ›"
          aksesLabel="Lihat target semua tipe hari"
          onPress={() => router.push('/target-harian')}
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

          <Tombol
            varian="teks"
            ukuran="kecil"
            label="Catat makan via foto"
            aksesLabel="Catat makan via foto"
            sejajar="tengah"
            onPress={() => setSheetFotoTerbuka(true)}
          />
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
