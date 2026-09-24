import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatDesimal,
  formatTanggalPanjang,
  lajuTerkini,
  rataRata7Hari,
  statusBatasPinggang,
  tanggalHariIni,
} from '@recomp/logika';
import {
  BannerBatasPinggang,
  Card,
  Chip,
  DaftarBaris,
  HeaderLayar,
  HeroPengganti,
  KartuBodyFat,
  KartuHero,
  Pill,
  RiwayatPerubahan,
  SectionHeader,
  SheetBatasPinggang,
  SheetCatatUkuran,
  SheetLengkapiProfil,
  Tombol,
  type UkuranBaru,
} from '@/components';

import { mockRiwayatBerat } from '@/mocks/dailyLog';
import { mockUkuran } from '@/mocks/ukuran';
import { useProfil } from '@/state/profil';
import type { BarisUkuran, UkuranTubuh } from '@/types/domain';
import { colors, spacing, typography } from '@/theme';
import { formatSelisih } from '@/lib/formatTampilan';

/** Urutan tampil; label pendek supaya muat di dua kolom. */
const BAGIAN: { kunci: BarisUkuran['kunci']; label: string; pasangan?: 'kiri' | 'kanan' }[] = [
  { kunci: 'pinggang_cm', label: 'Pinggang' },
  { kunci: 'dada_cm', label: 'Dada' },
  { kunci: 'leher_cm', label: 'Leher' },
  { kunci: 'lengan_kiri_cm', label: 'Lengan kiri', pasangan: 'kiri' },
  { kunci: 'lengan_kanan_cm', label: 'Lengan kanan', pasangan: 'kanan' },
  { kunci: 'paha_kiri_cm', label: 'Paha kiri', pasangan: 'kiri' },
  { kunci: 'paha_kanan_cm', label: 'Paha kanan', pasangan: 'kanan' },
];

/**
 * Layar Ukuran Tubuh.
 *
 * Ukuran melengkapi berat, bukan menggantikannya: berat bisa datar sementara
 * pinggang mengecil dan lengan membesar — itu justru rekomposisi yang berhasil,
 * dan tidak akan terlihat sama sekali dari timbangan.
 *
 * Fase 1 memakai data tiruan yang disimpan di state layar ini, jadi pencatatan
 * baru langsung terlihat tanpa backend. Alert batas pinggang dipasang di task
 * berikutnya pada halaman ini.
 */
export default function UkuranScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profil, perbaruiProfil } = useProfil();

  // Sumber tampilan layar ini; task backend menukarnya dengan query Supabase.
  const [catatan, setCatatan] = useState<UkuranTubuh[]>(mockUkuran);
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [sheetProfilTerbuka, setSheetProfilTerbuka] = useState(false);
  const [sheetBatasTerbuka, setSheetBatasTerbuka] = useState(false);

  // `undefined` saat belum ada pencatatan sama sekali: layar menampilkan
  // panduan mulai mencatat, bukan angka nol atau layar jatuh.
  const terbaru: UkuranTubuh | undefined = catatan[catatan.length - 1];
  // Label CTA menyebut apa yang akan terjadi: hari yang sudah terisi diperbarui,
  // bukan ditambah — supaya tidak terkesan membuat baris kedua di tanggal sama.
  /**
   * Laju pinggang dari beberapa pencatatan terakhir, bukan dari satu selang:
   * satu pekan yang salah ukur tidak boleh memicu maupun menyembunyikan
   * peringatan.
   */
  const statusBatas = statusBatasPinggang(
    terbaru?.pinggang_cm ?? 0,
    profil.batas_pinggang_cm,
    lajuTerkini(catatan.map((u) => ({ tanggal: u.tanggal, nilai: u.pinggang_cm }))),
  );

  const labelAksi =
    terbaru?.tanggal === tanggalHariIni() ? 'Perbarui ukuran hari ini' : 'Catat ukuran mingguan';
  const sebelumnya = catatan[catatan.length - 2] ?? null;
  const pertama = catatan[0] ?? null;

  /**
   * Simpan pencatatan: GANTI bila tanggalnya sudah ada, sisipkan bila belum.
   *
   * Satu tanggal hanya boleh punya satu pencatatan — dua baris di hari yang
   * sama membuat selisih mingguan terbaca dari pasangan yang salah. Hasilnya
   * diurutkan ulang karena tanggal bisa digeser ke belakang di form.
   */
  function simpanUkuran(baru: UkuranBaru) {
    setCatatan((lama) => {
      const adaIndex = lama.findIndex((u) => u.tanggal === baru.tanggal);
      const berikut =
        adaIndex >= 0
          ? lama.map((u, i) => (i === adaIndex ? { ...u, ...baru } : u))
          : [...lama, { id: `uk-${Date.now()}`, ...baru }];
      return [...berikut].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    });
  }

  const baris: BarisUkuran[] = terbaru
    ? BAGIAN.map((b) => ({
        ...b,
        nilai: terbaru[b.kunci],
        selisih: sebelumnya ? bulat(terbaru[b.kunci] - sebelumnya[b.kunci]) : null,
      }))
    : [];

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
        judul="Ukuran tubuh"
        subjudul={terbaru ? `Terakhir ${formatTanggalPanjang(terbaru.tanggal)}` : 'Belum ada pencatatan'}
      />

      {/* Pinggang jadi angka utama: ia penanda lemak perut yang paling responsif.
          Memakai HeroNumber, bukan hero rakitan sendiri, supaya batas Dynamic
          Type (MAKS_SKALA_HERO) ikut berlaku seperti di layar lain. */}
      <KartuHero
        label="Pinggang"
        nilai={terbaru ? formatDesimal(terbaru.pinggang_cm) : '—'}
        unit="cm"
        keterangan={
          terbaru && pertama
            ? `${selisihTeks(terbaru.pinggang_cm - pertama.pinggang_cm)} sejak ${formatTanggalPanjang(pertama.tanggal)}`
            : undefined
        }
        nada="netral"
        pengganti={
          terbaru ? undefined : (
            <HeroPengganti
              label="Pinggang"
              judul="Belum ada ukuran tubuh"
              keterangan="Ukur pinggang, dada, leher, lengan, dan paha seminggu sekali: pagi hari, sebelum makan, di titik yang sama. Dari pencatatan kedua, arah perubahannya mulai terbaca."
              aksi={<Tombol label="Catat ukuran pertama" onPress={() => setSheetTerbuka(true)} />}
            />
          )
        }
      >
        {terbaru ? (
          <View style={{ alignItems: 'center', marginTop: spacing.md }}>
            {/* Batas pinggang diatur dari sini, bukan dari Setelan: angkanya baru
                punya arti saat dilihat berdampingan dengan pinggang hari ini. */}
            <Chip
              sejajar="tengah"
              ikon="resize-outline"
              label={
                profil.batas_pinggang_cm !== null
                  ? `Batas ${formatDesimal(profil.batas_pinggang_cm)} cm · Ubah`
                  : 'Tetapkan batas pinggang'
              }
              aksesLabel={
                profil.batas_pinggang_cm !== null
                  ? `Batas pinggang ${formatDesimal(profil.batas_pinggang_cm)} sentimeter. Ketuk untuk mengubah.`
                  : 'Batas pinggang belum ditetapkan. Ketuk untuk menetapkan.'
              }
              onPress={() => setSheetBatasTerbuka(true)}
            />
          </View>
        ) : null}
      </KartuHero>

      {terbaru ? (
        <>
          {/* Peringatan batas — hanya muncul saat ada yang perlu diputuskan */}
          <BannerBatasPinggang
            status={statusBatas}
            batasCm={profil.batas_pinggang_cm}
            pinggangCm={terbaru.pinggang_cm}
            fase={profil.fase_aktif}
            onUbahBatas={() => setSheetBatasTerbuka(true)}
            // `navigate`, bukan `push`: kembali ke tab yang sudah ada di bawah tumpukan
            // (lalu pindah ke Budget), bukan menumpuk salinan tab di atas Ukuran.
            onLihatFase={() => router.navigate('/(tabs)/budget')}
          />

          {/* Aksi utama layar: catat ukuran pekan ini */}
          <Tombol label={labelAksi} onPress={() => setSheetTerbuka(true)} />

          {/* Estimasi body fat: angka turunan, jadi ditempatkan SETELAH pengukuran
              dan dengan bobot visual yang lebih kecil daripada hero pinggang */}
          <KartuBodyFat
            profil={profil}
            terbaru={terbaru}
            pertama={pertama}
            beratRataRataKg={rataRata7Hari(mockRiwayatBerat, terbaru.tanggal).rataRataKg}
            onLengkapiProfil={() => setSheetProfilTerbuka(true)}
          />

          {/* Semua ukuran, dengan perubahan sejak pencatatan sebelumnya */}
          <View>
            <SectionHeader
              judul="Ukuran terbaru"
              aksi={sebelumnya ? `vs ${formatTanggalPanjang(sebelumnya.tanggal)}` : 'pencatatan pertama'}
            />
            <DaftarBaris>
              {baris.map((b) => (
                <View
                  key={b.kunci}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: spacing.lg,
                  }}
                >
                  <Text style={{ ...typography.body, color: colors.teks }}>{b.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
                    {b.selisih !== null && b.selisih !== 0 ? (
                      <Text style={{ ...typography.caption, color: colors.teksRedup }}>
                        {selisihTeks(b.selisih)}
                      </Text>
                    ) : null}
                    <Text style={{ ...typography.title, color: colors.teks }}>
                      {formatDesimal(b.nilai)}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.teksSamar }}>cm</Text>
                  </View>
                </View>
              ))}
            </DaftarBaris>
          </View>

          {/* Riwayat perubahan per bagian tubuh */}
          <RiwayatPerubahan catatan={catatan} bagian={BAGIAN} />
        </>
      ) : null}

      <Card>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          Ukuran melengkapi berat, bukan menggantikannya. Berat bisa datar sementara pinggang
          mengecil dan lengan membesar — itu justru rekomposisi yang berhasil, dan tidak akan
          terlihat sama sekali dari timbangan. Lengan dan paha dicatat kiri dan kanan terpisah
          karena asimetri itu nyata dan berguna dilacak.
        </Text>
      </Card>

      <Pill sejajar="tengah" label="Data tiruan · estimasi lemak tubuh memakai metode Navy" />

      <SheetCatatUkuran
        terbuka={sheetTerbuka}
        onTutup={() => setSheetTerbuka(false)}
        catatan={catatan}
        onSimpan={simpanUkuran}
      />

      {/* Batas pinggang baru bermakna setelah ada ukuran pinggang pertama. */}
      {terbaru ? (
        <SheetBatasPinggang
          terbuka={sheetBatasTerbuka}
          onTutup={() => setSheetBatasTerbuka(false)}
          batasCm={profil.batas_pinggang_cm}
          pinggangSekarangCm={terbaru.pinggang_cm}
          pinggangAwalCm={pertama?.pinggang_cm ?? null}
          onSimpan={(batas) => perbaruiProfil({ batas_pinggang_cm: batas })}
        />
      ) : null}

      <SheetLengkapiProfil
        terbuka={sheetProfilTerbuka}
        onTutup={() => setSheetProfilTerbuka(false)}
        profil={profil}
        onSimpan={perbaruiProfil}
      />
    </ScrollView>
  );
}

/** "+0,4 cm" / "−0,3 cm"; tanda minus memakai karakter minus, bukan hyphen. */
function selisihTeks(selisih: number): string {
  return formatSelisih(selisih, { unit: 'cm', nol: 'tidak berubah' });
}

function bulat(n: number): number {
  return Math.round(n * 10) / 10;
}
