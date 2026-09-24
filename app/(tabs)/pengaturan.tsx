import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatAngka,
  formatDesimal,
  formatTanggalPanjang,
  labelBerat,
  labelPanjang,
  periodeBerjalan,
  tampilkanBerat,
  tampilkanPanjang,
  tanggalHariIni,
  usiaPada,
} from '@recomp/logika';
import type { Satuan } from '@recomp/logika';
import {
  BarisTautan,
  Card,
  DaftarBaris,
  HeaderLayar,
  PilihanSegmen,
  SectionHeader,
  SheetBatasPinggang,
  SheetEksporData,
  SheetGantiFase,
  SheetHapusAkun,
  SheetKeluarAkun,
  SheetLengkapiProfil,
} from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockRiwayatBerat } from '@/mocks/dailyLog';
import { mockAkun } from '@/mocks/pengaturan';
import { mockUkuran } from '@/mocks/ukuran';
import { useProfil } from '@/state/profil';
import { useHasilLab } from '@/state/hasilLab';
import { useSesi } from '@/state/sesi';
import { useTarget } from '@/state/target';
import { colors, KONTROL_SEGMEN, type PilihanTampilan, radius, sisaSentuh, spacing, TAP_MIN, typography, ukuran, ukuranIkon, usePilihanTampilan, useSkema } from '@/theme';

type Sheet = 'profil' | 'fase' | 'pinggang' | 'ekspor' | 'keluar' | 'hapus' | null;

/**
 * Pengaturan.
 *
 * Urutan bagiannya mengikuti seberapa sering sesuatu diubah: profil & program
 * (fase, target, batas pinggang) di atas, lalu preferensi, data, notifikasi,
 * dan paling bawah privasi & akun — yang jarang disentuh tapi harus selalu
 * mudah ditemukan.
 *
 * Setiap baris menyebut NILAINYA SEKARANG ("Lean Gain · sejak 9 September",
 * "86 cm"), supaya layar ini juga menjawab "apa yang sedang berlaku" tanpa
 * membuka apa pun.
 *
 * Fase 4 sisi frontend: profil & fase lewat `useProfil` (tiruan di memori);
 * akun dan hasil lab tiruan (`@/mocks/pengaturan`); ekspor lewat `useEkspor`.
 * Menyimpan ke `profiles`, ekspor dari data server, dan penghapusan akun
 * adalah task backend.
 */
export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profil, riwayatFase, perbaruiProfil } = useProfil();
  const faseMulai = periodeBerjalan(riwayatFase)?.mulai ?? null;
  /** Timbangan terakhir, untuk contoh di pemilih satuan. */
  const contohBeratKg = mockRiwayatBerat[mockRiwayatBerat.length - 1].berat_pagi_kg;
  const { pengguna, keluar } = useSesi();
  const { tipeHari, cariTarget } = useTarget();
  // Rentang kalori fase aktif: sekilas cukup untuk tahu target sudah seperti yang dimaksud.
  const kaloriFase = tipeHari
    .map((d) => cariTarget(d.id, profil.fase_aktif)?.target_kalori ?? null)
    .filter((k): k is number => k !== null);
  const belumDiisi = tipeHari.length - kaloriFase.length;
  const rentangKalori =
    kaloriFase.length === 0
      ? 'belum diisi'
      : Math.min(...kaloriFase) === Math.max(...kaloriFase)
        ? `${formatAngka(kaloriFase[0])} kcal`
        : `${formatAngka(Math.min(...kaloriFase))}–${formatAngka(Math.max(...kaloriFase))} kcal`;
  const email = pengguna?.email ?? mockAkun.email;
  const [sheet, setSheet] = useState<Sheet>(null);
  const tampilan = usePilihanTampilan();
  const skema = useSkema();
  const [pesanTiruan, setPesanTiruan] = useState<string | null>(null);
  const tutup = () => setSheet(null);

  const usia = usiaPada(profil.tanggal_lahir, tanggalHariIni());
  const profilLengkap = profil.tinggi_cm !== null && profil.jenis_kelamin !== null;
  const ukuranTerurut = [...mockUkuran].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const pinggangTerbaru = ukuranTerurut[ukuranTerurut.length - 1]?.pinggang_cm ?? 85;
  const pinggangPertama = ukuranTerurut[0]?.pinggang_cm ?? null;
  const { riwayat: riwayatLab, status: statusLab } = useHasilLab();
  const labTerakhir = [...riwayatLab].sort((a, b) => b.tanggal.localeCompare(a.tanggal))[0];

  const panjang = (cm: number) => `${formatDesimal(tampilkanPanjang(cm, profil.satuan), profil.satuan === 'metrik' ? 0 : 1)} ${labelPanjang(profil.satuan)}`;

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
      <HeaderLayar judul="Setelan" />

      {/* --- Profil ----------------------------------------------------------- */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Profil ${profil.nama}, ${email}`}
        accessibilityHint="Membuka isian tinggi, jenis kelamin, dan tanggal lahir"
        onPress={() => {
          ketukRingan();
          setSheet('profil');
        }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.pill,
              backgroundColor: colors.permukaanCekung,
              borderWidth: 1,
              borderColor: colors.garisKontrol,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.title, color: colors.teks }}>{profil.nama.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={{ ...typography.bodyTebal, color: colors.teks }}>{profil.nama}</Text>
            <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{email}</Text>
            {profilLengkap ? (
              <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                {[
                  profil.jenis_kelamin === 'pria' ? 'Pria' : 'Wanita',
                  usia !== null ? `${usia} tahun` : null,
                  profil.tinggi_cm !== null ? panjang(profil.tinggi_cm) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : (
              <Text style={{ ...typography.labelBiasa, color: colors.aksen.teks }}>
                Lengkapi tinggi & jenis kelamin untuk estimasi body fat
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={ukuranIkon.kecil} color={colors.teksSamar} />
        </Card>
      </Pressable>

      {/* --- Program ---------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Program" />
        <DaftarBaris>
          <BarisTautan
            ikon="flag-outline"
            judul="Fase"
            keterangan={faseMulai ? `${profil.fase_aktif} · sejak ${formatTanggalPanjang(faseMulai).split(', ')[1]}` : profil.fase_aktif}
            petunjuk="Membuka pilihan fase program"
            onPress={() => setSheet('fase')}
          />
          <BarisTautan
            ikon="restaurant-outline"
            judul="Target per tipe hari"
            keterangan={`${rentangKalori} · ${tipeHari.length} tipe hari · ${profil.fase_aktif}${belumDiisi > 0 ? ` · ${belumDiisi} belum diisi` : ''}`}
            petunjuk="Membuka form target kalori dan makro tiap tipe hari"
            onPress={() => router.push('/target-harian')}
          />
          <BarisTautan
            ikon="resize-outline"
            judul="Batas pinggang"
            keterangan={profil.batas_pinggang_cm !== null ? panjang(profil.batas_pinggang_cm) : 'Belum diatur'}
            petunjuk="Membuka pengaturan batas pinggang"
            onPress={() => setSheet('pinggang')}
          />
        </DaftarBaris>
      </View>

      {/* --- Preferensi ------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Preferensi" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="options-outline" size={ukuranIkon.baris} color={colors.teksRedup} />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={{ ...typography.bodySedang, color: colors.teks }}>Satuan</Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
                Hanya tampilan; data selalu disimpan dalam kg & cm.
              </Text>
            </View>
          </View>
          <PilihanSegmen opsi={SATUAN} aksesAwalan="Satuan" terpilih={profil.satuan} onPilih={(satuan) => void perbaruiProfil({ satuan })} />
          <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Contoh: berat {formatDesimal(tampilkanBerat(contohBeratKg, profil.satuan), 1)} {labelBerat(profil.satuan)}
            {profil.tinggi_cm !== null ? ` · tinggi ${panjang(profil.tinggi_cm)}` : ''}
          </Text>
        </Card>
        <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="contrast-outline" size={ukuranIkon.baris} color={colors.teksRedup} />
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={{ ...typography.bodySedang, color: colors.teks }}>Tampilan</Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
                Hanya di perangkat ini; tidak mengubah data apa pun.
              </Text>
            </View>
          </View>
          <PilihanSegmen opsi={TAMPILAN} aksesAwalan="Tampilan" terpilih={tampilan.pilihan} onPilih={tampilan.pilih} />
          <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            {tampilan.pilihan === 'sistem'
              ? `Mengikuti setelan HP: sekarang ${skema === 'gelap' ? 'gelap' : 'terang'}.`
              : `Selalu ${tampilan.pilihan}, apa pun setelan HP.`}
          </Text>
        </Card>
      </View>

      {/* --- Data --------------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Data" />
        <DaftarBaris>
          <BarisTautan
            ikon="sync-outline"
            judul="Sumber data"
            keterangan="Apple Health, WHOOP, Strava, Hevy"
            petunjuk="Membuka status sinkron tiap sumber"
            onPress={() => router.push('/sumber-data')}
          />
          <BarisTautan
            ikon="download-outline"
            judul="Impor riwayat"
            keterangan="Hevy, Apple Health, ukuran lama"
            petunjuk="Membuka impor riwayat sekali"
            onPress={() => router.push('/impor-riwayat')}
          />
          <BarisTautan
            ikon="flask-outline"
            judul="Hasil lab"
            keterangan={
              statusLab === 'memuat'
                ? 'Memuat…'
                : statusLab === 'gagal'
                  ? 'Belum termuat'
                  : labTerakhir
                    ? `${riwayatLab.length} tersimpan · terakhir ${formatTanggalPanjang(labTerakhir.tanggal).split(', ')[1]}`
                    : 'Belum ada'
            }
            petunjuk="Membuka riwayat hasil lab"
            onPress={() => router.push('/hasil-lab')}
          />
          <BarisTautan
            ikon="share-outline"
            judul="Ekspor data saya"
            keterangan="CSV & JSON, kapan saja"
            petunjuk="Membuka ekspor seluruh data"
            onPress={() => setSheet('ekspor')}
          />
        </DaftarBaris>
      </View>

      {/* --- Notifikasi ----------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Notifikasi" />
        <Card flat>
          <BarisTautan
            ikon="notifications-outline"
            judul="Widget & pengingat"
            keterangan="Notifikasi per jenis, widget layar kunci"
            petunjuk="Membuka pengaturan pengingat dan widget"
            onPress={() => router.push('/widget-pengingat')}
          />
        </Card>
      </View>

      {/* --- Privasi & akun ----------------------------------------------------- */}
      <View>
        <SectionHeader judul="Privasi & akun" />
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Ionicons name="lock-closed-outline" size={ukuranIkon.baris} color={colors.status.sukses.teks} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={{ ...typography.bodySedang, color: colors.teks }}>
                Data kesehatan hanya untuk akun Anda
              </Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                Setiap baris dikunci ke akun pemiliknya di database, bukan hanya disembunyikan di app. Token sumber
                data tidak pernah terbaca oleh app.
              </Text>
            </View>
          </View>
        </Card>
        <DaftarBaris style={{ marginTop: spacing.md }}>
          <BarisTautan
            ikon="shield-checkmark-outline"
            judul="Privasi"
            keterangan="Apa yang disimpan & siapa yang membaca"
            petunjuk="Membuka penjelasan privasi dalam bahasa sehari-hari beserta keadaannya"
            onPress={() => router.push('/privasi')}
          />
          <BarisTautan
            ikon="log-out-outline"
            judul="Keluar"
            keterangan={email}
            petunjuk="Membuka konfirmasi keluar dari akun di perangkat ini"
            onPress={() => setSheet('keluar')}
          />
          <BarisTautan
            ikon="trash-outline"
            judul="Hapus akun & semua data"
            keterangan="Tidak bisa dibatalkan"
            petunjuk="Membuka konfirmasi penghapusan akun"
            onPress={() => setSheet('hapus')}
          />
        </DaftarBaris>
        {pesanTiruan ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...typography.labelBiasa, color: colors.teksSamar, marginTop: spacing.sm }}
          >
            {pesanTiruan}
          </Text>
        ) : null}
      </View>

      {/* Layar acuan desain: hanya di build pengembangan, tidak pernah sampai ke pengguna. */}
      {__DEV__ ? (
        <DaftarBaris>
          <BarisTautan
            ikon="color-palette-outline"
            judul="Arah visual"
            keterangan="Layar acuan palet, tipografi, dan jarak"
            petunjuk="Membuka layar contoh arah visual"
            onPress={() => router.push('/arah-visual')}
          />
          <BarisTautan
            ikon="shapes-outline"
            judul="Peraga komponen"
            keterangan="Komponen inti dalam semua keadaannya"
            petunjuk="Membuka halaman peraga komponen"
            onPress={() => router.push('/peraga')}
          />
        </DaftarBaris>
      ) : null}

      <Text style={{ ...typography.caption, color: colors.teksSamar, textAlign: 'center' }}>
        Recomp Coach {Constants.expoConfig?.version ?? ''} · bergabung {formatTanggalPanjang(mockAkun.bergabung).split(', ')[1]}
      </Text>

      {/* --- Sheet ----------------------------------------------------------- */}
      <SheetLengkapiProfil
        terbuka={sheet === 'profil'}
        onTutup={tutup}
        profil={profil}
        onSimpan={perbaruiProfil}
      />
      <SheetGantiFase terbuka={sheet === 'fase'} onTutup={tutup} />
      <SheetBatasPinggang
        terbuka={sheet === 'pinggang'}
        onTutup={tutup}
        batasCm={profil.batas_pinggang_cm}
        pinggangSekarangCm={pinggangTerbaru}
        pinggangAwalCm={pinggangPertama}
        onSimpan={(batas) => perbaruiProfil({ batas_pinggang_cm: batas })}
      />
      <SheetEksporData terbuka={sheet === 'ekspor'} onTutup={tutup} />
      <SheetKeluarAkun terbuka={sheet === 'keluar'} onTutup={tutup} email={email} keluar={keluar} />
      <SheetHapusAkun
        terbuka={sheet === 'hapus'}
        onTutup={tutup}
        onEksporDulu={() => setSheet('ekspor')}
        hapus={() =>
          new Promise<void>((selesai) =>
            setTimeout(() => {
              setPesanTiruan('Mode tiruan: tidak ada data yang dihapus.');
              selesai();
            }, 1200),
          )
        }
      />
    </ScrollView>
  );
}

const SATUAN: { nilai: Satuan; label: string }[] = [
  { nilai: 'metrik', label: 'kg · cm' },
  { nilai: 'imperial', label: 'lb · in' },
];

const TAMPILAN: { nilai: PilihanTampilan; label: string }[] = [
  { nilai: 'sistem', label: 'Ikuti sistem' },
  { nilai: 'terang', label: 'Terang' },
  { nilai: 'gelap', label: 'Gelap' },
];
