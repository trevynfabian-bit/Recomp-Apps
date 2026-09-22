import { supabase } from '@/lib/supabase';
import type { TitikTren } from '@recomp/logika';
import type { DeretRataRataRow } from '@/types/database';

/**
 * Akses data tren berat.
 *
 * Deret rata-rata bergerak dihitung di SERVER lewat `deret_rata_rata_7_hari`,
 * bukan di klien dari riwayat mentah. Dua alasan yang berbeda beratnya:
 *
 * 1. Satu round-trip untuk seluruh grafik, bukan satu per titik. Di jaringan
 *    seluler itu perbedaan antara grafik yang muncul seketika dan grafik yang
 *    mengisi dirinya sepotong-sepotong.
 * 2. Angka yang sama dipakai widget lock screen, yang tidak bisa menjalankan
 *    TypeScript sama sekali. Kalau rata-ratanya hanya hidup di klien, widget
 *    akan menampilkan angka yang dihitung dengan aturan lain — dan perbedaan
 *    satu desimal antara app dan widget adalah jenis bug yang tidak pernah
 *    dilaporkan, hanya membuat orang berhenti percaya.
 *
 * `@recomp/logika` tetap memegang aturan yang sama untuk dipakai web dashboard,
 * dan kesamaannya dijaga mesin lewat `npm run cek:paritas`.
 */

/** Kesalahan yang sudah diterjemahkan ke kalimat yang layak ditampilkan. */
export class KesalahanTren extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanTren';
  }
}

/**
 * Deret rata-rata bergerak 7 hari untuk sebuah rentang tanggal.
 *
 * Jendela titik PERTAMA tetap menjangkau enam hari sebelum `dari` — itu
 * ditangani di SQL, jadi pemanggil tidak perlu meminta rentang yang
 * dilebih-lebihkan lalu memotongnya sendiri.
 */
export async function deretTrenBerat(dari: string, sampai: string): Promise<TitikTren[]> {
  const { data, error } = await supabase.rpc('deret_rata_rata_7_hari', {
    p_dari: dari,
    p_sampai: sampai,
  });

  if (error) throw terjemahkan(error);

  return ((data ?? []) as DeretRataRataRow[]).map((b) => ({
    tanggal: b.tanggal,
    rataRataKg: b.rata_rata_kg === null ? null : Number(b.rata_rata_kg),
    beratHarianKg: b.berat_harian_kg === null ? null : Number(b.berat_harian_kg),
  }));
}

/**
 * Rata-rata 7 hari untuk SATU tanggal, beserta jumlah timbangan di jendelanya.
 *
 * `jumlahTimbangan` ikut dikembalikan karena UI harus bisa jujur soal seberapa
 * tipis dasarnya: rata-rata dari satu timbangan dan dari tujuh timbangan tampak
 * sama persis di layar kalau angkanya saja yang ditampilkan.
 */
export async function rataRataBerat7Hari(
  tanggal: string,
): Promise<{ tanggal: string; rataRataKg: number | null; jumlahTimbangan: number }> {
  const { data, error } = await supabase.rpc('rata_rata_berat_7_hari', {
    p_tanggal: tanggal,
  });

  if (error) throw terjemahkan(error);

  const baris = ((data ?? []) as DeretRataRataRow[])[0];
  return {
    tanggal,
    rataRataKg: baris?.rata_rata_kg == null ? null : Number(baris.rata_rata_kg),
    jumlahTimbangan: baris?.jumlah_timbangan ?? 0,
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanTren {
  switch (error.code) {
    case '22004': // null_value_not_allowed
      return new KesalahanTren('Rentang tanggal tidak boleh kosong.', false);
    case '22007': // invalid_datetime_format — dipakai untuk rentang terbalik
      return new KesalahanTren('Tanggal awal melewati tanggal akhir.', false);
    case '22003': // numeric_value_out_of_range — dipakai untuk rentang terlalu panjang
      return new KesalahanTren('Rentang terlalu panjang. Pilih periode yang lebih pendek.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanTren('Sesi Anda berakhir. Masuk lagi untuk melihat tren.', false);
    default:
      return new KesalahanTren('Gagal memuat tren. Periksa koneksi lalu coba lagi.', true);
  }
}
