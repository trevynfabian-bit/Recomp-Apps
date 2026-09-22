import { supabase } from '@/lib/supabase';
import type { DailyLogRow } from '@/types/database';

/**
 * Catatan bebas harian (`daily_logs.catatan`).
 *
 * Catatan kosong SELALU disimpan sebagai NULL, bukan string kosong, supaya
 * "belum diisi" dan "sengaja dikosongkan" tidak tertukar — pembedaan itu
 * dipegang di sisi database, jadi klien tidak perlu menirunya.
 */

/** Batas panjang yang sama dengan yang ditegakkan database. */
export const MAKS_KARAKTER_CATATAN = 2000;

export class KesalahanCatatan extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanCatatan';
  }
}

/** Simpan catatan untuk satu tanggal; baris hari dibuat bila belum ada. */
export async function simpanCatatanHarian(
  tanggal: string,
  catatan: string | null,
): Promise<DailyLogRow> {
  const { data, error } = await supabase.rpc('simpan_catatan_harian', {
    p_tanggal: tanggal,
    p_catatan: catatan,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanCatatan('Server tidak mengembalikan data', true);
  return data;
}

/** Catatan satu tanggal; `null` bila hari itu belum dicatat atau kosong. */
export async function ambilCatatanHarian(tanggal: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('ambil_catatan_harian', { p_tanggal: tanggal });
  if (error) throw terjemahkan(error);
  return (data as string | null) ?? null;
}

function terjemahkan(error: { code?: string; message: string }): KesalahanCatatan {
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanCatatan('Sesi Anda berakhir. Masuk lagi untuk menyimpan.', false);
    case '22001': // string_data_right_truncation — catatan melebihi batas
      return new KesalahanCatatan(
        `Catatan terlalu panjang (batas ${MAKS_KARAKTER_CATATAN} karakter).`,
        false,
      );
    default:
      return new KesalahanCatatan('Gagal menyimpan catatan. Periksa koneksi lalu coba lagi.', true);
  }
}
