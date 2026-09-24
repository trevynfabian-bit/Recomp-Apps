import { Fragment } from 'react';
import { Text, View } from 'react-native';
import { angkaTabular, colors, spacing, typography } from '@/theme';
import { Card, Pemisah } from './Card';
import { HeroNumber } from './HeroNumber';

type PropsStat = {
  /** Label kapital kecil di atas angka, mis. "Sisa protein". */
  label: string;
  /** Angka sudah diformat (lihat `formatSelisih` untuk selisih). */
  nilai: string;
  unit?: string;
  /** Warna angka; bawaan `teks`. Warna selalu didampingi label/tanda. */
  warna?: string;
  /** Nilai berupa kata (mis. nama tipe hari), bukan angka: ukuran isi. */
  kata?: boolean;
  /** Satuan di bawah angka (kolom sempit), bukan di sebelahnya. */
  unitDiBawah?: boolean;
};

/**
 * Angka SEKUNDER (bab Desain 2.5 tingkat 1): label kecil + angka `title`
 * tabular + satuan. Untuk angka pendukung di bawah angka hero; tidak pernah
 * menyaingi `HeroNumber`.
 */
export function AngkaStat({ label, nilai, unit, warna = colors.teks, kata = false, unitDiBawah = false }: PropsStat) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${nilai}${unit ? ` ${unit}` : ''}`}
      style={{ flex: 1, alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xxs }}
    >
      <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: unitDiBawah ? 'column' : 'row', alignItems: unitDiBawah ? 'center' : 'baseline', gap: unitDiBawah ? 0 : spacing.xxs }}>
        <Text style={{ ...(kata ? typography.body : typography.title), ...(kata ? null : angkaTabular), color: warna }}>
          {nilai}
        </Text>
        {unit ? <Text style={{ ...typography.caption, color: colors.teksSamar }}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Deret angka sekunder dengan pemisah vertikal di antaranya. */
export function DeretStat({ stat }: { stat: PropsStat[] }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {stat.map((s, i) => (
        <Fragment key={s.label}>
          {i > 0 ? <Pemisah arah="vertikal" /> : null}
          <AngkaStat {...s} />
        </Fragment>
      ))}
    </View>
  );
}

type PropsKartuHero = React.ComponentProps<typeof HeroNumber> & {
  /** Angka sekunder di bawah garis pemisah. */
  stat?: PropsStat[];
  /** Isi tambahan di bawah angka hero (mis. meter budget), sebelum deret stat. */
  children?: React.ReactNode;
  /**
   * Pengganti angka hero saat angkanya belum bisa dihitung (mis. target belum
   * diisi): kalimat + aksi di tempat yang sama, bukan angka palsu.
   */
  pengganti?: React.ReactNode;
};

/**
 * Kartu angka hero: SATU angka utama layar di kartu yang lega, lalu (opsional)
 * isi pendukung dan deret angka sekunder di bawah garis. Sama seperti
 * `HeroNumber`, paling banyak satu per layar (dijaga `cek:desain`).
 */
export function KartuHero({ stat, children, pengganti, ...hero }: PropsKartuHero) {
  return (
    <Card style={{ paddingVertical: spacing.xl, gap: spacing.xl }}>
      {pengganti ?? <HeroNumber {...hero} />}
      {children}
      {stat && stat.length > 0 ? (
        <View style={{ gap: spacing.lg }}>
          <Pemisah arah="penuh" />
          <DeretStat stat={stat} />
        </View>
      ) : null}
    </Card>
  );
}
