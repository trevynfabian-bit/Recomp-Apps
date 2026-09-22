import { supabase } from '@/lib/supabase';
import type { RataRataBeratRow, RingkasanSisaRow } from '@/types/database';

/**
 * Ringkasan sisa harian, dihitung di server.
 *
 * Aturan "sisa" sengaja ada di dua tempat: `src/lib/makro.ts` untuk UI (agar
 * konsisten dengan web lewat paket logika bersama) dan fungsi SQL untuk widget
 * lock screen (WidgetKit tidak bisa menjalankan paket TS). Keduanya dijaga
 * sejalan oleh `npm run cek:paritas` — kalau satu sisi diubah tanpa yang lain,
 * pemeriksaan itu gagal.
 */

export class KesalahanRingkasan extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanRingkasan';
  }
}

/** Ringkasan satu hari beserta sisa tiap makro. */
export async function ringkasanSisaHarian(tanggal: string): Promise<RingkasanSisaRow | null> {
  const { data, error } = await supabase.rpc('ringkasan_sisa_harian', { p_tanggal: tanggal });
  if (error) throw terjemahkan(error);
  return data?.[0] ?? null;
}

/**
 * Rata-rata berat dalam jendela 7 hari yang berakhir di `tanggal`.
 * Hari tanpa timbangan dilewati, bukan dihitung nol.
 */
export async function rataRataBerat7Hari(tanggal: string): Promise<RataRataBeratRow | null> {
  const { data, error } = await supabase.rpc('rata_rata_berat_7_hari', { p_tanggal: tanggal });
  if (error) throw terjemahkan(error);
  return data?.[0] ?? null;
}

function terjemahkan(error: { code?: string; message: string }): KesalahanRingkasan {
  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanRingkasan('Sesi Anda berakhir. Masuk lagi.', false);
    default:
      return new KesalahanRingkasan('Gagal memuat ringkasan. Periksa koneksi lalu coba lagi.', true);
  }
}
