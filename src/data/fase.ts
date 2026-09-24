import { supabase } from '@/lib/supabase';
import type { Fase } from '@recomp/logika';
import type { DayTypeTargetRow, FasePeriodeRow } from '@/types/database';

/**
 * Akses data fase program & target kalori per fase.
 *
 * Satu aturan yang dipegang seluruh berkas ini: fase diganti lewat RPC
 * `ganti_fase`, TIDAK pernah dengan menulis `profiles.fase_aktif` langsung.
 * RPC-nya menutup periode lama, membuka yang baru dengan jangkar berat dari
 * rata-rata 7 hari, dan menyegarkan snapshot target untuk hari ini dan
 * sesudahnya — tiga tulisan yang harus terjadi bersama-sama. Menulis kolom
 * profil saja akan membuat riwayat fase dan target harian saling bertentangan,
 * dan pertentangan itu baru terlihat berpekan-pekan kemudian lewat budget yang
 * angkanya aneh.
 */

export class KesalahanFase extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanFase';
  }
}

/**
 * Ganti fase program.
 *
 * @param tanggal tanggal mulai fase; `null` berarti hari ini menurut
 *   Asia/Jakarta, dihitung SERVER supaya tidak bergantung jam perangkat.
 */
export async function gantiFase(fase: Fase, tanggal: string | null = null): Promise<FasePeriodeRow> {
  const { data, error } = await supabase.rpc('ganti_fase', {
    p_fase: fase,
    p_tanggal: tanggal,
  });

  if (error) throw terjemahkan(error, 'simpan');
  if (!data) throw new KesalahanFase('Fase belum tersimpan. Coba lagi sebentar lagi.', true);
  return data;
}

/** Fase yang BERLAKU pada satu tanggal menurut riwayat, bukan fase hari ini. */
export async function fasePadaTanggal(tanggal: string): Promise<Fase> {
  const { data, error } = await supabase.rpc('fase_pada_tanggal', { p_tanggal: tanggal });

  if (error) throw terjemahkan(error, 'muat');
  if (!data) throw new KesalahanFase('Fase belum bisa dimuat. Coba lagi sebentar lagi.', true);
  return data;
}

/** Riwayat periode fase, terbaru lebih dulu. */
export async function riwayatFase(batas = 12): Promise<FasePeriodeRow[]> {
  const { data, error } = await supabase
    .from('fase_periode')
    .select('*')
    .order('mulai_tanggal', { ascending: false })
    .limit(batas);

  if (error) throw terjemahkan(error, 'muat');
  return data ?? [];
}

/** Periode fase yang sedang berjalan; `null` bila pengguna belum punya. */
export async function periodeBerjalan(): Promise<FasePeriodeRow | null> {
  const { data, error } = await supabase
    .from('fase_periode')
    .select('*')
    .is('selesai_tanggal', null)
    .maybeSingle();

  if (error) throw terjemahkan(error, 'muat');
  return data ?? null;
}

/**
 * Seluruh target absolut: tiap tipe hari × TIAP fase, bukan hanya fase aktif.
 *
 * Layar Budget memperlihatkan akibat berpindah fase SEBELUM pengguna
 * berpindah — "kalau Cut, targetmu jadi segini" — dan itu tidak bisa dijawab
 * oleh view tipe hari aktif, yang menurut definisinya hanya memuat satu fase.
 */
export async function targetSemuaFase(): Promise<DayTypeTargetRow[]> {
  const { data, error } = await supabase
    .from('day_type_targets')
    .select('*')
    .order('fase', { ascending: true });

  if (error) throw terjemahkan(error, 'muat');
  return data ?? [];
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 * `untuk` membedakan memuat dari mengganti fase: "belum bisa dimuat" untuk
 * ganti fase yang gagal membuat orang mengira datanya yang hilang.
 * Setiap kalimat diperiksa `cek:target` (nada, tanpa istilah teknis).
 */
function terjemahkan(error: { code?: string; message: string }, untuk: 'muat' | 'simpan'): KesalahanFase {
  if (/fetch|network|jaringan/i.test(error.message)) {
    return new KesalahanFase(
      untuk === 'muat'
        ? 'Fase belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
        : 'Fase belum diganti. Periksa koneksi, lalu coba lagi.',
      true,
    );
  }
  switch (error.code) {
    case '22007': // invalid_datetime_format — tanggal menabrak periode tertutup
      return new KesalahanFase(
        'Tanggal itu berada di dalam periode fase yang sudah selesai. Pilih tanggal setelahnya.',
        false,
      );
    case '23502': // not_null_violation — profil belum punya fase
      return new KesalahanFase('Profil belum punya fase program. Pilih fase dulu di Setelan.', false);
    case '23505': // unique_violation — dua periode berjalan sekaligus
      return new KesalahanFase(
        'Sudah ada periode fase yang berjalan. Muat ulang lalu coba lagi.',
        true,
      );
    case '23P01': // exclusion_violation — rentang periode bertumpuk
      return new KesalahanFase(
        'Tanggal itu bertumpuk dengan periode fase lain. Muat ulang riwayat fase lalu coba lagi.',
        true,
      );
    case '23514': // check_violation — fase_periode_urutan_masuk_akal
      return new KesalahanFase('Tanggal selesai periode fase tidak boleh sebelum tanggal mulainya.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanFase(
        untuk === 'muat' ? 'Sesi Anda berakhir. Masuk lagi untuk melihat fase.' : 'Sesi Anda berakhir. Masuk lagi untuk mengganti fase.',
        false,
      );
    default:
      return new KesalahanFase(
        untuk === 'muat' ? 'Fase belum bisa dimuat. Coba lagi sebentar lagi.' : 'Fase belum diganti. Coba lagi sebentar lagi.',
        true,
      );
  }
}
