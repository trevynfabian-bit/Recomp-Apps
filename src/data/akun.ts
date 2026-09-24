import { supabase } from '@/lib/supabase';
import type { StatusAkunRow } from '@/types/database';

/**
 * Status akun pengguna yang masuk (`status_akun_saya`): fakta dari Supabase Auth
 * (tanggal bergabung, email terkonfirmasi, masuk terakhir) dan kesimpulan dari
 * data app (profil lengkap, data awal, sumber terhubung).
 */

export class KesalahanAkun extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanAkun';
  }
}

export async function statusAkun(): Promise<StatusAkunRow> {
  const { data, error } = await supabase.rpc('status_akun_saya');
  if (error) {
    if (error.code === '28000' || error.code === 'PGRST301') {
      throw new KesalahanAkun('Sesi Anda berakhir. Masuk lagi untuk melihat akun.', false);
    }
    throw new KesalahanAkun(
      /fetch|network|jaringan/i.test(error.message)
        ? 'Status akun belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
        : 'Status akun belum bisa dimuat. Coba lagi sebentar lagi.',
      true,
    );
  }
  return data as StatusAkunRow;
}
