import { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BannerDataMasuk, BannerEksporSiap } from '@/components';
import { segarkanPengingat } from '@/data/pengingat';
import { PenyediaEkspor } from '@/state/ekspor';
import { PenyediaHariIni } from '@/state/hariIni';
import { PenyediaHasilLab } from '@/state/hasilLab';
import { PenyediaProfil } from '@/state/profil';
import { PenyediaRedistribusi } from '@/state/redistribusi';
import { PenyediaSesi, useSesi } from '@/state/sesi';
import { PenyediaSinkron } from '@/state/sinkron';
import { PenyediaTarget } from '@/state/target';
import { colors, PenyediaSkema, useSkema, type Skema } from '@/theme';

/**
 * Root layout. Warna disetel eksplisit lewat `screenOptions` (bukan tema
 * react-navigation) supaya palet PRD berlaku di semua layar; skemanya
 * (gelap/terang) mengikuti sistem lewat `PenyediaSkema`.
 */
export default function RootLayout() {
  return (
    <PenyediaSkema>
      <SafeAreaProvider>
        <PenyediaSesi>
          <TumpukanAkar />
        </PenyediaSesi>
      </SafeAreaProvider>
    </PenyediaSkema>
  );
}

/**
 * Pola transisi (docs/desain/peta-navigasi.md §8), satu tabel untuk semua rute:
 * - `dorong`: masuk lebih dalam ke satu topik; geser dari kanan, geser-kembali
 *   aktif, tombol kembali `‹` di header.
 * - `modal`: membuat/mengubah satu hal lalu kembali; naik dari bawah menutupi
 *   layar penuh, ditutup dengan `✕` di header (tanpa gestur yang bisa
 *   membuang isian tanpa sengaja).
 */
const OPSI_TRANSISI = {
  dorong: { animation: 'slide_from_right', gestureEnabled: true },
  modal: { animation: 'slide_from_bottom', presentation: 'fullScreenModal', gestureEnabled: false },
} as const;

const RUTE_TUMPUKAN: { nama: string; jenis: keyof typeof OPSI_TRANSISI }[] = [
  { nama: 'ukuran', jenis: 'dorong' },
  { nama: 'sumber-data', jenis: 'dorong' },
  { nama: 'latihan', jenis: 'dorong' },
  { nama: 'impor-riwayat', jenis: 'dorong' },
  { nama: 'widget-pengingat', jenis: 'dorong' },
  { nama: 'target-harian', jenis: 'dorong' },
  { nama: 'privasi', jenis: 'dorong' },
  { nama: 'hasil-lab', jenis: 'dorong' },
  { nama: 'tambah-hasil-lab', jenis: 'modal' },
  { nama: 'arah-visual', jenis: 'dorong' },
  { nama: 'peraga', jenis: 'dorong' },
  { nama: 'paritas', jenis: 'dorong' },
];

/**
 * Sesi memilih tumpukan: `Stack.Protected` membuat layar app TIDAK ADA bagi
 * yang keluar (tautan dalam ke /ukuran berakhir di layar masuk), dan layar
 * masuk tidak ada bagi yang sudah masuk. Keluar dari layar mana pun langsung
 * kembali ke layar masuk tanpa tiap layar memeriksanya sendiri.
 */
function TumpukanAkar() {
  const { status, pengguna } = useSesi();
  const skema = useSkema();
  const sudahMasuk = status === 'masuk';
  usePulihkanRute(skema);

  // Jadwal pengingat disegarkan saat app dibuka dan setiap kali kembali ke
  // depan: hari bisa berganti, dan berat bisa masuk dari perangkat lain.
  // Hanya selama masuk — keluar membatalkan semuanya (`useSesi().keluar`).
  useEffect(() => {
    if (!sudahMasuk) return;
    const segarkan = () => void segarkanPengingat().catch(() => undefined);
    segarkan();
    const langganan = AppState.addEventListener('change', (s) => {
      if (s === 'active') segarkan();
    });
    return () => langganan.remove();
  }, [sudahMasuk]);

  // Sesi tersimpan sedang dibaca: layar kosong sewarna latar, bukan kilasan
  // layar masuk yang lalu hilang.
  if (status === 'memuat') return <View style={{ flex: 1, backgroundColor: colors.latar }} />;

  // State per akun dimulai dari nol setiap pengguna berganti (termasuk
  // keluar): akun berikutnya di perangkat ini tidak mewarisi profil, target,
  // tipe hari, hasil lab, koneksi, berkas ekspor, atau kiriman yang belum dibaca.
  return (
    <PenyediaProfil key={pengguna?.id ?? 'tamu'}>
      <PenyediaTarget>
        <PenyediaRedistribusi>
          <PenyediaHariIni>
            <PenyediaHasilLab>
              <PenyediaEkspor>
                <PenyediaSinkron>
                  <StatusBar style={skema === 'gelap' ? 'light' : 'dark'} />
                  {/* key: layar yang sudah terpasang membaca palet baru (lihat PenyediaSkema). */}
                  <Stack
                    key={skema}
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.latar },
                    }}
                  >
                    <Stack.Protected guard={sudahMasuk}>
                      <Stack.Screen name="(tabs)" />
                      {RUTE_TUMPUKAN.map((r) => (
                        <Stack.Screen key={r.nama} name={r.nama} options={OPSI_TRANSISI[r.jenis]} />
                      ))}
                    </Stack.Protected>
                    <Stack.Protected guard={!sudahMasuk}>
                      <Stack.Screen name="masuk" options={{ animation: 'fade' }} />
                    </Stack.Protected>
                  </Stack>
                  {/* Di atas semua layar: kiriman Realtime bisa tiba di layar mana pun. */}
                  {sudahMasuk ? <BannerDataMasuk /> : null}
                  {/* Berkas ekspor yang selesai setelah sheet-nya ditutup. */}
                  {sudahMasuk ? <BannerEksporSiap /> : null}
                </PenyediaSinkron>
              </PenyediaEkspor>
            </PenyediaHasilLab>
          </PenyediaHariIni>
        </PenyediaRedistribusi>
      </PenyediaTarget>
    </PenyediaProfil>
  );
}

/**
 * Navigator dipasang ulang saat skema berganti (lihat `PenyediaSkema`), yang
 * mengembalikan navigasi ke layar awal. Hook ini mengingat rute terakhir dan
 * membukanya lagi, jadi pengguna yang sedang di Pengaturan tetap di Pengaturan
 * ketika HP berpindah ke mode gelap saat senja. Tumpukan "kembali" tidak ikut
 * dipulihkan: layar yang dipulihkan menjadi satu-satunya di atas tab.
 */
function usePulihkanRute(skema: Skema) {
  const rute = usePathname();
  const router = useRouter();
  const ruteTerakhir = useRef(rute);
  const skemaSebelumnya = useRef(skema);

  // Sengaja SEBELUM efek pencatat rute di bawah: efek berjalan menurut urutan
  // deklarasi, jadi di sini `ruteTerakhir` masih rute sebelum pemasangan ulang.
  useEffect(() => {
    if (skemaSebelumnya.current === skema) return;
    skemaSebelumnya.current = skema;
    const tujuan = ruteTerakhir.current;
    if (tujuan && tujuan !== '/') {
      // Tunggu navigator baru terpasang sebelum berpindah.
      const bingkai = requestAnimationFrame(() => router.replace(tujuan as never));
      return () => cancelAnimationFrame(bingkai);
    }
  }, [skema, router]);

  useEffect(() => {
    ruteTerakhir.current = rute;
  }, [rute]);
}
