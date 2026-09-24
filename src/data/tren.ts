import { supabase } from '@/lib/supabase';
import type {
  Fase,
  KecukupanTren,
  RataRata7Hari,
  SinyalArah,
  StatusKoridor,
  TitikKoridor,
  TitikTren,
} from '@recomp/logika';
import type { DeretRataRataRow, TrenSnapshotRow } from '@/types/database';

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
      return new KesalahanTren('Tanggal awal melewati tanggal akhir. Tukar urutannya.', false);
    case '22003': // numeric_value_out_of_range — dipakai untuk rentang terlalu panjang
      return new KesalahanTren('Rentangnya lebih panjang dari yang bisa ditampilkan. Pilih periode yang lebih pendek.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanTren('Sesi Anda berakhir. Masuk lagi untuk melihat tren.', false);
    default:
      return new KesalahanTren('Tren belum bisa dimuat. Periksa koneksi, lalu coba lagi.', true);
  }
}

/** Bentuk siap pakai layar Tren, sudah diterjemahkan dari JSON SQL. */
export type SnapshotTren = {
  dari: string;
  sampai: string;
  deret: TitikTren[];
  rataRata: RataRata7Hari;
  sepekanLalu: RataRata7Hari;
  arah: SinyalArah;
  kecukupan: KecukupanTren;
  /** `null` bila pengguna belum pernah menimbang sama sekali. */
  jangkarFase: { fase: Fase; tanggalMulai: string; beratAwalKg: number } | null;
  /**
   * Titik koridor sepanjang rentang yang digambar — dihitung SERVER, bukan
   * klien. Widget lock screen dan AI coach memakai batas yang sama, dan
   * keduanya tidak bisa menjalankan TypeScript.
   */
  koridor: TitikKoridor[];
  statusKoridor: StatusKoridor;
};

/**
 * Satu snapshot untuk seluruh layar Tren.
 *
 * Dipanggil SEKALI, bukan lima kali. Alasannya bukan cuma kecepatan:
 * timbangan pagi yang masuk di antara dua panggilan menghasilkan layar yang
 * angkanya tidak cocok satu sama lain — deret mengatakan satu hal, ringkasan
 * di atasnya mengatakan hal lain — dan ketidakcocokan seperti itu tidak akan
 * pernah bisa direproduksi saat dilaporkan.
 */
export async function snapshotTren(sampai: string, hari = 14): Promise<SnapshotTren> {
  const { data, error } = await supabase.rpc('tren_berat_7_hari', {
    p_sampai: sampai,
    p_hari: hari,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanTren('Tren belum bisa dimuat. Coba lagi sebentar lagi.', true);

  const j = data as TrenSnapshotRow;
  const angka = (n: number | null) => (n === null ? null : Number(n));

  return {
    dari: j.dari,
    sampai: j.sampai,
    deret: j.deret.map((b) => ({
      tanggal: b.tanggal,
      rataRataKg: angka(b.rata_rata_kg),
      beratHarianKg: angka(b.berat_harian_kg),
    })),
    rataRata: {
      tanggal: j.rata_rata.tanggal,
      rataRataKg: angka(j.rata_rata.rata_rata_kg),
      jumlahTimbangan: j.rata_rata.jumlah_timbangan,
    },
    sepekanLalu: {
      tanggal: j.sepekan_lalu.tanggal,
      rataRataKg: angka(j.sepekan_lalu.rata_rata_kg),
      jumlahTimbangan: j.sepekan_lalu.jumlah_timbangan,
    },
    arah: {
      arah: j.arah.arah,
      perubahanKg: angka(j.arah.perubahan_kg),
      ambangKg: Number(j.arah.ambang_kg),
    },
    kecukupan: {
      adaTimbangan: j.kecukupan.ada_timbangan,
      jumlahTotal: j.kecukupan.jumlah_total,
      jumlahDalamJendela: j.kecukupan.jumlah_dalam_jendela,
      cukupRataRata: j.kecukupan.cukup_rata_rata,
      jendelaPenuh: j.kecukupan.jendela_penuh,
      cukupArah: j.kecukupan.cukup_arah,
      hariLagiUntukArah: j.kecukupan.hari_lagi_untuk_arah,
    },
    jangkarFase: j.jangkar_fase
      ? {
          fase: j.jangkar_fase.fase,
          tanggalMulai: j.jangkar_fase.tanggal_mulai,
          beratAwalKg: Number(j.jangkar_fase.berat_awal_kg),
        }
      : null,
    koridor: j.koridor.map((k) => ({
      tanggal: k.tanggal,
      bawahKg: Number(k.bawah_kg),
      atasKg: Number(k.atas_kg),
    })),
    statusKoridor: {
      posisi: j.status_koridor.posisi,
      selisihKg: angka(j.status_koridor.selisih_kg),
      bawahKg: angka(j.status_koridor.bawah_kg),
      atasKg: angka(j.status_koridor.atas_kg),
    },
  };
}
