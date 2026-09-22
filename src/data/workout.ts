import { supabase } from '@/lib/supabase';
import type { DailyLogRow, DeteksiTipeHariRow, WorkoutRow } from '@/types/database';

/**
 * Akses data workout & auto-deteksi tipe hari.
 *
 * Aturan deteksinya ada di database DAN di `src/lib/deteksiTipeHari.ts`, dan
 * keduanya dijaga sejalan oleh `npm run cek:paritas`. Sisi database yang
 * berwenang: begitu workout masuk, trigger langsung menyetel tipe hari — kecuali
 * pengguna sudah meng-override hari itu, yang selalu menang.
 */

export class KesalahanWorkout extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanWorkout';
  }
}

/** Workout yang tercatat pada satu tanggal, urut lama → baru. */
export async function workoutHari(tanggal: string): Promise<WorkoutRow[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('tanggal', tanggal)
    .order('created_at', { ascending: true });

  if (error) throw terjemahkan(error);
  return data ?? [];
}

/**
 * Tebakan tipe hari untuk satu tanggal beserta workout yang mendasarinya.
 * Dipakai UI untuk MENJELASKAN hasilnya, bukan hanya menampilkannya.
 */
export async function deteksiTipeHariServer(
  tanggal: string,
): Promise<DeteksiTipeHariRow | null> {
  const { data, error } = await supabase.rpc('deteksi_tipe_hari', {
    p_tanggal: tanggal,
    // null berarti "pakai pengguna dari sesi ini".
    p_user_id: null,
  });

  if (error) throw terjemahkan(error);
  return data?.[0] ?? null;
}

/** Buang override manual dan kembali mengikuti hasil auto-deteksi. */
export async function ikutiAutoDeteksi(tanggal: string): Promise<DailyLogRow> {
  const { data, error } = await supabase.rpc('ikuti_auto_deteksi', { p_tanggal: tanggal });
  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanWorkout('Server tidak mengembalikan data', true);
  return data;
}

function terjemahkan(error: { code?: string; message: string }): KesalahanWorkout {
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanWorkout('Sesi Anda berakhir. Masuk lagi.', false);
    default:
      return new KesalahanWorkout('Gagal memuat data latihan. Coba lagi.', true);
  }
}
