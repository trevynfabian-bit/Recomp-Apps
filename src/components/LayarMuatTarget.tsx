import { KeadaanGagal, KeadaanKosong, KeadaanMemuat } from './Keadaan';

type Props = {
  /** `null` selama memuat; berisi kalimat layak tampil bila gagal. */
  pesanGagal: string | null;
  onCobaLagi: () => void;
  onKeluar: () => void;
  /** Termuat, tapi akun belum punya tipe hari: data belum lengkap, bukan galat jaringan. */
  kosong?: boolean;
};

/**
 * Pengganti app selama tipe hari & target pertama kali dimuat.
 *
 * Hari Ini, Budget, dan widget semuanya berdiri di atas tipe hari dan
 * targetnya; tanpa keduanya tidak ada angka yang benar untuk ditampilkan.
 * Gagal memuat tidak menjebak: ada Coba lagi, dan Keluar tetap terjangkau.
 */
export function LayarMuatTarget({ pesanGagal, onCobaLagi, onKeluar, kosong = false }: Props) {
  if (kosong) {
    return (
      <KeadaanKosong
        tampilan="layar"
        ikon="calendar-outline"
        judul="Tipe hari belum tersedia"
        keterangan="Akun ini belum punya tipe hari (Rest, Angkat Beban, dan lainnya), jadi target harian belum bisa dihitung. Biasanya dibuat otomatis saat akun dibuat; muat ulang untuk mencobanya lagi."
        aksi={{ label: 'Muat ulang', onPress: onCobaLagi }}
        aksiKedua={{ label: 'Keluar', onPress: onKeluar }}
      />
    );
  }
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
