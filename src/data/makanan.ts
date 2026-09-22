import { supabase } from '@/lib/supabase';
import type {
  DailyLogRow,
  FoodLogRow,
  RingkasanHarianRow,
  SumberMakananDb,
} from '@/types/database';

/**
 * Akses data makanan, catatan harian, dan ringkasan.
 *
 * Total makro TIDAK pernah dikirim dari klien. Kolom makro di `daily_logs`
 * dijaga trigger sebagai jumlah `food_logs` hari itu, jadi total tidak mungkin
 * melenceng dari isinya — termasuk ketika satu permintaan gagal di tengah jalan.
 */

export class KesalahanMakanan extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanMakanan';
  }
}

export type EntriMakananBaruDb = {
  nama_makanan: string;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  /** `foto_ai` menandai ESTIMASI, `manual` menandai data mentah. */
  sumber: SumberMakananDb;
  foto_url: string | null;
};

/** Catat satu entri makanan; baris hari dibuat otomatis bila belum ada. */
export async function catatMakanan(
  tanggal: string,
  entri: EntriMakananBaruDb,
): Promise<FoodLogRow> {
  const { data, error } = await supabase.rpc('catat_makanan', {
    p_tanggal: tanggal,
    p_nama_makanan: entri.nama_makanan,
    p_kalori: entri.kalori,
    p_protein_g: entri.protein_g,
    p_lemak_g: entri.lemak_g,
    p_karbo_g: entri.karbo_g,
    p_sat_fat_g: entri.sat_fat_g,
    p_sumber: entri.sumber,
    p_foto_url: entri.foto_url,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanMakanan('Server tidak mengembalikan data', true);
  return data;
}

/** Entri makanan satu hari, urut lama → baru. */
export async function daftarMakanan(tanggal: string): Promise<FoodLogRow[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*, daily_logs!inner(tanggal)')
    .eq('daily_logs.tanggal', tanggal)
    .order('created_at', { ascending: true });

  if (error) throw terjemahkan(error);
  // Kolom join hanya dipakai untuk menyaring; buang agar bentuknya tetap FoodLogRow.
  return (data ?? []).map(({ daily_logs: _abaikan, ...sisanya }) => sisanya as FoodLogRow);
}

/** Hapus satu entri; total harian disegarkan trigger. */
export async function hapusMakanan(foodLogId: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', foodLogId);
  if (error) throw terjemahkan(error);
}

/** Simpan catatan bebas harian. String kosong/spasi disimpan sebagai NULL. */
export async function simpanCatatanHarian(
  tanggal: string,
  catatan: string | null,
): Promise<DailyLogRow> {
  const { data, error } = await supabase.rpc('simpan_catatan_harian', {
    p_tanggal: tanggal,
    p_catatan: catatan,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanMakanan('Server tidak mengembalikan data', true);
  return data;
}

/** Ringkasan satu hari: total, target berlaku, catatan, dan jumlah estimasi. */
export async function ringkasanHarian(tanggal: string): Promise<RingkasanHarianRow | null> {
  const { data, error } = await supabase.rpc('ringkasan_harian', { p_tanggal: tanggal });
  if (error) throw terjemahkan(error);
  return data?.[0] ?? null;
}

function terjemahkan(error: { code?: string; message: string }): KesalahanMakanan {
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanMakanan('Sesi Anda berakhir. Masuk lagi untuk menyimpan.', false);
    case '22004': // null_value_not_allowed — nama makanan kosong
      return new KesalahanMakanan('Nama makanan tidak boleh kosong.', false);
    case '23514': // check_violation
      return new KesalahanMakanan('Nilai makro ditolak database (tidak boleh negatif).', false);
    default:
      return new KesalahanMakanan('Gagal menyimpan. Periksa koneksi lalu coba lagi.', true);
  }
}
