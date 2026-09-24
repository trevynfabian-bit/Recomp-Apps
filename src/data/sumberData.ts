import type { SumberData } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import type { PutuskanSumberRow } from '@/types/database';

/**
 * Menyambungkan & memutus sumber data.
 *
 * Menyambung WHOOP/Strava/Hevy lewat Edge Function `hubungkan-sumber`: kode
 * izin OAuth ditukar dengan token di SERVER (client secret tidak pernah ada di
 * perangkat) dan kunci Hevy dicoba ke API Hevy sebelum disimpan. Apple Health
 * disambung di perangkat (izin HealthKit), tidak lewat sini.
 *
 * Memutus lewat RPC `putuskan_sumber`: token/kunci ikut terhapus, dan bila
 * diminta, data dari sumber itu juga.
 */

export class KesalahanSumberData extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanSumberData';
  }
}

export type PermintaanHubungkan =
  | { sumber: 'whoop' | 'strava'; kode: string; redirectUri: string }
  | { sumber: 'hevy'; kunciApi: string };

export type KoneksiTersambung = {
  sumber: SumberData;
  status: 'terhubung';
  akunEksternal: string | null;
  terhubungPada: string;
};

export async function hubungkanSumber(p: PermintaanHubungkan): Promise<KoneksiTersambung> {
  const body =
    p.sumber === 'hevy'
      ? { sumber: 'hevy', kunci_api: p.kunciApi }
      : { sumber: p.sumber, kode: p.kode, redirect_uri: p.redirectUri };
  const { data, error } = await supabase.functions.invoke('hubungkan-sumber', { body });

  if (error) {
    const konteks = (error as { context?: Response }).context;
    const status = konteks?.status ?? 0;
    // Kalimat galat dari fungsi sudah untuk pengguna (tanpa kode atau kunci).
    const galat = await konteks
      ?.json()
      .then((j: { galat?: unknown }) => (typeof j.galat === 'string' ? j.galat : null))
      .catch(() => null);
    if (status === 401) throw new KesalahanSumberData('Sesi Anda berakhir. Masuk lagi untuk menghubungkan.', false);
    if (galat) throw new KesalahanSumberData(galat, status === 0 || status >= 500);
    throw new KesalahanSumberData(
      status === 0
        ? 'Belum tersambung. Periksa koneksi, lalu coba lagi.'
        : 'Belum tersambung. Coba lagi sebentar lagi.',
      true,
    );
  }

  const k = (data as { koneksi?: { sumber: SumberData; akun_eksternal: string | null; terhubung_pada: string } })
    .koneksi;
  if (!k) throw new KesalahanSumberData('Belum tersambung. Coba lagi sebentar lagi.', true);
  return { sumber: k.sumber, status: 'terhubung', akunEksternal: k.akun_eksternal, terhubungPada: k.terhubung_pada };
}

export type HasilPutus = { diputusPada: string; dataDihapus: number; latihanDihapus: number };

export async function putuskanSumber(sumber: SumberData, hapusData: boolean): Promise<HasilPutus> {
  const { data, error } = await supabase.rpc('putuskan_sumber', { p_sumber: sumber, p_hapus_data: hapusData });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanSumberData('Belum terputus. Coba lagi sebentar lagi.', true);
  const r = data as PutuskanSumberRow;
  return { diputusPada: r.diputus_pada, dataDihapus: r.data_dihapus, latihanDihapus: r.latihan_dihapus };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanSumberData {
  if (/fetch|network|jaringan/i.test(error.message)) {
    return new KesalahanSumberData('Belum terputus. Periksa koneksi, lalu coba lagi.', true);
  }
  switch (error.code) {
    case 'P0002': // belum pernah dihubungkan
      return new KesalahanSumberData('Sumber ini belum pernah dihubungkan.', false);
    case '22023': // sumber tidak dikenal
      return new KesalahanSumberData('Sumber ini tidak dikenal. Muat ulang daftar sumber, lalu coba lagi.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanSumberData('Sesi Anda berakhir. Masuk lagi untuk memutuskan sumber.', false);
    default:
      return new KesalahanSumberData('Belum terputus. Coba lagi sebentar lagi.', true);
  }
}
