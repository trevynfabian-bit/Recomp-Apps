import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import {
  colors,
  KONTROL_RAPAT,
  radius,
  sisaSentuh,
  spacing,
  TAP_MIN,
  typography,
  ukuranIkon,
} from '@/theme';

/**
 * Varian tombol (bab Desain 8.6):
 * - `utama`: isian aksen, satu per kartu/sheet — aksi yang paling mungkin dipilih.
 * - `bertepi`: aksi kedua (batal, coba lagi) yang tidak boleh bersaing dengan utama.
 * - `merusak`: isian bahaya untuk menghapus/memutuskan; labelnya selalu menyebut
 *   tindakannya, tidak pernah warna saja.
 * - `teks`: tautan aksi di dalam kartu ("Ubah", "Lihat 4 nilai"), tanpa isian.
 */
export type VarianTombol = 'utama' | 'bertepi' | 'merusak' | 'teks';

/**
 * `normal` setinggi `TAP_MIN` (44 pt) dan melebar penuh; `kecil` tampil
 * `KONTROL_RAPAT` (36 pt) selebar isinya, dengan area sentuh tetap 44 pt.
 */
export type UkuranTombol = 'normal' | 'kecil';

type Props = {
  label: string;
  onPress: () => void;
  varian?: VarianTombol;
  ukuran?: UkuranTombol;
  /** Label untuk pembaca layar bila berbeda dari teks tombolnya. */
  aksesLabel?: string;
  /** Petunjuk pembaca layar: apa yang terjadi setelah ditekan. */
  aksesPetunjuk?: string;
  nonaktif?: boolean;
  /**
   * Sedang memproses: spinner di depan label (pemanggil boleh mengganti label,
   * mis. "Menyimpan…"). Tombol tidak bisa ditekan selama itu.
   */
  memproses?: boolean;
  /**
   * Aksi baru saja berhasil (mis. "Tersimpan"): isian sukses + centang, tidak
   * bisa ditekan lagi sampai pemanggil mengembalikannya — mencegah simpan ganda.
   */
  berhasil?: boolean;
  /** Ikon di depan label. */
  ikon?: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Nada warna varian `teks`: `aksen` (bawaan) untuk aksi yang dianjurkan,
   * `netral` untuk batal/tutup/nanti, `bahaya` untuk hapus/putuskan.
   */
  nada?: 'aksen' | 'netral' | 'bahaya';
  /** Posisi tombol selebar isi (`kecil`/`teks`) di dalam kontainernya. */
  sejajar?: 'awal' | 'tengah';
};

/** Warna isian, tepi, dan label per varian & keadaan. Dibaca saat render (ikut skema). */
function gaya(varian: VarianTombol, berhasil: boolean, nada: NonNullable<Props['nada']>) {
  if (berhasil) return { isian: colors.status.sukses.isian, tepi: 'transparent', label: colors.diAtasIsian };
  switch (varian) {
    case 'utama':
      return { isian: colors.aksen.isian, tepi: 'transparent', label: colors.diAtasIsian };
    case 'merusak':
      return { isian: colors.status.bahaya.isian, tepi: 'transparent', label: colors.diAtasIsian };
    case 'bertepi':
      return { isian: 'transparent', tepi: colors.garisKontrol, label: colors.teks };
    case 'teks':
      return {
        isian: 'transparent',
        tepi: 'transparent',
        label: nada === 'bahaya' ? colors.status.bahaya.teks : nada === 'netral' ? colors.teksRedup : colors.aksen.teks,
      };
  }
}

/** Tombol seragam untuk seluruh app. Lihat `VarianTombol` dan `UkuranTombol`. */
export function Tombol({
  label,
  onPress,
  varian = 'utama',
  ukuran = 'normal',
  aksesLabel,
  aksesPetunjuk,
  nonaktif = false,
  memproses = false,
  berhasil = false,
  ikon,
  nada = 'aksen',
  sejajar = 'awal',
}: Props) {
  const mati = nonaktif || memproses || berhasil;
  const kecil = ukuran === 'kecil';
  const g = gaya(varian, berhasil, nada);
  const teksGaya = kecil
    ? typography.label
    : varian === 'utama' || varian === 'merusak' || berhasil
      ? typography.bodyTebal
      : typography.bodySedang;
  // Tautan teks tidak punya kotak yang terlihat, jadi selalu setinggi TAP_MIN:
  // area sentuhnya penuh tanpa hitSlop dan garis dasarnya sejajar dengan baris 44 pt.
  const tinggi = kecil && varian !== 'teks' ? KONTROL_RAPAT : TAP_MIN;
  const ikonTampil = berhasil ? 'checkmark' : ikon;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel ?? label}
      accessibilityHint={aksesPetunjuk}
      accessibilityState={{ disabled: mati, busy: memproses }}
      disabled={mati}
      hitSlop={tinggi < TAP_MIN ? sisaSentuh(tinggi) : undefined}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: tinggi,
        alignSelf: kecil || varian === 'teks' ? (sejajar === 'tengah' ? 'center' : 'flex-start') : 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingHorizontal: varian === 'teks' ? 0 : kecil ? spacing.md : spacing.lg,
        borderRadius: kecil ? radius.pill : radius.md,
        backgroundColor: g.isian,
        borderWidth: g.tepi === 'transparent' ? 0 : 1,
        borderColor: g.tepi,
        opacity: nonaktif ? 0.45 : pressed ? (g.isian === 'transparent' ? 0.6 : 0.8) : 1,
      })}
    >
      {memproses ? (
        <ActivityIndicator size="small" color={g.label} />
      ) : ikonTampil ? (
        <Ionicons name={ikonTampil} size={kecil ? ukuranIkon.mini : ukuranIkon.kecil} color={g.label} />
      ) : null}
      <Text style={{ ...teksGaya, color: g.label }}>{label}</Text>
    </Pressable>
  );
}

type PropsIkon = {
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  /** Wajib: tombol ikon tidak punya teks yang bisa dibacakan. */
  aksesLabel: string;
  onPress: () => void;
  /**
   * `bulat`: lingkaran 44 pt bertepi di atas permukaan (kembali, −/+).
   * `polos`: ikon 36 pt tanpa latar (tutup sheet, hapus baris), area sentuh 44 pt.
   */
  bentuk?: 'bulat' | 'polos';
  nonaktif?: boolean;
  warna?: string;
};

/** Tombol berisi ikon saja. Selalu dengan `aksesLabel`. */
export function TombolIkon({ ikon, aksesLabel, onPress, bentuk = 'bulat', nonaktif = false, warna }: PropsIkon) {
  const bulat = bentuk === 'bulat';
  const ukuran = bulat ? TAP_MIN : KONTROL_RAPAT;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aksesLabel}
      accessibilityState={{ disabled: nonaktif }}
      disabled={nonaktif}
      hitSlop={bulat ? undefined : sisaSentuh(KONTROL_RAPAT)}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        width: ukuran,
        height: ukuran,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bulat ? colors.permukaan : 'transparent',
        borderWidth: bulat ? 1 : 0,
        borderColor: colors.garisKontrol,
        opacity: nonaktif ? 0.45 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={ikon} size={bulat ? ukuranIkon.baris : ukuranIkon.sedang} color={warna ?? (bulat ? colors.teks : colors.teksRedup)} />
    </Pressable>
  );
}
