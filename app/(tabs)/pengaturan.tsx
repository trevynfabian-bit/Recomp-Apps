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
  Card,
  KerangkaSheet,
  SectionHeader,
  SheetBatasPinggang,
  SheetEksporData,
  SheetGantiFase,
  SheetHapusAkun,
  SheetKeluarAkun,
  SheetLengkapiProfil,
  TombolBertepi,
} from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockRiwayatBerat } from '@/mocks/dailyLog';
import { mockAkun, mockHasilLab, mockIsiEkspor, mockSiapkanEkspor } from '@/mocks/pengaturan';
import { mockUkuran } from '@/mocks/ukuran';
import { useProfil } from '@/state/profil';
import { useSesi } from '@/state/sesi';
import { useTarget } from '@/state/target';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

type Sheet = 'profil' | 'fase' | 'pinggang' | 'lab' | 'ekspor' | 'keluar' | 'hapus' | null;

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
 * akun, isi ekspor, dan hasil lab tiruan (`@/mocks/pengaturan`). Menyimpan ke
 * `profiles`, ekspor sungguhan, dan penghapusan akun adalah task backend.
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
  const kaloriFase = tipeHari.map((d) => cariTarget(d.id, profil.fase_aktif).target_kalori);
  const rentangKalori =
    Math.min(...kaloriFase) === Math.max(...kaloriFase)
      ? formatAngka(kaloriFase[0])
      : `${formatAngka(Math.min(...kaloriFase))}–${formatAngka(Math.max(...kaloriFase))}`;
  const email = pengguna?.email ?? mockAkun.email;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pesanTiruan, setPesanTiruan] = useState<string | null>(null);
  const tutup = () => setSheet(null);

  const usia = usiaPada(profil.tanggal_lahir, tanggalHariIni());
  const profilLengkap = profil.tinggi_cm !== null && profil.jenis_kelamin !== null;
  const ukuranTerurut = [...mockUkuran].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const pinggangTerbaru = ukuranTerurut[ukuranTerurut.length - 1]?.pinggang_cm ?? 85;
  const pinggangPertama = ukuranTerurut[0]?.pinggang_cm ?? null;
  const labTerakhir = mockHasilLab[0];

  const panjang = (cm: number) => `${formatDesimal(tampilkanPanjang(cm, profil.satuan), profil.satuan === 'metrik' ? 0 : 1)} ${labelPanjang(profil.satuan)}`;

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
      <Text style={{ ...typography.display, color: colors.text }}>Pengaturan</Text>

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
              backgroundColor: colors.surfaceSunken,
              borderWidth: 1,
              borderColor: colors.borderKuat,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.title, color: colors.text }}>{profil.nama.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...typography.body, fontWeight: '700', color: colors.text }}>{profil.nama}</Text>
            <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{email}</Text>
            {profilLengkap ? (
              <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
                {[
                  profil.jenis_kelamin === 'pria' ? 'Pria' : 'Wanita',
                  usia !== null ? `${usia} tahun` : null,
                  profil.tinggi_cm !== null ? panjang(profil.tinggi_cm) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : (
              <Text style={{ ...typography.label, fontWeight: '500', color: colors.amber }}>
                Lengkapi tinggi & jenis kelamin untuk estimasi body fat
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Card>
      </Pressable>

      {/* --- Program ---------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Program" />
        <Card flat>
          <BarisPengaturan
            ikon="flag-outline"
            judul="Fase"
            nilai={faseMulai ? `${profil.fase_aktif} · sejak ${formatTanggalPanjang(faseMulai).split(', ')[1]}` : profil.fase_aktif}
            petunjuk="Membuka pilihan fase program"
            onPress={() => setSheet('fase')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="restaurant-outline"
            judul="Target per tipe hari"
            nilai={`${rentangKalori} kcal · ${tipeHari.length} tipe hari · ${profil.fase_aktif}`}
            petunjuk="Membuka form target kalori dan makro tiap tipe hari"
            onPress={() => router.push('/target-harian')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="resize-outline"
            judul="Batas pinggang"
            nilai={profil.batas_pinggang_cm !== null ? panjang(profil.batas_pinggang_cm) : 'Belum diatur'}
            petunjuk="Membuka pengaturan batas pinggang"
            onPress={() => setSheet('pinggang')}
          />
        </Card>
      </View>

      {/* --- Preferensi ------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Preferensi" />
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="options-outline" size={22} color={colors.textMuted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>Satuan</Text>
              <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
                Hanya tampilan; data selalu disimpan dalam kg & cm.
              </Text>
            </View>
          </View>
          <PilihSatuan terpilih={profil.satuan} onPilih={(satuan) => void perbaruiProfil({ satuan })} />
          <Text accessibilityLiveRegion="polite" style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
            Contoh: berat {formatDesimal(tampilkanBerat(contohBeratKg, profil.satuan), 1)} {labelBerat(profil.satuan)}
            {profil.tinggi_cm !== null ? ` · tinggi ${panjang(profil.tinggi_cm)}` : ''}
          </Text>
        </Card>
      </View>

      {/* --- Data --------------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Data" />
        <Card flat>
          <BarisPengaturan
            ikon="sync-outline"
            judul="Sumber data"
            nilai="Apple Health, WHOOP, Strava, Hevy"
            petunjuk="Membuka status sinkron tiap sumber"
            onPress={() => router.push('/sumber-data')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="download-outline"
            judul="Impor riwayat"
            nilai="Hevy, Apple Health, ukuran lama"
            petunjuk="Membuka impor riwayat sekali"
            onPress={() => router.push('/impor-riwayat')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="flask-outline"
            judul="Hasil lab"
            nilai={
              labTerakhir
                ? `${mockHasilLab.length} tersimpan · terakhir ${formatTanggalPanjang(labTerakhir.tanggal).split(', ')[1]}`
                : 'Belum ada'
            }
            petunjuk="Membuka daftar hasil lab"
            onPress={() => setSheet('lab')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="share-outline"
            judul="Ekspor data saya"
            nilai="CSV & JSON, kapan saja"
            petunjuk="Membuka ekspor seluruh data"
            onPress={() => setSheet('ekspor')}
          />
        </Card>
      </View>

      {/* --- Notifikasi ----------------------------------------------------------- */}
      <View>
        <SectionHeader judul="Notifikasi" />
        <Card flat>
          <BarisPengaturan
            ikon="notifications-outline"
            judul="Widget & pengingat"
            nilai="Notifikasi per jenis, widget layar kunci"
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
            <Ionicons name="lock-closed-outline" size={22} color={colors.aksenTeks.jade} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>
                Data kesehatan hanya untuk akun Anda
              </Text>
              <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
                Setiap baris dikunci ke akun pemiliknya di database, bukan hanya disembunyikan di app. Token sumber
                data tidak pernah terbaca oleh app.
              </Text>
            </View>
          </View>
        </Card>
        <Card flat style={{ marginTop: spacing.md }}>
          <BarisPengaturan
            ikon="shield-checkmark-outline"
            judul="Privasi"
            nilai="Apa yang disimpan & siapa yang membaca"
            petunjuk="Membuka penjelasan privasi dalam bahasa sehari-hari beserta keadaannya"
            onPress={() => router.push('/privasi')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="log-out-outline"
            judul="Keluar"
            nilai={email}
            petunjuk="Membuka konfirmasi keluar dari akun di perangkat ini"
            onPress={() => setSheet('keluar')}
          />
          <Pemisah />
          <BarisPengaturan
            ikon="trash-outline"
            judul="Hapus akun & semua data"
            nilai="Tidak bisa dibatalkan"
            petunjuk="Membuka konfirmasi penghapusan akun"
            onPress={() => setSheet('hapus')}
          />
        </Card>
        {pesanTiruan ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, marginTop: spacing.sm }}
          >
            {pesanTiruan}
          </Text>
        ) : null}
      </View>

      <Text style={{ ...typography.caption, color: colors.textFaint, textAlign: 'center' }}>
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
      <KerangkaSheet terbuka={sheet === 'lab'} onTutup={tutup} label="Hasil lab">
        <Text style={{ ...typography.title, color: colors.text }}>Hasil lab</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          Dibaca coach sebagai konteks, bukan dasar saran dosis atau diagnosis.
        </Text>
        <View accessibilityRole="list" style={{ gap: spacing.sm }}>
          {mockHasilLab.map((h) => (
            <View
              key={h.id}
              accessible
              accessibilityLabel={`${h.nama}, ${formatTanggalPanjang(h.tanggal)}, ${h.penanda} penanda`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}
            >
              <View style={{ gap: 2 }}>
                <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{h.nama}</Text>
                <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
                  {formatTanggalPanjang(h.tanggal)}
                </Text>
              </View>
              <Text style={{ ...typography.label, color: colors.textMuted }}>{formatAngka(h.penanda)} penanda</Text>
            </View>
          ))}
        </View>
        <TombolBertepi label="Tutup" onPress={tutup} />
      </KerangkaSheet>
      <SheetEksporData terbuka={sheet === 'ekspor'} onTutup={tutup} isi={mockIsiEkspor} siapkan={mockSiapkanEkspor} />
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

function PilihSatuan({ terpilih, onPilih }: { terpilih: Satuan; onPilih: (s: Satuan) => void }) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      {SATUAN.map((s) => {
        const aktif = s.nilai === terpilih;
        return (
          <Pressable
            key={s.nilai}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={`Satuan ${s.label}`}
            onPress={() => {
              if (aktif) return;
              ketukRingan();
              onPilih(s.nilai);
            }}
            style={{
              flex: 1,
              minHeight: TAP_MIN - 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              backgroundColor: aktif ? colors.surface : 'transparent',
              borderWidth: aktif ? 1 : 0,
              borderColor: colors.borderKuat,
            }}
          >
            <Text style={{ ...typography.label, color: aktif ? colors.text : colors.textMuted }}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BarisPengaturan({
  ikon,
  judul,
  nilai,
  petunjuk,
  onPress,
}: {
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  judul: string;
  /** Nilai yang BERLAKU sekarang, atau keterangan singkat. */
  nilai: string;
  petunjuk: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${judul}: ${nilai}`}
      accessibilityHint={petunjuk}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP_MIN,
        padding: spacing.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={ikon} size={22} color={colors.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{judul}</Text>
        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>{nilai}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

function Pemisah() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />;
}
