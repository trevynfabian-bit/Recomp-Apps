import { supabase } from '@/lib/supabase';
import type { ArahGerakan } from '@recomp/logika';
import type { E1rmGerakanRow, E1rmPerGerakanRow } from '@/types/database';

/**
 * e1RM per gerakan dari server (`e1rm_per_gerakan`).
 *
 * Aturannya sama dengan `arahKekuatan` di @recomp/logika (dijaga
 * `npm run cek:paritas`), jadi layar Latihan bisa memakai jawaban server
 * tanpa memuat seluruh set lalu menghitung sendiri. Bentuknya dikembalikan ke
 * `ArahGerakan` supaya komponen yang sama bisa menampilkannya.
 */

export class KesalahanLatihan extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanLatihan';
  }
}

export type E1rmPerGerakan = {
  periodeDari: string;
  periodeSampai: string;
  /** Gerakan dengan minimal dua titik, dalam bentuk yang sama dengan `arahKekuatan`. */
  gerakan: ArahGerakan[];
  /** Gerakan yang baru muncul sekali dalam rentang ini: titiknya ada, arahnya belum. */
  satuTitik: { latihan: string; e1rmKg: number; tanggal: string }[];
  naik: number;
  turun: number;
  datar: number;
  /** Titik e1RM per gerakan (untuk grafik), urut waktu. */
  deret: Record<string, { tanggal: string; e1rmKg: number }[]>;
};

/** e1RM per gerakan untuk rentang `dari`–`sampai` (paling panjang 400 hari). */
export async function e1rmPerGerakan(dari: string, sampai: string): Promise<E1rmPerGerakan> {
  const { data, error } = await supabase.rpc('e1rm_per_gerakan', { p_dari: dari, p_sampai: sampai });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanLatihan('Kekuatan per gerakan belum bisa dimuat. Coba lagi sebentar lagi.', true);

  const j = data as E1rmPerGerakanRow;
  const berarah = j.gerakan.filter((g): g is E1rmGerakanRow & { arah: ArahGerakan['arah'] } => g.arah !== null);
  return {
    periodeDari: j.periode_dari,
    periodeSampai: j.periode_sampai,
    gerakan: berarah.map((g) => ({
      latihan: g.latihan,
      awalKg: Number(g.awal_kg),
      akhirKg: Number(g.akhir_kg),
      selisihKg: Number(g.selisih_kg),
      arah: g.arah,
      jumlahSesi: g.jumlah_sesi,
    })),
    satuTitik: j.gerakan
      .filter((g) => g.arah === null)
      .map((g) => ({ latihan: g.latihan, e1rmKg: Number(g.akhir_kg), tanggal: g.titik[0]?.tanggal ?? j.periode_dari })),
    naik: j.naik,
    turun: j.turun,
    datar: j.datar,
    deret: Object.fromEntries(
      j.gerakan.map((g) => [g.latihan, g.titik.map((t) => ({ tanggal: t.tanggal, e1rmKg: Number(t.e1rm_kg) }))]),
    ),
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanLatihan {
  if (/fetch|network|jaringan/i.test(error.message)) {
    return new KesalahanLatihan('Kekuatan per gerakan belum bisa dimuat. Periksa koneksi, lalu coba lagi.', true);
  }
  switch (error.code) {
    case '22004': // null_value_not_allowed
      return new KesalahanLatihan('Rentang tanggal tidak boleh kosong.', false);
    case '22007': // invalid_datetime_format — rentang terbalik
      return new KesalahanLatihan('Tanggal awal melewati tanggal akhir. Tukar urutannya.', false);
    case '22003': // numeric_value_out_of_range — rentang terlalu panjang
      return new KesalahanLatihan(
        'Rentangnya lebih panjang dari yang bisa ditampilkan. Pilih periode yang lebih pendek.',
        false,
      );
    case '28000':
    case 'PGRST301':
      return new KesalahanLatihan('Sesi Anda berakhir. Masuk lagi untuk melihat latihan.', false);
    default:
      return new KesalahanLatihan('Kekuatan per gerakan belum bisa dimuat. Coba lagi sebentar lagi.', true);
  }
}
