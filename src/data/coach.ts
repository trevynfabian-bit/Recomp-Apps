import { supabase } from '@/lib/supabase';
import { DISCLAIMER_COACH, periksaBatasMedis } from '@recomp/logika';
import type { PenolakanMedis } from '@recomp/logika';
import type { AngkaKonteksRow, KonteksCoachRow } from '@/types/database';

/**
 * Konteks data untuk AI Coach.
 *
 * PRD memberi coach tiga syarat yang tidak bisa dijamin lewat prompt: ia WAJIB
 * memakai rata-rata 7 hari, ia HARUS membedakan data mentah dari estimasi, dan
 * ia tidak memberi dosis obat. Prompt yang menuliskan syarat itu sebagai kalimat
 * hanya berharap modelnya menurut. Dua yang pertama dijamin oleh BENTUK DATANYA
 * (lihat `konteks_coach` di SQL): berat harian tidak pernah disodorkan sebagai
 * angka berlabel, dan setiap angka membawa `sumber` sebagai field.
 *
 * Yang ketiga ditegakkan DI SINI, sebelum pertanyaan dikirim ke mana pun.
 * `tanyakanKeCoach` memeriksa batas medis lebih dulu dan mengembalikan
 * penolakan tanpa satu pun permintaan jaringan: penolakan jadi pasti, tidak
 * bergantung pada model yang mungkin sedang menurut dan mungkin tidak, dan
 * pertanyaan kesehatan yang sensitif tidak perlu meninggalkan perangkat hanya
 * untuk ditolak.
 */

export class KesalahanCoach extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanCoach';
  }
}

/** Disclaimer tetap; ditampilkan di layar Coach, bukan hanya saat menolak. */
export { DISCLAIMER_COACH };

/**
 * Ambil konteks data lengkap untuk satu tanggal.
 *
 * @param persenLemak persen lemak bila diketahui; tanpa nilainya, metode TDEE
 *   Katch-McArdle dilewati (tidak ditebak) dan konteksnya jujur soal itu.
 */
export async function konteksCoach(
  tanggal: string | null = null,
  persenLemak: number | null = null,
): Promise<KonteksCoachRow> {
  const { data, error } = await supabase.rpc('konteks_coach', {
    p_tanggal: tanggal,
    p_persen_lemak: persenLemak,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanCoach('Server tidak mengembalikan konteks.', true);

  const k = data as KonteksCoachRow;

  // Pemeriksaan bentuk di batas jaringan, bukan kepercayaan buta. Angka tanpa
  // sumber akan lolos ke prompt sebagai angka tanpa asal, dan di situlah
  // pembedaan "mentah vs estimasi" runtuh tanpa ada yang menyadarinya.
  const tanpaSumber = (k.angka ?? []).filter(
    (a) => !['manual', 'sinkron', 'estimasi'].includes(a.sumber),
  );
  if (tanpaSumber.length > 0) {
    throw new KesalahanCoach(
      `Konteks memuat ${tanpaSumber.length} angka tanpa asal yang dikenal.`,
      false,
    );
  }

  return k;
}

/** Cari satu angka yang boleh dikutip; `null` bila datanya belum cukup. */
export function angka(k: KonteksCoachRow, kunci: string): AngkaKonteksRow | null {
  return (k.angka ?? []).find((a) => a.kunci === kunci) ?? null;
}

/** Angka mana saja yang merupakan ESTIMASI, untuk dilabeli di layar. */
export function angkaEstimasi(k: KonteksCoachRow): AngkaKonteksRow[] {
  return (k.angka ?? []).filter((a) => a.sumber === 'estimasi');
}

/**
 * Hasil pemeriksaan sebelum pertanyaan dikirim.
 *
 * `ditolak` berarti pertanyaannya TIDAK dikirim ke mana pun — bukan dikirim lalu
 * jawabannya disaring.
 */
export type PemeriksaanPertanyaan =
  | { ditolak: true; penolakan: PenolakanMedis }
  | { ditolak: false; pertanyaan: string };

/**
 * Periksa pertanyaan terhadap batas medis SEBELUM mengirimnya.
 *
 * Sisi yang paling penting justru yang TIDAK ditolak: app ini memang
 * membicarakan protein, kalori, dan suplemen makanan sepanjang hari, jadi
 * pendeteksi yang terlalu bersemangat akan menolak pertanyaan wajar dan membuat
 * seluruh fiturnya tidak bisa dipakai. Aturannya hidup di `periksaBatasMedis`
 * dan diuji dari dua arah oleh `npm run cek:medis`.
 */
export function periksaPertanyaan(pertanyaan: string): PemeriksaanPertanyaan {
  const penolakan = periksaBatasMedis(pertanyaan);
  if (penolakan) return { ditolak: true, penolakan };
  return { ditolak: false, pertanyaan };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanCoach {
  switch (error.code) {
    case '22003': // numeric_value_out_of_range — periode TDEE di luar batas
      return new KesalahanCoach(error.message, false);
    case '28000':
    case 'PGRST301':
      return new KesalahanCoach('Sesi Anda berakhir. Masuk lagi untuk memakai Coach.', false);
    default:
      return new KesalahanCoach('Gagal memuat data Coach. Periksa koneksi lalu coba lagi.', true);
  }
}
