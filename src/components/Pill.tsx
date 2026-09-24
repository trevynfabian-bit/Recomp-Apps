import { Text, View } from 'react-native';
import { colors, radius, spacing, tint, typography, ukuran } from '@/theme';

type Props = {
  label: string;
  /** Warna teks & border; latar memakai versi transparan dari warna ini. */
  warna?: string;
  /**
   * Pill yang berdiri di atas kartu atau sheet (`surface`), bukan di atas latar
   * layar. Tint 10% mencerahkan `surface` cukup untuk menurunkan varian teks
   * jade/coral/karbo di bawah 4,5:1 (≈3,9:1), jadi di sana pill cukup bertepi
   * tanpa isian. Di atas `bg` tint aman (≈5,3:1). Dijaga `cek:kontras`.
   */
  diKartu?: boolean;
  /** Posisi di wadah berkolom; bawaan `awal`. */
  sejajar?: 'awal' | 'tengah';
};

/** Badge kecil untuk fase program, tipe hari, atau penanda "estimasi". */
export function Pill({ label, warna = colors.teksRedup, diKartu = false, sejajar = 'awal' }: Props) {
  return (
    <View
      style={{
        alignSelf: sejajar === 'tengah' ? 'center' : 'flex-start',
        paddingHorizontal: spacing.md,
        paddingVertical: ukuran.chip.vertikal,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: tint(warna, 'tepi'),
        backgroundColor: diKartu ? 'transparent' : tint(warna, 'pill'),
      }}
    >
      <Text style={{ ...typography.caption, color: warna }}>{label}</Text>
    </View>
  );
}
