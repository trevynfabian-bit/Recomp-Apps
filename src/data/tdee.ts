import { supabase } from '@/lib/supabase';
import { bandingkanTargetTdee, estimasiTdee } from '@recomp/logika';
import type { Fase, HasilTdee, InputTdee } from '@recomp/logika';
import type { EstimasiTdeeRow } from '@/types/database';

/**
 * Akses data estimasi TDEE.
 *
 * Pembagian tugasnya sengaja tidak simetris dengan service lain, dan alasannya
 * layak ditulis: server MENGUMPULKAN masukannya dari data (rata-rata 7 hari,
 * asupan, tipe hari yang dijalani, profil) dan menghitung angkanya — widget
 * lock screen dan AI coach membaca TDEE tanpa bisa menjalankan TypeScript.
 * Tapi KALIMAT penjelasnya — `dasar` tiap metode dan `alasanKeyakinan` — disusun
 * di sini oleh `estimasiTdee` dari masukan yang sama, karena kalimat itu memuat
 * angka berformat Indonesia dan dua penyusun kalimat pasti berbeda tanda
 * bacanya.
 *
 * Yang dikembalikan service ini adalah hasil TypeScript, bukan hasil SQL. Itu
 * bukan berarti angka server diabaikan: `npm run cek:paritas` membuktikan
 * keduanya identik pada masukan yang sama, dan `nilaiServer` di bawah membawa
 * angka server apa adanya untuk dibandingkan bila perlu.
 */

export class KesalahanTdee extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanTdee';
  }
}

export type SnapshotTdee = HasilTdee & {
  dari: string;
  sampai: string;
  /** Masukan yang DIPAKAI, supaya angkanya bisa ditelusuri, bukan dipercaya. */
  masukan: InputTdee;
  /** Berapa hari dalam periode yang benar-benar punya catatan asupan. */
  hariTercatat: number;
  pengaliAktivitas: number;
  /** Angka yang dihitung server; dipakai widget & AI coach. */
  nilaiServer: { min: number | null; maks: number | null; tengah: number | null };
};

/**
 * Estimasi TDEE untuk periode yang berakhir di `sampai`.
 *
 * @param sampai hari terakhir periode; `null` berarti hari ini menurut
 *   Asia/Jakarta, dihitung SERVER supaya tidak bergantung jam perangkat.
 * @param hari panjang periode data, 7–180.
 * @param persenLemak persen lemak tubuh bila diketahui. Diminta di sini karena
 *   estimasi body fat belum punya tabel di server; tanpa nilainya
 *   Katch-McArdle DILEWATI, tidak ditebak.
 */
export async function snapshotTdee(
  sampai: string | null = null,
  hari = 14,
  persenLemak: number | null = null,
): Promise<SnapshotTdee> {
  const { data, error } = await supabase.rpc('estimasi_tdee', {
    p_sampai: sampai,
    p_hari: hari,
    p_persen_lemak: persenLemak,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanTdee('Server tidak mengembalikan estimasi TDEE.', true);

  const j = data as EstimasiTdeeRow;
  const angka = (n: number | null) => (n === null ? null : Number(n));

  const masukan: InputTdee = {
    // Tanpa timbangan sama sekali tidak ada rumus yang bisa jalan; nol dipakai
    // hanya supaya bentuknya utuh, dan `metode` memang akan kosong.
    beratKg: Number(j.masukan.berat_kg ?? 0),
    tinggiCm: angka(j.masukan.tinggi_cm),
    usiaTahun: j.masukan.usia_tahun,
    jenisKelamin: j.masukan.jenis_kelamin,
    persenLemak: angka(j.masukan.persen_lemak),
    tipeHariMinggu: j.masukan.tipe_hari_minggu ?? [],
    hariData: j.masukan.hari_data,
    rataAsupanKalori: angka(j.masukan.rata_asupan_kalori),
    perubahanBeratKg: angka(j.masukan.perubahan_berat_kg),
  };

  // Tanpa berat, tidak ada metode yang bisa dihitung — dan itu harus terlihat
  // sebagai "belum cukup data", bukan sebagai BMR dari berat nol.
  const hasil: HasilTdee =
    j.masukan.berat_kg === null
      ? {
          metode: [],
          min: null,
          maks: null,
          tengah: null,
          keyakinan: 'rendah',
          alasanKeyakinan: 'Belum ada timbangan pagi, jadi belum ada yang bisa dihitung.',
        }
      : estimasiTdee(masukan);

  return {
    ...hasil,
    dari: j.dari,
    sampai: j.sampai,
    masukan,
    hariTercatat: j.hari_tercatat,
    pengaliAktivitas: Number(j.pengali_aktivitas),
    nilaiServer: { min: j.min, maks: j.maks, tengah: j.tengah },
  };
}

/**
 * Bandingkan target harian dengan perkiraan TDEE, sesuai fase.
 *
 * Dibungkus di sini supaya layar tidak perlu tahu bahwa kalimatnya datang dari
 * paket bersama. Deskriptif, bukan resep — dan itu bagian dari aturan medis
 * yang sama yang dipegang `periksaBatasMedis`.
 */
export function bandingkanTarget(
  targetHarian: number,
  tdee: Pick<SnapshotTdee, 'tengah'>,
  fase: Fase,
): string | null {
  return bandingkanTargetTdee(targetHarian, tdee.tengah, fase);
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanTdee {
  switch (error.code) {
    case '22003': // numeric_value_out_of_range — periode di luar 7–180 hari
      return new KesalahanTdee('Periode data harus antara 7 dan 180 hari.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanTdee('Sesi Anda berakhir. Masuk lagi untuk melihat TDEE.', false);
    default:
      return new KesalahanTdee('Gagal memuat estimasi TDEE. Periksa koneksi lalu coba lagi.', true);
  }
}
