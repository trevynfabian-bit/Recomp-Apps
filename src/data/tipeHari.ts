import { supabase } from '@/lib/supabase';
import type { DailyLogRow, TargetHarianRow, TipeHariAktifRow } from '@/types/database';

/**
 * Akses data tipe hari & target harian.
 *
 * Target TIDAK pernah dikirim dari klien: ia selalu turunan dari
 * (tipe hari x fase aktif) di database. Klien hanya menyebut tipe hari mana
 * yang dipakai; snapshot `target_kalori` disegarkan oleh RPC-nya.
 */

export class KesalahanTipeHari extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanTipeHari';
  }
}

/** Semua tipe hari pengguna beserta target untuk fase yang sedang aktif. */
export async function daftarTipeHari(): Promise<TipeHariAktifRow[]> {
  const { data, error } = await supabase
    .from('v_tipe_hari_aktif')
    .select('*')
    .order('urutan', { ascending: true });

  if (error) throw terjemahkan(error);
  return data ?? [];
}

/**
 * Setel tipe hari untuk satu tanggal.
 * @param override true bila pilihan manual pengguna, false bila mengikuti auto-deteksi.
 */
export async function setelTipeHari(
  tanggal: string,
  dayTypeId: string,
  override = true,
): Promise<DailyLogRow> {
  const { data, error } = await supabase.rpc('setel_tipe_hari', {
    p_tanggal: tanggal,
    p_day_type_id: dayTypeId,
    p_override: override,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanTipeHari('Server tidak mengembalikan data', true);
  return data;
}

/**
 * Target yang berlaku untuk satu tanggal.
 * `null` bila pengguna belum punya tipe hari sama sekali.
 */
export async function ambilTargetHarian(tanggal: string): Promise<TargetHarianRow | null> {
  const { data, error } = await supabase.rpc('ambil_target_harian', { p_tanggal: tanggal });

  if (error) throw terjemahkan(error);
  // Fungsi mengembalikan SETOF dengan LIMIT 1, jadi hasilnya array 0 atau 1 baris.
  return data?.[0] ?? null;
}

function terjemahkan(error: { code?: string; message: string }): KesalahanTipeHari {
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanTipeHari('Sesi Anda berakhir. Masuk lagi untuk menyimpan.', false);
    case '23503': // foreign_key_violation — tipe hari tidak ditemukan / bukan milik Anda
      return new KesalahanTipeHari('Tipe hari itu tidak ada di akun Anda.', false);
    case '23502': // not_null_violation — profil belum punya fase aktif
      return new KesalahanTipeHari('Profil belum punya fase program. Atur dulu di Pengaturan.', false);
    default:
      return new KesalahanTipeHari('Gagal menyimpan tipe hari. Periksa koneksi lalu coba lagi.', true);
  }
}
