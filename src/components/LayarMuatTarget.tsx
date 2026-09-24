import { KeadaanGagal, KeadaanMemuat } from './Keadaan';

type Props = {
  /** `null` selama memuat; berisi kalimat layak tampil bila gagal. */
  pesanGagal: string | null;
  onCobaLagi: () => void;
  onKeluar: () => void;
};

/**
 * Pengganti app selama tipe hari & target pertama kali dimuat.
 *
 * Hari Ini, Budget, dan widget semuanya berdiri di atas tipe hari dan
 * targetnya; tanpa keduanya tidak ada angka yang benar untuk ditampilkan.
 * Gagal memuat tidak menjebak: ada Coba lagi, dan Keluar tetap terjangkau.
 */
export function LayarMuatTarget({ pesanGagal, onCobaLagi, onKeluar }: Props) {
  if (pesanGagal === null) return <KeadaanMemuat tampilan="layar" label="Memuat target harian…" />;
  return (
    <KeadaanGagal
      tampilan="layar"
      judul="Target harian belum termuat"
      keterangan={pesanGagal}
      aksi={{ label: 'Coba lagi', onPress: onCobaLagi }}
      aksiKedua={{ label: 'Keluar', onPress: onKeluar }}
    />
  );
}
