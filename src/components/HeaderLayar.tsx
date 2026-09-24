import { Text, View } from 'react-native';
import { useKembali } from '@/lib/kembali';
import { colors, spacing, typography } from '@/theme';
import { TombolIkon } from './Tombol';

type Props = {
  /** Judul layar; diawali label tab untuk layar tab (dijaga `cek:desain`). */
  judul: string;
  /** Satu baris konteks di bawah judul: tanggal, sumber, jumlah. */
  subjudul?: string;
  /**
   * Tombol kembali di kiri. `true` memakai `router.back()`; fungsi dipakai bila
   * kembali perlu konfirmasi dulu (mis. ada isian yang belum disimpan).
   * Layar tab tidak punya tombol kembali.
   */
  kembali?: boolean | (() => void);
  /**
   * `kembali` (bawaan) untuk layar dorong: `‹`. `tutup` untuk layar modal
   * (membuat/mengubah): `✕`, karena layarnya naik dari bawah, bukan dari kanan.
   */
  jenisKembali?: 'kembali' | 'tutup';
  /** Satu aksi di kanan: `Pill` fase, `Tombol ukuran="kecil"`, atau `TombolIkon`. */
  aksi?: React.ReactNode;
  /** Isi tambahan di bawah subjudul, mis. `IndikatorSinkron` di Hari Ini. */
  bawah?: React.ReactNode;
};

/**
 * Kepala layar seragam (docs/desain/peta-navigasi.md §6), menggantikan header
 * bawaan navigator yang sengaja dimatikan.
 *
 * Susunannya tetap: [kembali] judul/subjudul [aksi]. Judul selalu `title` dan
 * membawa peran header aksesibilitas, jadi VoiceOver bisa melompat ke sana di
 * setiap layar. Jarak di bawahnya diatur kerangka layar (`gap: xl`), bukan di sini.
 */
export function HeaderLayar({ judul, subjudul, kembali, jenisKembali = 'kembali', aksi, bawah }: Props) {
  const kembaliSatuLangkah = useKembali();
  return (
    <View style={{ flexDirection: 'row', alignItems: kembali ? 'center' : 'flex-start', gap: spacing.md }}>
      {kembali ? (
        <TombolIkon
          ikon={jenisKembali === 'tutup' ? 'close' : 'chevron-back'}
          aksesLabel={jenisKembali === 'tutup' ? 'Tutup' : 'Kembali'}
          onPress={typeof kembali === 'function' ? kembali : kembaliSatuLangkah}
        />
      ) : null}
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text accessibilityRole="header" style={{ ...typography.title, color: colors.teks }}>
          {judul}
        </Text>
        {subjudul ? (
          <Text numberOfLines={1} style={{ ...typography.label, color: colors.teksSamar }}>
            {subjudul}
          </Text>
        ) : null}
        {bawah ? <View style={{ marginTop: spacing.sm }}>{bawah}</View> : null}
      </View>
      {aksi ? <View style={{ alignSelf: kembali ? 'center' : 'flex-start' }}>{aksi}</View> : null}
    </View>
  );
}
