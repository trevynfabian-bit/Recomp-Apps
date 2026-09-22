import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deretTren,
  formatDesimal,
  formatTanggalPanjang,
  JENDELA_HARI,
  mundurHari,
  rataRata7Hari,
  sinyalArah,
} from '@recomp/logika';
import { Card, HeroNumber, PenandaSumber, Pill, SectionHeader } from '@/components';
import { mockProfile, mockRiwayatBerat } from '@/mocks/dailyLog';
import { sumberBerat } from '@/lib/sumber';
import { colors, radius, spacing, typography } from '@/theme';

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

  const riwayat = mockRiwayatBerat;
  const hariIni = riwayat[riwayat.length - 1]?.tanggal ?? '';

  const rata = rataRata7Hari(riwayat, hariIni);
  const sinyal = sinyalArah(riwayat, hariIni);
  const terakhir = riwayat[riwayat.length - 1];

  // Rata-rata sepekan lalu, untuk menunjukkan perbandingannya secara eksplisit.
  const sepekanLalu = rataRata7Hari(riwayat, mundurHari(hariIni, JENDELA_HARI));
  const deret = deretTren(riwayat, mundurHari(hariIni, 13), hariIni);

  const warnaArah =
    sinyal.arah === 'naik'
      ? colors.amber
      : sinyal.arah === 'turun'
        ? colors.aksenTeks.jade
        : colors.textMuted;

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ ...typography.title, color: colors.text }}>Tren berat</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            {formatTanggalPanjang(hariIni)}
          </Text>
        </View>
        <Pill label={mockProfile.fase_aktif} warna={colors.aksenTeks.jade} />
      </View>

      {/* Angka utama: rata-rata 7 hari, bukan berat hari ini */}
      <Card style={{ paddingVertical: spacing.xl }}>
        <HeroNumber
          label={`Rata-rata ${JENDELA_HARI} hari`}
          nilai={rata.rataRataKg !== null ? formatDesimal(rata.rataRataKg) : '—'}
          unit="kg"
          keterangan={
            rata.rataRataKg !== null
              ? `dari ${rata.jumlahTimbangan} timbangan dalam ${JENDELA_HARI} hari terakhir`
              : 'belum ada timbangan dalam sepekan terakhir'
          }
          warna={colors.text}
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
          <StatKecil
            label="Arah sepekan"
            nilai={
              sinyal.perubahanKg !== null
                ? `${sinyal.perubahanKg > 0 ? '+' : sinyal.perubahanKg < 0 ? '−' : ''}${formatDesimal(Math.abs(sinyal.perubahanKg))}`
                : '—'
            }
            unit={sinyal.perubahanKg !== null ? 'kg' : ''}
            warna={warnaArah}
          />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil
            label="Sepekan lalu"
            nilai={sepekanLalu.rataRataKg !== null ? formatDesimal(sepekanLalu.rataRataKg) : '—'}
            unit="kg"
            warna={colors.textMuted}
          />
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <StatKecil
            label="Terakhir"
            nilai={terakhir?.berat_pagi_kg !== undefined ? formatDesimal(terakhir.berat_pagi_kg) : '—'}
            unit="kg"
            warna={colors.textMuted}
          />
        </View>
      </Card>

      {/* Sinyal arah, dijelaskan dengan kalimat — bukan hanya panah */}
      <View>
        <SectionHeader judul="Sinyal arah" aksi={`ambang ${formatDesimal(sinyal.ambangKg)} kg`} />
        <Card>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs + 1,
                  borderRadius: radius.pill,
                  backgroundColor: warnaArah + '1A',
                  borderWidth: 1,
                  borderColor: warnaArah + '55',
                }}
              >
                <Text style={{ ...typography.label, color: warnaArah, textTransform: 'capitalize' }}>
                  {sinyal.arah}
                </Text>
              </View>
            </View>
            <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
              {kalimatSinyal(sinyal.arah, sinyal.perubahanKg, sinyal.ambangKg)}
            </Text>
            <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
              Dihitung dari rata-rata {JENDELA_HARI} hari dibanding rata-rata {JENDELA_HARI} hari
              sebelumnya — rata-rata lawan rata-rata, supaya satu hari yang aneh tidak
              mengubah kesimpulan.
            </Text>
          </View>
        </Card>
      </View>

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
                borderTopColor: colors.border,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ ...typography.label, color: colors.text }}>
                  {formatTanggalPanjang(t.tanggal)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {asalHari(t.tanggal)}
                  <Text style={{ ...typography.caption, color: colors.textFaint }}>
                    rata-rata {t.rataRataKg !== null ? formatDesimal(t.rataRataKg) : '—'} kg
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  ...typography.title,
                  color: t.beratHarianKg !== null ? colors.text : colors.textFaint,
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
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            Data tiruan · grafik & koridor menyusul
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Penanda asal timbangan satu hari; kosong bila hari itu tidak ditimbang. */
function asalHari(tanggal: string) {
  const entri = mockRiwayatBerat.find((r) => r.tanggal === tanggal);
  if (!entri) return null;
  const jenis = sumberBerat(entri.sumber_berat);
  return jenis ? <PenandaSumber jenis={jenis} /> : null;
}

/** Kalimat penjelas sinyal arah; nadanya netral, tanpa menghakimi. */
function kalimatSinyal(
  arah: string,
  perubahan: number | null,
  ambang: number,
): string {
  if (perubahan === null) {
    return `Belum cukup timbangan untuk membandingkan dua pekan. Terus timbang pagi, ` +
      `angka ini muncul sendiri.`;
  }
  const besar = formatDesimal(Math.abs(perubahan));
  if (arah === 'datar') {
    return `Rata-rata bergerak ${besar} kg dalam sepekan — masih di bawah ambang ` +
      `${formatDesimal(ambang)} kg, jadi ini terbaca datar, bukan naik atau turun.`;
  }
  if (arah === 'naik') {
    return `Rata-rata naik ${besar} kg dibanding pekan lalu.`;
  }
  return `Rata-rata turun ${besar} kg dibanding pekan lalu.`;
}

function StatKecil({
  label,
  nilai,
  unit,
  warna,
}: {
  label: string;
  nilai: string;
  unit: string;
  warna: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
      <Text
        style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text style={{ ...typography.title, color: warna }}>{nilai}</Text>
        {unit ? <Text style={{ ...typography.caption, color: colors.textFaint }}>{unit}</Text> : null}
      </View>
    </View>
  );
}
