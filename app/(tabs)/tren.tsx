import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  arahSesuaiFase,
  deretTren,
  formatDesimal,
  formatTanggalPanjang,
  JENDELA_HARI,
  kecukupanTren,
  jangkarKoridor,
  koridorTarget,
  LAJU_PER_MINGGU,
  mundurHari,
  rataRata7Hari,
  sinyalArah,
  statusKoridor,
  tanggalHariIni,
} from '@recomp/logika';
import type { Fase, StatusKoridor } from '@recomp/logika';
import {
  Card,
  CatatanKecukupan,
  GrafikTren,
  HeaderLayar,
  KartuHero,
  LabelSinyalArah,
  PenandaSumber,
  Pill,
  SectionHeader,
} from '@/components';
import { mockRiwayatBerat } from '@/mocks/dailyLog';
import { useProfil } from '@/state/profil';
import { sumberBerat } from '@/lib/sumber';
import { colors, radius, spacing, typography } from '@/theme';
import { formatSelisih } from '@/lib/formatTampilan';

/**
 * Layar Tren.
 *
 * Angka utamanya sengaja RATA-RATA 7 HARI, bukan berat hari ini: berat harian
 * bergoyang karena air, garam, dan isi usus, dan menatapnya tiap pagi membuat
 * orang menyimpulkan hal yang salah. Berat harian tetap ditampilkan, tapi
 * sebagai konteks kecil di bawah — bukan sebagai bintang utama.
 *
 * Fase 1 masih memakai data tiruan; koridor target dan grafik penuh dipasang
 * di task berikutnya pada halaman ini.
 */
export default function TrenScreen() {
  const insets = useSafeAreaInsets();
  const { profil, riwayatFase } = useProfil();
  const router = useRouter();
  const [tampilkanHarian, setTampilkanHarian] = useState(true);

  const riwayat = mockRiwayatBerat;
  // Tanpa satu pun timbangan, tanggal acuan jatuh ke hari ini — kalau dibiarkan
  // string kosong, pemformat tanggal dan seluruh grafik ikut pecah.
  const hariIni = riwayat[riwayat.length - 1]?.tanggal ?? tanggalHariIni();

  const rata = rataRata7Hari(riwayat, hariIni);
  const sinyal = sinyalArah(riwayat, hariIni);
  const terakhir = riwayat[riwayat.length - 1];

  // Rata-rata sepekan lalu, untuk menunjukkan perbandingannya secara eksplisit.
  const sepekanLalu = rataRata7Hari(riwayat, mundurHari(hariIni, JENDELA_HARI));
  const deret = deretTren(riwayat, mundurHari(hariIni, 13), hariIni);

  // Koridor digambar sejak periode fase BERJALAN dimulai, cukup panjang untuk
  // menutupi grafik. Mengganti fase memulai koridor baru dari jangkar baru —
  // bukan laju fase baru yang ditempel ke jangkar fase lama.
  const jangkar = jangkarKoridor(riwayatFase, riwayat);
  const koridor =
    jangkar && jangkar.beratKg !== null ? koridorTarget(jangkar.beratKg, jangkar.tanggal, profil.fase_aktif, 60) : null;
  const posisi: StatusKoridor = koridor
    ? statusKoridor(koridor, hariIni, rata.rataRataKg)
    : { posisi: 'belum bisa dinilai', selisihKg: null, bawahKg: null, atasKg: null };
  /** Fase baru dimulai setelah timbangan terakhir: belum ada titik untuk dinilai. */
  const faseBaruDimulai = jangkar !== null && jangkar.tanggal > hariIni;
  const kecukupan = kecukupanTren(riwayat, hariIni);

  // Warna mengikuti KECOCOKAN dengan fase, bukan arah — aturan yang sama
  // dipakai LabelSinyalArah, supaya stat dan label tidak bertentangan warnanya.
  const cocok = arahSesuaiFase(sinyal.arah, profil.fase_aktif);
  const warnaArah =
    cocok === 'sesuai'
      ? colors.status.sukses.teks
      : cocok === 'berlawanan'
        ? colors.status.peringatan.teks
        : colors.teksRedup;

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
      <HeaderLayar
        judul="Tren berat"
        subjudul={formatTanggalPanjang(hariIni)}
        aksi={<Pill label={profil.fase_aktif} warna={colors.status.sukses.teks} />}
      />

      {/* Angka utama: rata-rata 7 hari, bukan berat hari ini */}
      <KartuHero
        label={`Rata-rata ${JENDELA_HARI} hari`}
        nilai={rata.rataRataKg !== null ? formatDesimal(rata.rataRataKg) : '—'}
        unit="kg"
        keterangan={
          rata.rataRataKg !== null
            ? `dari ${rata.jumlahTimbangan} timbangan dalam ${JENDELA_HARI} hari terakhir`
            : 'belum ada timbangan dalam sepekan terakhir'
        }
        warna={colors.teks}
        stat={[
          {
            label: 'Arah sepekan',
            nilai: sinyal.perubahanKg !== null ? formatSelisih(sinyal.perubahanKg) : '—',
            unit: sinyal.perubahanKg !== null ? 'kg' : undefined,
            warna: warnaArah,
          },
          {
            label: 'Sepekan lalu',
            nilai: sepekanLalu.rataRataKg !== null ? formatDesimal(sepekanLalu.rataRataKg) : '—',
            unit: 'kg',
            warna: colors.teksRedup,
          },
          {
            label: 'Terakhir',
            nilai: terakhir?.berat_pagi_kg !== undefined ? formatDesimal(terakhir.berat_pagi_kg) : '—',
            unit: 'kg',
            warna: colors.teksRedup,
          },
        ]}
      />

      {/* Grafik: rata-rata 7 hari sebagai garis, timbangan harian sebagai titik */}
      <View>
        <SectionHeader judul="Rata-rata 7 hari" aksi="14 hari terakhir" />
        <Card>
          <GrafikTren
            titik={deret}
            tampilkanHarian={tampilkanHarian}
            onUbahTampilkanHarian={setTampilkanHarian}
            koridor={koridor}
          />
        </Card>
      </View>

      {/* Posisi terhadap koridor target */}
      <View>
        <SectionHeader judul="Koridor target" aksi={`fase ${profil.fase_aktif}`} />
        <Card>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text style={{ ...typography.title, color: warnaKoridor(posisi.posisi) }}>
                {posisi.posisi === 'di dalam koridor' ? 'Di dalam koridor' : ubahHuruf(posisi.posisi)}
              </Text>
            </View>
            {posisi.bawahKg !== null && posisi.atasKg !== null && kecukupan.cukupRataRata ? (
              <Text style={{ ...typography.body, color: colors.teksRedup }}>
                Rentang hari ini {formatDesimal(posisi.bawahKg)}–{formatDesimal(posisi.atasKg)} kg;
                rata-rata Anda {rata.rataRataKg !== null ? formatDesimal(rata.rataRataKg) : '—'} kg
                {posisi.selisihKg !== null && posisi.selisihKg !== 0
                  ? `, selisih ${formatDesimal(Math.abs(posisi.selisihKg))} kg dari batas terdekat.`
                  : '.'}
              </Text>
            ) : (
              <Text style={{ ...typography.body, color: colors.teksRedup }}>
                {faseBaruDimulai && jangkar
                  ? `Fase ${profil.fase_aktif} dimulai ${formatTanggalPanjang(jangkar.tanggal)}; posisinya terbaca mulai timbangan berikutnya.`
                  : 'Belum cukup data untuk menilai posisi terhadap koridor.'}
              </Text>
            )}
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              {jangkar && jangkar.beratKg !== null
                ? `Koridor memakai laju ${persenLaju(profil.fase_aktif)} berat badan per minggu sejak fase dimulai (${formatTanggalPanjang(jangkar.tanggal)}, ${formatDesimal(jangkar.beratKg)} kg). Ini rentang yang bisa dipertahankan, bukan nilai benar-salah.`
                : `Koridor fase ${profil.fase_aktif} digambar setelah timbangan pertama di fase ini.`}
            </Text>
          </View>
        </Card>
      </View>

      {/* Sinyal arah, dijelaskan dengan kalimat — bukan hanya panah */}
      <View>
        <SectionHeader judul="Sinyal arah" aksi={`ambang ${formatDesimal(sinyal.ambangKg)} kg`} />
        <Card>
          <View style={{ gap: spacing.md }}>
            <LabelSinyalArah sinyal={sinyal} fase={profil.fase_aktif} />
            <CatatanKecukupan kecukupan={kecukupan} untuk="arah" />
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              Dihitung dari rata-rata {JENDELA_HARI} hari dibanding rata-rata {JENDELA_HARI} hari
              sebelumnya — rata-rata lawan rata-rata, supaya satu hari yang aneh tidak
              mengubah kesimpulan.
            </Text>
          </View>
        </Card>
      </View>

      {/* Jalan masuk ke ukuran tubuh — pelengkap berat, bukan penggantinya */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buka ukuran tubuh"
        onPress={() => router.push('/ukuran')}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: spacing.xxs, flex: 1 }}>
              <Text style={{ ...typography.label, color: colors.teks }}>Ukuran tubuh</Text>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                Pinggang, dada, lengan, paha, leher — yang tidak terlihat dari timbangan
              </Text>
            </View>
            <Text style={{ ...typography.title, color: colors.aksen.teks }}>›</Text>
          </View>
        </Card>
      </Pressable>

      {/* Daftar timbangan terakhir, dengan asal tiap angkanya */}
      <View>
        <SectionHeader judul="Timbangan terakhir" aksi={`${deret.length} hari`} />
        <Card flat>
          {[...deret].reverse().map((t, i) => (
            <View
              key={t.tanggal}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.garis,
              }}
            >
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text style={{ ...typography.label, color: colors.teks }}>
                  {formatTanggalPanjang(t.tanggal)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {asalHari(t.tanggal)}
                  <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                    rata-rata {t.rataRataKg !== null ? formatDesimal(t.rataRataKg) : '—'} kg
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  ...typography.title,
                  color: t.beratHarianKg !== null ? colors.teks : colors.teksSamar,
                }}
              >
                {t.beratHarianKg !== null ? formatDesimal(t.beratHarianKg) : '—'}
              </Text>
            </View>
          ))}
        </Card>
      </View>

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
            Data tiruan · grafik & koridor menyusul
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Warna status koridor; di dalam = jade, di luar = amber (fakta, bukan alarm). */
function warnaKoridor(posisi: string): string {
  return posisi === 'di dalam koridor' ? colors.status.sukses.teks : colors.status.peringatan.teks;
}

/** Kapitalkan huruf pertama untuk dipakai sebagai judul status. */
function ubahHuruf(teks: string): string {
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}

/** Laju koridor fase aktif, dinyatakan dalam persen per minggu. */
function persenLaju(fase: Fase): string {
  const l = LAJU_PER_MINGGU[fase];
  const p = (n: number) => `${n > 0 ? '+' : ''}${formatDesimal(n * 100, 2)}%`;
  return `${p(l.min)} s/d ${p(l.maks)}`;
}

/** Penanda asal timbangan satu hari; kosong bila hari itu tidak ditimbang. */
function asalHari(tanggal: string) {
  const entri = mockRiwayatBerat.find((r) => r.tanggal === tanggal);
  if (!entri) return null;
  const jenis = sumberBerat(entri.sumber_berat);
  return jenis ? <PenandaSumber jenis={jenis} /> : null;
}

