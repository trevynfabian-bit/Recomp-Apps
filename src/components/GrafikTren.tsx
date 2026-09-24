import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { formatDesimal, formatTanggalPanjang } from '@recomp/logika';
import type { KoridorTarget, TitikTren } from '@recomp/logika';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';

/** Tinggi area gambar, tidak termasuk label sumbu. */
const TINGGI_PLOT = 180;
const PAD_KIRI = 38;
const PAD_KANAN = 14;
const PAD_ATAS = 12;
const PAD_BAWAH = 22;

type Props = {
  titik: TitikTren[];
  /** Tampilkan titik timbangan harian. Bisa dimatikan bila terasa ramai. */
  tampilkanHarian?: boolean;
  onUbahTampilkanHarian?: (nilai: boolean) => void;
  /** Koridor target; digambar sebagai pita di belakang garis. */
  koridor?: KoridorTarget | null;
};

/**
 * Grafik garis rata-rata 7 hari.
 *
 * Satu seri saja, jadi tidak ada kotak legenda — judul kartunya sudah menyebut
 * apa yang digambar. Berat harian ikut ditandai sebagai titik redup: ia konteks,
 * bukan cerita utamanya.
 *
 * Garisnya memakai amber, bukan jade. Itu keputusan aksesibilitas, bukan selera:
 * jade terhadap warna titik harian hanya berjarak ΔE 1,7 pada deuteranopia —
 * praktis tak terbedakan bagi mata buta warna merah-hijau. Amber berjarak 18,1.
 */
export function GrafikTren({
  titik,
  tampilkanHarian = true,
  onUbahTampilkanHarian,
  koridor = null,
}: Props) {
  const [lebar, setLebar] = useState(0);
  const [aktif, setAktif] = useState<number | null>(null);

  const punyaData = titik.some((t) => t.rataRataKg !== null);
  const lebarPlot = Math.max(lebar - PAD_KIRI - PAD_KANAN, 1);

  /** Domain sumbu Y dibulatkan ke 0,5 kg supaya angkanya enak dibaca. */
  const { min, maks, tick } = useMemo(() => {
    const dariTitik = titik.flatMap((t) =>
      (tampilkanHarian ? [t.rataRataKg, t.beratHarianKg] : [t.rataRataKg]).filter(
        (n): n is number => n !== null,
      ),
    );
    // Koridor ikut menentukan domain; tanpa ini pitanya terpotong di tepi.
    const dariKoridor = (koridor?.titik ?? [])
      .filter((k) => titik.some((t) => t.tanggal === k.tanggal))
      .flatMap((k) => [k.bawahKg, k.atasKg]);
    const nilai = [...dariTitik, ...dariKoridor];
    if (nilai.length === 0) return { min: 0, maks: 1, tick: [] as number[] };

    const lo = Math.floor((Math.min(...nilai) - 0.3) * 2) / 2;
    const hi = Math.ceil((Math.max(...nilai) + 0.3) * 2) / 2;
    const langkah = (hi - lo) / 3;
    return {
      min: lo,
      maks: hi,
      tick: [0, 1, 2, 3].map((i) => Math.round((lo + langkah * i) * 10) / 10),
    };
  }, [titik, tampilkanHarian, koridor]);

  const x = (i: number) =>
    PAD_KIRI + (titik.length <= 1 ? lebarPlot / 2 : (i / (titik.length - 1)) * lebarPlot);
  const y = (nilai: number) =>
    PAD_ATAS + TINGGI_PLOT - ((nilai - min) / (maks - min || 1)) * TINGGI_PLOT;

  /** Jalur garis rata-rata; ruas tanpa data diputus, bukan disambung lurus. */
  const jalur = useMemo(() => {
    let d = '';
    let menyambung = false;
    titik.forEach((t, i) => {
      if (t.rataRataKg === null) {
        menyambung = false;
        return;
      }
      d += `${menyambung ? 'L' : 'M'}${x(i)} ${y(t.rataRataKg)} `;
      menyambung = true;
    });
    return d.trim();
  }, [titik, lebar, min, maks]);

  /** Wash area di bawah garis — 10% saja, bukan blok pekat. */
  const jalurArea = useMemo(() => {
    const berisi = titik.map((t, i) => ({ t, i })).filter(({ t }) => t.rataRataKg !== null);
    if (berisi.length < 2) return '';
    const dasar = PAD_ATAS + TINGGI_PLOT;
    const naik = berisi
      .map(({ t, i }, n) => `${n === 0 ? 'M' : 'L'}${x(i)} ${y(t.rataRataKg as number)}`)
      .join(' ');
    return `${naik} L${x(berisi[berisi.length - 1].i)} ${dasar} L${x(berisi[0].i)} ${dasar} Z`;
  }, [titik, lebar, min, maks]);

  /**
   * PanResponder dibuat SEKALI, jadi penanganannya akan memegang closure render
   * pertama — saat itu lebar masih 0 dan setiap sentuhan mendarat di titik
   * terakhir. Nilai terbaru dibaca lewat ref supaya tidak basi.
   */
  const terkini = useRef({ lebarPlot, jumlah: titik.length });
  terkini.current = { lebarPlot, jumlah: titik.length };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => pilihDariSentuhan(e.nativeEvent.locationX),
      onPanResponderMove: (e) => pilihDariSentuhan(e.nativeEvent.locationX),
      onPanResponderRelease: () => setAktif(null),
      onPanResponderTerminate: () => setAktif(null),
    }),
  ).current;

  /** Pita koridor + kedua garis batasnya, selaras dengan sumbu X titik tren. */
  const { jalurKoridor, garisKoridorAtas, garisKoridorBawah } = useMemo(() => {
    if (!koridor) return { jalurKoridor: '', garisKoridorAtas: '', garisKoridorBawah: '' };

    const pasangan = titik
      .map((t, i) => ({ i, k: koridor.titik.find((k) => k.tanggal === t.tanggal) }))
      .filter((p): p is { i: number; k: NonNullable<typeof p.k> } => p.k !== undefined);

    if (pasangan.length < 2) {
      return { jalurKoridor: '', garisKoridorAtas: '', garisKoridorBawah: '' };
    }

    const atas = pasangan.map(({ i, k }, n) => `${n === 0 ? 'M' : 'L'}${x(i)} ${y(k.atasKg)}`).join(' ');
    const bawah = pasangan.map(({ i, k }, n) => `${n === 0 ? 'M' : 'L'}${x(i)} ${y(k.bawahKg)}`).join(' ');
    const bawahBalik = [...pasangan]
      .reverse()
      .map(({ i, k }) => `L${x(i)} ${y(k.bawahKg)}`)
      .join(' ');

    return {
      jalurKoridor: `${atas} ${bawahBalik} Z`,
      garisKoridorAtas: atas,
      garisKoridorBawah: bawah,
    };
  }, [koridor, titik, lebar, min, maks]);

  function pilihDariSentuhan(px: number) {
    const { lebarPlot: lp, jumlah } = terkini.current;
    // Lebar belum terukur (onLayout belum jalan): abaikan, jangan menebak.
    if (jumlah === 0 || lp <= 1) return;
    const r = (px - PAD_KIRI) / lp;
    const i = Math.round(r * (jumlah - 1));
    setAktif(Math.min(Math.max(i, 0), jumlah - 1));
  }

  const terakhirBerisi = [...titik].reverse().find((t) => t.rataRataKg !== null);
  const indeksTerakhir = terakhirBerisi ? titik.indexOf(terakhirBerisi) : -1;
  const sorot = aktif !== null ? titik[aktif] : null;

  if (!punyaData) {
    return (
      <View style={{ height: TINGGI_PLOT, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...typography.body, color: colors.teksSamar }}>
          Belum ada timbangan untuk digambar.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {/* Baris pemeriksa: isinya berubah saat grafik disentuh */}
      <View style={{ minHeight: 36, justifyContent: 'center' }}>
        {sorot ? (
          <View style={{ gap: spacing.xxs }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>
              {formatTanggalPanjang(sorot.tanggal)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: ukuran.celahTitik }}>
                <View style={{ width: 10, height: 2, backgroundColor: colors.aksen.isian }} />
                <Text style={{ ...typography.label, color: colors.teks }}>
                  {sorot.rataRataKg !== null ? `${formatDesimal(sorot.rataRataKg)} kg` : '—'}
                </Text>
              </View>
              <Text style={{ ...typography.caption, color: colors.teksSamar }}>
                harian{' '}
                {sorot.beratHarianKg !== null
                  ? `${formatDesimal(sorot.beratHarianKg)} kg`
                  : 'tidak ditimbang'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>
            Sentuh dan geser grafik untuk melihat angka per hari.
          </Text>
        )}
      </View>

      <View
        onLayout={(e) => setLebar(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
        accessibilityLabel="Grafik rata-rata berat 7 hari"
      >
        {lebar > 0 ? (
          <Svg width={lebar} height={TINGGI_PLOT + PAD_ATAS + PAD_BAWAH}>
            {/*
              Pita koridor target — digambar paling belakang supaya menjadi
              LATAR, bukan seri yang bersaing dengan garis rata-rata.
            */}
            {jalurKoridor ? (
              <>
                <Path d={jalurKoridor} fill={colors.status.sukses.isian} fillOpacity={0.14} />
                <Path
                  d={garisKoridorAtas}
                  stroke={colors.status.sukses.teks}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  fill="none"
                />
                <Path
                  d={garisKoridorBawah}
                  stroke={colors.status.sukses.teks}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  fill="none"
                />
              </>
            ) : null}

            {/* Garis bantu: hairline solid, sengaja redup */}
            {tick.map((v) => (
              <Line
                key={v}
                x1={PAD_KIRI}
                x2={lebar - PAD_KANAN}
                y1={y(v)}
                y2={y(v)}
                stroke={colors.garis}
                strokeWidth={1}
              />
            ))}

            {/*
              Wash di bawah garis hanya digambar kalau TIDAK ada koridor.
              Dua wash bertumpuk (amber di atas jade) menghasilkan noda yang
              menutupi pita koridor, padahal pita itu yang lebih bermakna.
            */}
            {jalurArea && !koridor ? (
              <Path d={jalurArea} fill={colors.aksen.isian} fillOpacity={0.1} />
            ) : null}

            {/*
              Titik berat harian — konteks, bukan cerita utama.
              Cincin warna permukaan menjaganya tetap terbaca di tempat ia
              memotong garis rata-rata; tanpa cincin, titik dan garis melebur
              jadi noda. Isiannya dibuat samar supaya tidak menyaingi garis.
            */}
            {tampilkanHarian
              ? titik.map((t, i) =>
                  t.beratHarianKg !== null ? (
                    <Circle
                      key={`h-${t.tanggal}`}
                      cx={x(i)}
                      cy={y(t.beratHarianKg)}
                      r={3}
                      fill={colors.teksSamar}
                      fillOpacity={aktif === i ? 1 : 0.55}
                      stroke={colors.permukaan}
                      strokeWidth={1.5}
                    />
                  ) : null,
                )
              : null}

            {/* Garis rata-rata: 2px, ujung & sambungan membulat */}
            <Path
              d={jalur}
              stroke={colors.aksen.isian}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Penanda ujung: r >= 4 dengan cincin warna permukaan */}
            {indeksTerakhir >= 0 && terakhirBerisi?.rataRataKg != null ? (
              <Circle
                cx={x(indeksTerakhir)}
                cy={y(terakhirBerisi.rataRataKg)}
                r={4}
                fill={colors.aksen.isian}
                stroke={colors.permukaan}
                strokeWidth={2}
              />
            ) : null}

            {/* Crosshair saat disentuh */}
            {aktif !== null ? (
              <>
                <Line
                  x1={x(aktif)}
                  x2={x(aktif)}
                  y1={PAD_ATAS}
                  y2={PAD_ATAS + TINGGI_PLOT}
                  stroke={colors.teksSamar}
                  strokeWidth={1}
                />
                {titik[aktif].rataRataKg !== null ? (
                  <Circle
                    cx={x(aktif)}
                    cy={y(titik[aktif].rataRataKg as number)}
                    r={4}
                    fill={colors.aksen.isian}
                    stroke={colors.permukaan}
                    strokeWidth={2}
                  />
                ) : null}
                {tampilkanHarian && titik[aktif].beratHarianKg !== null ? (
                  <Circle
                    cx={x(aktif)}
                    cy={y(titik[aktif].beratHarianKg as number)}
                    r={4}
                    fill={colors.teks}
                    stroke={colors.permukaan}
                    strokeWidth={2}
                  />
                ) : null}
              </>
            ) : null}

            {/* Area sentuh dibuat penuh supaya mudah dikenai jempol */}
            <Rect
              x={0}
              y={0}
              width={lebar}
              height={TINGGI_PLOT + PAD_ATAS + PAD_BAWAH}
              fill="transparent"
            />
          </Svg>
        ) : null}

        {/* Label sumbu Y — teks memakai token teks, bukan warna data */}
        {lebar > 0
          ? tick.map((v) => (
              <Text
                key={`ty-${v}`}
                style={{
                  ...typography.caption,
                  color: colors.teksSamar,
                  position: 'absolute',
                  left: 0,
                  top: y(v) - 7,
                  width: PAD_KIRI - 6,
                  textAlign: 'right',
                }}
              >
                {formatDesimal(v)}
              </Text>
            ))
          : null}
      </View>

      {/* Label sumbu X hanya di kedua ujung — selektif, bukan di tiap titik */}
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xs }}
      >
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          {tanggalSingkat(titik[0]?.tanggal)}
        </Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          {tanggalSingkat(titik[titik.length - 1]?.tanggal)}
        </Text>
      </View>

      {/* Keterangan mark: identitas lewat BENTUK, bukan warna saja */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: spacing.lg,
          rowGap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: ukuran.celahTitik }}>
          <View
            style={{ width: 12, height: 2, backgroundColor: colors.aksen.isian, borderRadius: radius.pill }}
          />
          <Text style={{ ...typography.caption, color: colors.teksSamar }}>rata-rata 7 hari</Text>
        </View>
        {koridor ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ukuran.celahTitik }}>
            <View
              style={{
                width: 12,
                height: 8,
                borderRadius: 2,
                backgroundColor: colors.status.sukses.isian + '33',
                borderWidth: 1,
                borderColor: colors.status.sukses.teks + '88',
              }}
            />
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>koridor target</Text>
          </View>
        ) : null}

        {/* Keterangan sekaligus sakelar: titik harian bisa disembunyikan bila ramai. */}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: tampilkanHarian }}
          accessibilityLabel={
            tampilkanHarian ? 'Sembunyikan timbangan harian' : 'Tampilkan timbangan harian'
          }
          disabled={!onUbahTampilkanHarian}
          onPress={() => onUbahTampilkanHarian?.(!tampilkanHarian)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: ukuran.celahTitik,
            // Hanya sakelar ini yang interaktif, jadi hanya ia yang butuh 44pt.
            minHeight: TAP_MIN,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: tampilkanHarian ? colors.teksSamar : 'transparent',
              borderWidth: 1,
              borderColor: colors.teksSamar,
            }}
          />
          <Text
            style={{
              ...typography.caption,
              color: colors.teksSamar,
              textDecorationLine: tampilkanHarian ? 'none' : 'line-through',
            }}
          >
            timbangan harian
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "22 Sep" — cukup untuk ujung sumbu tanpa memakan lebar. */
function tanggalSingkat(tanggal?: string): string {
  if (!tanggal) return '';
  const [, sisa] = formatTanggalPanjang(tanggal).split(', ');
  const [hari, bulan] = (sisa ?? '').split(' ');
  return `${hari} ${bulan?.slice(0, 3) ?? ''}`;
}
