import { Children, Fragment, isValidElement } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { bayangan, colors, radius, spacing, tint } from '@/theme';

/**
 * Tanda pada kartu yang perlu dilihat lebih dulu. Tepinya diberi tint warna
 * peran; maknanya tetap harus ditulis di isi kartu (judul/label), tidak pernah
 * warna saja.
 */
export type NadaKartu = 'aksen' | 'sukses' | 'peringatan' | 'bahaya';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `flat` menghilangkan padding dalam untuk kartu yang mengatur isinya sendiri. */
  flat?: boolean;
  nada?: NadaKartu;
};

function warnaNada(nada: NadaKartu): string {
  return nada === 'aksen' ? colors.aksen.isian : colors.status[nada].isian;
}

/** Permukaan kartu standar: permukaan + tepi halus + radius lg + bayangan kartu. */
export function Card({ children, style, flat = false, nada }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.permukaan,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: nada ? tint(warnaNada(nada), 'tepi') : colors.garis,
          padding: flat ? 0 : spacing.lg,
          ...bayangan.kartu,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Garis pemisah dekoratif (`colors.garis`, sengaja resesif). `horizontal`
 * menjorok `spacing.lg` di kedua sisi supaya sejajar dengan isi baris kartu;
 * `penuh` untuk pemisah selebar kontainer; `vertikal` di antara kolom statistik.
 */
export function Pemisah({ arah = 'horizontal' }: { arah?: 'horizontal' | 'penuh' | 'vertikal' }) {
  if (arah === 'vertikal') {
    return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.garis }} />;
  }
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.garis,
        marginHorizontal: arah === 'penuh' ? 0 : spacing.lg,
      }}
    />
  );
}

/**
 * Daftar baris di dalam satu kartu (Pengaturan, Privasi, Widget & pengingat):
 * kartu tanpa padding, `Pemisah` otomatis di antara setiap anak. Anak yang
 * `null`/`false` dilewati, jadi baris bersyarat tidak meninggalkan garis ganda.
 */
export function DaftarBaris({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const baris = Children.toArray(children).filter(isValidElement);
  return (
    <Card flat style={style}>
      {baris.map((anak, i) => (
        <Fragment key={anak.key ?? i}>
          {i > 0 ? <Pemisah /> : null}
          {anak}
        </Fragment>
      ))}
    </Card>
  );
}

/**
 * Area cekung di DALAM kartu: rincian angka, kotak "Angka yang dipakai",
 * ringkasan kecil. Satu tingkat di bawah permukaan kartu, radius `md`
 * (lebih kecil dari radius kartu supaya sudutnya sejajar).
 */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.permukaanCekung,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
