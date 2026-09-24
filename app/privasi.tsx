import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DATA_TERSIMPAN, PROFIL_SUMBER, susunStatusPrivasi } from '@recomp/logika';
import type { ButirStatusPrivasi } from '@recomp/logika';
import {
  BarisTautan,
  Card,
  DaftarBaris,
  HeaderLayar,
  SectionHeader,
  SheetEksporData,
  SheetHapusAkun,
} from '@/components';
import { ambilPengaturanPengingat } from '@/data/pengaturanNotifikasi';
import { ketukRingan } from '@/lib/haptics';
import { supabaseSiap } from '@/lib/supabase';
import { mockFotoMakananDisimpan } from '@/mocks/privasi';
import { mockPengaturanPengingat } from '@/mocks/widget';
import { useSesi } from '@/state/sesi';
import { useSinkron } from '@/state/sinkron';
import { colors, ukuranIkon, spacing, TAP_MIN, typography } from '@/theme';

const IKON: Record<ButirStatusPrivasi['nada'], React.ComponentProps<typeof Ionicons>['name']> = {
  terjaga: 'lock-closed-outline',
  info: 'information-circle-outline',
  terlihat: 'eye-outline',
};

const WARNA_STATUS: Record<ButirStatusPrivasi['nada'], string> = {
  get terjaga() {
    return colors.status.sukses.teks;
  },
  get info() {
    return colors.teksRedup;
  },
  get terlihat() {
    return colors.status.peringatan.teks;
  },
};

/**
 * Privasi, dalam bahasa sehari-hari.
 *
 * Bukan kebijakan privasi berbahasa hukum, melainkan daftar pernyataan yang
 * masing-masing punya KEADAAN sekarang: akun yang masuk, sumber yang
 * tersambung (dan bahwa app hanya membaca darinya), apa yang dikirim ke model
 * AI dan kapan, serta apa yang terbaca di layar kunci. Kalimatnya disusun
 * `susunStatusPrivasi` dari keadaan itu, jadi yang tertulis mengikuti yang
 * sebenarnya terjadi — mematikan angka di widget mengubah butir layar kunci.
 *
 * Di bawahnya, kendali yang relevan di satu tempat: ekspor, sumber data,
 * widget, dan hapus akun.
 *
 * Fase 4 sisi frontend: keadaan widget dibaca dari server bila Supabase
 * terpasang (disegarkan setiap layar ini tampil), selain itu dari bawaan
 * tiruan; foto makanan dari `@/mocks/privasi`.
 */
export default function PrivasiScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pengguna } = useSesi();
  const { koneksi } = useSinkron();
  const [widgetTampilkanAngka, setWidgetTampilkanAngka] = useState(() => mockPengaturanPengingat().widgetTampilkanAngka);
  const [sheet, setSheet] = useState<'ekspor' | 'hapus' | null>(null);
  const [pesanTiruan, setPesanTiruan] = useState<string | null>(null);

  // Disegarkan setiap kali layar ini tampil: pengaturan widget bisa baru saja
  // diubah di layar Widget & pengingat.
  useFocusEffect(
    useCallback(() => {
      if (!supabaseSiap) return;
      let batal = false;
      ambilPengaturanPengingat()
        .then((p) => {
          if (!batal) setWidgetTampilkanAngka(p.widgetTampilkanAngka);
        })
        .catch(() => undefined);
      return () => {
        batal = true;
      };
    }, []),
  );

  const status = useMemo(
    () =>
      susunStatusPrivasi({
        email: pengguna?.email ?? null,
        sumberTerhubung: koneksi.filter((k) => k.status === 'terhubung').map((k) => PROFIL_SUMBER[k.sumber].nama),
        widgetTampilkanAngka,
        fotoMakananDisimpan: mockFotoMakananDisimpan,
      }),
    [pengguna, koneksi, widgetTampilkanAngka],
  );

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
        judul="Privasi"
        subjudul="Apa yang disimpan, dan siapa yang bisa membacanya"
      />

      <View>
        <SectionHeader judul="Keadaan sekarang" />
        <Card flat>
          <View accessibilityRole="list">
            {status.map((b, i) => (
              <View
                key={b.kunci}
                accessible
                accessibilityLabel={`${b.judul}: ${b.status}. ${b.penjelasan}`}
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  padding: spacing.lg,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.garis,
                }}
              >
                <Ionicons name={IKON[b.nada]} size={ukuranIkon.baris} color={WARNA_STATUS[b.nada]} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={{ ...typography.bodySedang, color: colors.teks }}>{b.judul}</Text>
                  <Text style={{ ...typography.label, color: WARNA_STATUS[b.nada] }}>{b.status}</Text>
                  <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
                    {b.penjelasan}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Yang disimpan di akun" />
        <Card style={{ gap: spacing.md }}>
          {DATA_TERSIMPAN.map((d) => (
            <View key={d.judul} style={{ gap: spacing.xxs }}>
              <Text style={{ ...typography.label, color: colors.teks }}>{d.judul}</Text>
              <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{d.isi}</Text>
            </View>
          ))}
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Semuanya disimpan di database Supabase milik app ini. App tidak memuat iklan atau pelacak analitik pihak
            ketiga; selain ekspor yang Anda minta sendiri, data hanya dikirim keluar ke penyedia model AI saat coach,
            ringkasan mingguan, atau foto makanan dipakai.
          </Text>
        </Card>
      </View>

      <View>
        <SectionHeader judul="Kendali Anda" />
        <DaftarBaris>
          <BarisTautan
            ikon="download-outline"
            judul="Ekspor data saya"
            keterangan="CSV & JSON, kapan saja"
            onPress={() => setSheet('ekspor')}
          />
          <BarisTautan
            ikon="sync-outline"
            judul="Sumber data"
            keterangan="Sambungkan atau putuskan"
            onPress={() => router.push('/sumber-data')}
          />
          <BarisTautan
            ikon="phone-portrait-outline"
            judul="Widget & pengingat"
            keterangan="Angka di layar kunci"
            onPress={() => router.push('/widget-pengingat')}
          />
          <BarisTautan
            ikon="trash-outline"
            judul="Hapus akun & semua data"
            keterangan="Tidak bisa dibatalkan"
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

      <SheetEksporData terbuka={sheet === 'ekspor'} onTutup={() => setSheet(null)} />
      <SheetHapusAkun
        terbuka={sheet === 'hapus'}
        onTutup={() => setSheet(null)}
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
