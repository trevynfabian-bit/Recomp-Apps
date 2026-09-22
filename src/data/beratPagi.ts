import { supabase } from '@/lib/supabase';
import type { DailyLogRow, SumberBeratDb } from '@/types/database';

/**
 * Akses data berat pagi.
 *
 * Menulis lewat RPC `simpan_berat_pagi`, BUKAN upsert langsung ke tabel:
 * satu hari adalah satu baris `daily_logs` yang juga memuat makro, catatan,
 * dan tipe hari, sehingga upsert dari klien akan menimpanya dengan nilai
 * default. RPC-nya hanya menyentuh kolom berat.
 */

/** Kesalahan yang sudah diterjemahkan ke kalimat yang layak ditampilkan. */
export class KesalahanSimpanBerat extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanSimpanBerat';
  }
}

/**
 * Simpan berat pagi untuk satu tanggal.
 * @param tanggal `YYYY-MM-DD`, sudah dinormalisasi ke Asia/Jakarta.
 */
export async function simpanBeratPagi(
  tanggal: string,
  beratKg: number,
  sumber: SumberBeratDb = 'manual',
): Promise<DailyLogRow> {
  const { data, error } = await supabase.rpc('simpan_berat_pagi', {
    p_tanggal: tanggal,
    p_berat_kg: beratKg,
    p_sumber: sumber,
  });

  if (error) throw terjemahkan(error);
  if (!data) {
    throw new KesalahanSimpanBerat('Server tidak mengembalikan data', true);
  }
  return data;
}

/** Ambil berat pagi satu tanggal; `null` bila hari itu belum dicatat. */
export async function ambilBeratPagi(
  tanggal: string,
): Promise<Pick<DailyLogRow, 'berat_pagi_kg' | 'sumber_berat'> | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('berat_pagi_kg, sumber_berat')
    .eq('tanggal', tanggal)
    .maybeSingle();

  if (error) throw terjemahkan(error);
  return data ?? null;
}

/**
 * Riwayat berat sampai `batas` hari terakhir, urut baru → lama.
 * Baris tanpa berat dilewati agar pemanggil tidak perlu menyaring sendiri.
 */
export async function riwayatBerat(
  sampaiTanggal: string,
  batas = 14,
): Promise<Pick<DailyLogRow, 'tanggal' | 'berat_pagi_kg' | 'sumber_berat'>[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('tanggal, berat_pagi_kg, sumber_berat')
    .lte('tanggal', sampaiTanggal)
    .not('berat_pagi_kg', 'is', null)
    .order('tanggal', { ascending: false })
    .limit(batas);

  if (error) throw terjemahkan(error);
  return data ?? [];
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanSimpanBerat {
  switch (error.code) {
    case '28000': // invalid_authorization_specification
      return new KesalahanSimpanBerat('Sesi Anda berakhir. Masuk lagi untuk menyimpan.', false);
    case '22003': // numeric_value_out_of_range
      return new KesalahanSimpanBerat('Berat di luar rentang wajar (30–250 kg).', false);
    case '22004': // null_value_not_allowed
      return new KesalahanSimpanBerat('Berat tidak boleh kosong.', false);
    case '23514': // check_violation
      return new KesalahanSimpanBerat('Nilai berat ditolak database.', false);
    case 'PGRST301': // JWT kedaluwarsa di PostgREST
      return new KesalahanSimpanBerat('Sesi Anda berakhir. Masuk lagi untuk menyimpan.', false);
    default:
      // Sisanya diperlakukan sebagai gangguan sementara — tombol "Coba lagi"
      // di kartu Timbang Pagi memang untuk kasus ini.
      return new KesalahanSimpanBerat('Gagal menyimpan. Periksa koneksi lalu coba lagi.', true);
  }
}
