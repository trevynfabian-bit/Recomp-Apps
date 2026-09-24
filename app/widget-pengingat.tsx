import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatJamMenit,
  jamPengingatUntuk,
  KATALOG_NOTIFIKASI,
  ringkasJadwal,
  ringkasJenisAktif,
  siapkanWidget,
  tanggalHariIni,
} from '@recomp/logika';
import type { JenisNotifikasi, NotifikasiKatalog } from '@recomp/logika';
import { Card, DaftarBaris, HeaderLayar, PratinjauWidget, SectionHeader, SheetJamTimbang } from '@/components';
import {
  ambilPengaturanPengingat,
  simpanPengaturanPengingat,
  type PerubahanPengingat,
} from '@/data/pengaturanNotifikasi';
import { ambilKatalogNotifikasi } from '@/data/copyNotifikasi';
import { segarkanPengingat } from '@/data/pengingat';
import { ambilRingkasanWidget } from '@/data/widget';
import {
  izinNotifikasi,
  mintaIzinNotifikasi,
  notifikasiDidukung,
  type IzinNotifikasi,
} from '@/lib/notifikasi';
import { ketukRingan } from '@/lib/haptics';
import { supabaseSiap } from '@/lib/supabase';
import {
  LABEL_SKENARIO_WIDGET,
  mockMasukanWidget,
  mockPengaturanPengingat,
  mockWaktuTimbang,
  type SkenarioWidget,
} from '@/mocks/widget';
import { useHariIni } from '@/state/hariIni';
import { useProfil } from '@/state/profil';
import { useTarget } from '@/state/target';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Pengaturan widget & pengingat.
 *
 * Satu hal yang SENGAJA bukan pengaturan: nada. PRD mewajibkan notifikasi
 * netral, jadi layar ini menyatakannya sebagai janji, bukan sakelar — sakelar
 * "nada tegas" hanya akan menjadi jalan masuk bagi notifikasi yang menegur.
 *
 * Setiap jenis notifikasi punya sakelarnya sendiri (`KATALOG_NOTIFIKASI`):
 * orang yang terganggu pengingat ukur pekanan tidak perlu kehilangan
 * ringkasan mingguan untuk mematikannya.
 *
 * Fase 3 sisi frontend: pengaturan hidup di state layar ini. Task backend
 * menyimpannya ke `settings_notifications` dan menjadwalkan notifikasi lokal
 * di perangkat.
 */
export default function WidgetPengingatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [atur, setAtur] = useState(mockPengaturanPengingat);
  const [skenario, setSkenario] = useState<SkenarioWidget>('hari-ini');
  // Target terkini (disunting di Pengaturan, fase aktif) untuk tipe hari yang
  // sama dengan Hari Ini: pratinjau tidak boleh memakai angka yang sudah diganti.
  const { profil } = useProfil();
  const { cariTarget } = useTarget();
  const { dayTypeId } = useHariIni();
  const targetHariIni = cariTarget(dayTypeId, profil.fase_aktif);
  const [sekarang] = useState(() => new Date());
  // Lewat `siapkanWidget` yang sama dengan widget native: ringkasan kemarin
  // dibuang di sini, bukan disembunyikan oleh layar pratinjau.
  // Dengan Supabase, "Hari ini" adalah angka SUNGGUHAN dari server; skenario
  // lain tetap tiruan karena memang pratinjau keadaan yang tidak sedang terjadi.
  const [masukanAsli, setMasukanAsli] = useState<Awaited<ReturnType<typeof ambilRingkasanWidget>> | null>(null);
  useEffect(() => {
    if (!supabaseSiap) return;
    let batal = false;
    ambilRingkasanWidget()
      .then((m) => {
        if (!batal) setMasukanAsli(m);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);
  const ringkasan = useMemo(
    () =>
      siapkanWidget(
        skenario === 'hari-ini' && masukanAsli ? masukanAsli : mockMasukanWidget(skenario, targetHariIni, sekarang),
        tanggalHariIni(),
      ),
    [skenario, sekarang, masukanAsli, targetHariIni],
  );
  const [waktuTimbang] = useState(() => mockWaktuTimbang());
  const [sheetJamTerbuka, setSheetJamTerbuka] = useState(false);

  useEffect(() => {
    if (!supabaseSiap) return;
    let batal = false;
    ambilPengaturanPengingat()
      .then((p) => {
        if (!batal) setAtur(p);
      })
      .catch(() => {
        // Tetap memakai bawaan; perubahan berikutnya mencoba menyimpan lagi.
      });
    return () => {
      batal = true;
    };
  }, []);

  // Izin notifikasi iOS: bila ditolak, sakelar di sini tidak berarti apa-apa
  // sampai diizinkan di Pengaturan — dan itu harus dikatakan, bukan disembunyikan.
  const [izin, setIzin] = useState<IzinNotifikasi | null>(null);
  useEffect(() => {
    if (!notifikasiDidukung) return;
    izinNotifikasi().then(setIzin).catch(() => undefined);
  }, []);

  // Jadwal pengingat timbang mengikuti sakelar & jamnya.
  useEffect(() => {
    void segarkanPengingat(atur).catch(() => undefined);
    // Hanya bagian yang memengaruhi jadwal timbang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atur.jenis.timbang, atur.jamTimbangMenit, atur.jamAkhirPekanMenit]);

  /** Simpan hanya yang berubah; tampilan tidak menunggu jaringan. */
  const simpan = (p: PerubahanPengingat) => {
    if (supabaseSiap) simpanPengaturanPengingat(p).catch(() => undefined);
  };
  const ubah = (p: Partial<typeof atur>) => {
    setAtur((lama) => ({ ...lama, ...p }));
    simpan(p);
  };
  const ubahJenis = (jenis: JenisNotifikasi, v: boolean) => {
    setAtur((lama) => ({ ...lama, jenis: { ...lama.jenis, [jenis]: v } }));
    simpan({ jenis: { [jenis]: v } });
    // Izin diminta saat pengguna MENYALAKAN notifikasi — saat alasannya jelas.
    if (v && notifikasiDidukung) {
      mintaIzinNotifikasi()
        .then((hasil) => {
          setIzin(hasil);
          if (hasil === 'diizinkan') void segarkanPengingat({ ...atur, jenis: { ...atur.jenis, [jenis]: v } });
        })
        .catch(() => undefined);
    }
  };
  // Kalimat yang benar-benar akan dikirim: dari server bila ada (diperiksa ulang).
  const [katalog, setKatalog] = useState<NotifikasiKatalog[]>(() => [...KATALOG_NOTIFIKASI]);
  useEffect(() => {
    let batal = false;
    ambilKatalogNotifikasi()
      .then((k) => {
        if (!batal) setKatalog(k);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, []);
  const aktif = katalog.filter((n) => atur.jenis[n.jenis]);
  const jadwal = useMemo(
    () => ({ hariKerjaMenit: atur.jamTimbangMenit, akhirPekanMenit: atur.jamAkhirPekanMenit }),
    [atur.jamTimbangMenit, atur.jamAkhirPekanMenit],
  );
  // Jam pratinjau notifikasi = jam yang berlaku HARI INI (hari kerja/akhir pekan).
  const jam = formatJamMenit(jamPengingatUntuk(tanggalHariIni(), jadwal));

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
      <HeaderLayar kembali judul="Widget & pengingat" />

      {/* --- Notifikasi per jenis ------------------------------------------ */}
      <View>
        <SectionHeader judul="Notifikasi" aksi={ringkasJenisAktif(atur.jenis)} />
        <DaftarBaris>
          {katalog.map((n) => (
            <View key={n.jenis}>
              <BarisSakelar
                judul={n.nama}
                keterangan={n.kapan}
                nilai={atur.jenis[n.jenis]}
                onUbah={(v) => ubahJenis(n.jenis, v)}
              />
              {n.jenis === 'timbang' && atur.jenis.timbang ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Jam pengingat: ${ringkasJadwal(jadwal)}`}
                  accessibilityHint="Membuka pengaturan jam"
                  onPress={() => {
                    ketukRingan();
                    setSheetJamTerbuka(true);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: TAP_MIN,
                    paddingHorizontal: spacing.lg,
                    paddingBottom: spacing.lg,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ ...typography.label, color: colors.teksRedup }}>Jam</Text>
                  <Text style={{ ...typography.label, color: colors.teks }}>{ringkasJadwal(jadwal)} ›</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </DaftarBaris>
      </View>

      {izin === 'ditolak' && aktif.length > 0 ? (
        <Card style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.label, color: colors.teks }}>Notifikasi dimatikan di iPhone</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
            Pengingat di atas baru terkirim setelah notifikasi untuk Recomp diizinkan di Pengaturan.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              ketukRingan();
              void Linking.openSettings();
            }}
            style={({ pressed }) => ({ minHeight: TAP_MIN, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ ...typography.label, color: colors.status.sukses.teks }}>Buka Pengaturan ›</Text>
          </Pressable>
        </Card>
      ) : null}

      {/* Pratinjau: janji "netral" ditunjukkan, bukan hanya dikatakan — isi
          yang tampil di sini adalah isi yang dikirim, dari katalog yang sama. */}
      <View>
        <SectionHeader judul="Seperti ini di layar kunci" />
        {aktif.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {aktif.map((n) => (
              <PratinjauNotif key={n.jenis} waktu={n.waktuPratinjau ?? jam} judul={n.judul} isi={n.isi} />
            ))}
          </View>
        ) : (
          <Card>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
              Tidak ada notifikasi yang dikirim. Widget layar kunci tetap diperbarui seperti biasa.
            </Text>
          </Card>
        )}
      </View>

      <Card style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.label, color: colors.teks }}>Nada selalu netral, tanpa angka</Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Tidak ada notifikasi &ldquo;melebihi target&rdquo; atau peringatan berwarna. Berat, kalori, dan
          ukuran tubuh juga tidak pernah ikut di notifikasi — layar kunci bisa dibaca orang lain. Angkanya
          dibaca di app, tanpa penilaian.
        </Text>
      </Card>

      {/* --- Widget layar kunci -------------------------------------------- */}
      <View>
        <SectionHeader judul="Widget layar kunci" />
        <Card style={{ gap: spacing.lg }}>
          <PratinjauWidget ringkasan={ringkasan} tampilkanAngka={atur.widgetTampilkanAngka} sekarang={sekarang} />
          <PemilihSkenario terpilih={skenario} onPilih={setSkenario} />
          <BarisSakelar
            judul="Tampilkan angka di layar kunci"
            keterangan="Layar kunci bisa dilihat tanpa membuka kunci. Matikan bila tidak ingin sisa kalori & protein terlihat orang lain."
            nilai={atur.widgetTampilkanAngka}
            onUbah={(v) => ubah({ widgetTampilkanAngka: v })}
            tanpaPadding
          />
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Memasang widget: tahan layar kunci › Sesuaikan › Layar Kunci › ketuk area widget › pilih Recomp.
          </Text>
        </Card>
      </View>
      <SheetJamTimbang
        terbuka={sheetJamTerbuka}
        onTutup={() => setSheetJamTerbuka(false)}
        jam={jadwal}
        waktuTimbang={waktuTimbang}
        onSimpan={(j) => ubah({ jamTimbangMenit: j.hariKerjaMenit, jamAkhirPekanMenit: j.akhirPekanMenit })}
      />
    </ScrollView>
  );
}

function BarisSakelar({
  judul,
  keterangan,
  nilai,
  onUbah,
  tanpaPadding = false,
}: {
  judul: string;
  keterangan: string;
  nilai: boolean;
  onUbah: (v: boolean) => void;
  tanpaPadding?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: tanpaPadding ? 0 : spacing.lg,
      }}
    >
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={{ ...typography.bodySedang, color: colors.teks }}>{judul}</Text>
        <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
          {keterangan}
        </Text>
      </View>
      <Switch
        accessibilityLabel={judul}
        value={nilai}
        onValueChange={(v) => {
          ketukRingan();
          onUbah(v);
        }}
        trackColor={{ true: colors.status.sukses.isian, false: colors.permukaanCekung }}
        thumbColor={colors.teks}
      />
    </View>
  );
}

const SKENARIO = Object.keys(LABEL_SKENARIO_WIDGET) as SkenarioWidget[];

/**
 * Pratinjau keadaan layar kunci. Widget paling sering dilihat justru saat
 * TIDAK ada angka hari ini — lewat tengah malam, sebelum masuk, sebelum target
 * diatur — jadi keadaan itu ikut dipratinjau, bukan hanya hari yang lengkap.
 */
function PemilihSkenario({
  terpilih,
  onPilih,
}: {
  terpilih: SkenarioWidget;
  onPilih: (s: SkenarioWidget) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
        Pratinjau keadaan
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel="Pratinjau keadaan widget"
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {SKENARIO.map((s) => {
          const aktif = s === terpilih;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected: aktif }}
              accessibilityLabel={`Pratinjau: ${LABEL_SKENARIO_WIDGET[s]}`}
              onPress={() => {
                if (aktif) return;
                ketukRingan();
                onPilih(s);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: aktif ? colors.garisKontrol : colors.garis,
                backgroundColor: aktif ? colors.permukaanCekung : 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: aktif ? colors.teks : colors.teksRedup }}>
                {LABEL_SKENARIO_WIDGET[s]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function PratinjauNotif({ waktu, judul, isi }: { waktu: string; judul: string; isi: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`Pratinjau notifikasi: ${judul}. ${isi}`}
      style={{
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.permukaan,
        borderWidth: 1,
        borderColor: colors.garis,
        gap: spacing.xxs,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>Recomp</Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>{waktu}</Text>
      </View>
      <Text style={{ ...typography.label, color: colors.teks }}>{judul}</Text>
      <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{isi}</Text>
    </View>
  );
}
