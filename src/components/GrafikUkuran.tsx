import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatDesimal, formatTanggalPanjang, type TitikUkuran } from '@recomp/logika';
import { colors, spacing, TAP_MIN, typography } from '@/theme';

const TINGGI_PLOT = 140;
const PAD_KIRI = 40;
const PAD_KANAN = 16;
const PAD_ATAS = 16;
const PAD_BAWAH = 20;

type Props = {
  titik: TitikUkuran[];
  /** Nama bagian tubuh, dipakai label aksesibilitas tiap titik. */
  label: string;
};

/**
 * Grafik satu bagian tubuh sepanjang riwayat pencatatan.
 *
 * SATU seri, jadi tidak ada kotak legenda — judul bagiannya sudah disebut di
 * atas grafik. Angka juga tidak ditempel di setiap titik: nilai terakhir saja
 * yang dilabeli langsung, sisanya dibawa daftar perubahan di bawahnya. Label di
 * tiap titik pada grafik sekecil ini justru menutupi garisnya sendiri.
 *
 * Domain Y sengaja TIDAK dimulai dari nol. Untuk lingkar tubuh, nol bukan titik
 * acuan yang bermakna — memaksanya masuk akan memampatkan seluruh perubahan
 * nyata (yang besarnya sentimeter) menjadi garis datar.
 */
export function GrafikUkuran({ titik, label }: Props) {
  const [lebar, setLebar] = useState(0);
  const [aktif, setAktif] = useState<number | null>(null);

  const lebarPlot = Math.max(lebar - PAD_KIRI - PAD_KANAN, 1);

  /**
   * Domain Y dibulatkan ke 0,5 cm, lalu direntang sampai panjangnya kelipatan
   * 1 cm. Dua alasan: angka sumbunya jadi bulat (84,0 / 85,0 / 86,0 alih-alih
   * 84,0 / 84,75 / 85,5 yang labelnya harus dibulatkan dan jadi berbohong soal
   * posisi garisnya), dan bantalannya tetap tipis — perubahan lingkar tubuh
   * besarnya sentimeter, jadi domain yang terlalu longgar memipihkan grafiknya
   * menjadi garis datar palsu.
   */
  const { min, maks, tick } = useMemo(() => {
    const nilai = titik.map((t) => t.nilai);
    if (nilai.length === 0) return { min: 0, maks: 1, tick: [] as number[] };
    const terkecil = Math.min(...nilai);
    const terbesar = Math.max(...nilai);
    let lo = Math.floor((terkecil - 0.1) * 2) / 2;
    let hi = Math.ceil((terbesar + 0.1) * 2) / 2;
    // Rentangkan ke sisi yang bantalannya paling sempit supaya data tetap di tengah.
    if (Math.round((hi - lo) * 2) % 2 !== 0) {
      if (terkecil - lo <= hi - terbesar) lo -= 0.5;
      else hi += 0.5;
    }
    const langkah = (hi - lo) / 2;
    return {
      min: lo,
      maks: hi,
      tick: [0, 1, 2].map((i) => Math.round((lo + langkah * i) * 10) / 10),
    };
  }, [titik]);

  const x = (i: number) =>
    PAD_KIRI + (titik.length <= 1 ? lebarPlot / 2 : (lebarPlot * i) / (titik.length - 1));
  const y = (nilai: number) =>
    PAD_ATAS + (TINGGI_PLOT - PAD_ATAS - PAD_BAWAH) * (1 - (nilai - min) / (maks - min || 1));

  const jalur = titik.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(t.nilai)}`).join(' ');
  const terakhir = titik.length > 0 ? titik[titik.length - 1] : null;
  const disorot = aktif !== null ? titik[aktif] : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <View onLayout={(e) => setLebar(e.nativeEvent.layout.width)}>
        {lebar > 0 && titik.length > 0 ? (
          <>
            <Svg width={lebar} height={TINGGI_PLOT}>
              {/* Garis bantu hairline, solid, satu langkah dari permukaan. */}
              {tick.map((t) => (
                <Line
                  key={t}
                  x1={PAD_KIRI}
                  x2={lebar - PAD_KANAN}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={colors.garis}
                  strokeWidth={1}
                />
              ))}

              {titik.length > 1 ? (
                <Path
                  d={jalur}
                  stroke={colors.aksen.isian}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null}

              {/* Cincin warna permukaan 2px supaya titik tetap terbaca di atas garis. */}
              {titik.map((t, i) => (
                <Circle
                  key={t.tanggal}
                  cx={x(i)}
                  cy={y(t.nilai)}
                  r={aktif === i ? 6 : 4}
                  fill={colors.aksen.isian}
                  stroke={colors.permukaan}
                  strokeWidth={2}
                />
              ))}
            </Svg>

            {/* Nilai sumbu Y, di luar SVG supaya ikut Dynamic Type. */}
            {tick.map((t) => (
              <Text
                key={t}
                style={{
                  ...typography.caption,
                  color: colors.teksSamar,
                  position: 'absolute',
                  left: 0,
                  width: PAD_KIRI - 6,
                  textAlign: 'right',
                  top: y(t) - 7,
                }}
              >
                {formatDesimal(t)}
              </Text>
            ))}

            {/* Label langsung hanya di titik terakhir. */}
            {terakhir && aktif === null ? (
              <Text
                style={{
                  ...typography.label,
                  color: colors.teks,
                  position: 'absolute',
                  right: PAD_KANAN,
                  top: Math.max(y(terakhir.nilai) - 26, 0),
                }}
              >
                {formatDesimal(terakhir.nilai)}
              </Text>
            ) : null}

            {/* Area sentuh per titik; lebarnya jauh melebihi titiknya sendiri. */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: TINGGI_PLOT, flexDirection: 'row' }}>
              {titik.map((t, i) => (
                <Pressable
                  key={t.tanggal}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${formatDesimal(t.nilai)} sentimeter pada ${formatTanggalPanjang(t.tanggal)}`}
                  onPress={() => setAktif(aktif === i ? null : i)}
                  style={{ flex: 1, minHeight: TAP_MIN }}
                />
              ))}
            </View>
          </>
        ) : (
          <View style={{ height: TINGGI_PLOT }} />
        )}
      </View>

      {/* Baris keterangan: titik yang disorot, atau rentang tanggalnya. */}
      <Text style={{ ...typography.caption, color: colors.teksSamar, textAlign: 'center' }}>
        {disorot
          ? `${formatTanggalPanjang(disorot.tanggal)} · ${formatDesimal(disorot.nilai)} cm`
          : titik.length > 1
            ? `${formatTanggalPanjang(titik[0].tanggal)} → ${formatTanggalPanjang(titik[titik.length - 1].tanggal)} · ketuk titik untuk lihat tanggalnya`
            : 'baru satu pencatatan'}
      </Text>
    </View>
  );
}
