import { supabase } from '@/lib/supabase';
import { keRingkasanTampil } from '@recomp/logika';
import type { PoinRingkasan } from '@recomp/logika';
import type { RingkasanMingguan } from '@/types/domain';

/**
 * Akses ringkasan mingguan otomatis.
 *
 * Ringkasan normalnya dibuat JADWAL tiap Senin pagi dan sudah menunggu di
 * riwayat chat saat app dibuka. `mintaRingkasanPekanLalu` adalah jalur cadangan
 * untuk pengguna yang membuka app sebelum jadwal sampai kepadanya: fungsi yang
 * sama, dijalankan atas permintaan, idempoten — jadi memanggilnya saat jadwal
 * sudah selesai tidak membuat ringkasan kedua dan tidak membayar model lagi.
 *
 * Poin tersimpan dalam bentuk MENTAH (angka + satuan + kode arah) dan
 * diformat di sini lewat `keRingkasanTampil` dari paket bersama. Web dashboard
 * memformatnya dengan fungsi yang sama, jadi "74,4 kg" tidak akan tampil
 * sebagai "74.43 kg" di salah satunya.
 */

export class KesalahanRingkasanMingguan extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanRingkasanMingguan';
  }
}

export type RingkasanTersimpan = RingkasanMingguan & {
  id: string;
  /** Pesan kartu yang mengantarkannya; `null` bila utasnya sudah dihapus. */
  pesanId: string | null;
};

/** Ringkasan pekan terbaru milik pengguna, atau `null` bila belum pernah ada. */
export async function ringkasanTerbaru(): Promise<RingkasanTersimpan | null> {
  const { data, error } = await supabase
    .from('ringkasan_mingguan')
    .select('id, periode_dari, periode_sampai, poin, bacaan, lanjutan, pesan_id')
    .order('periode_dari', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new KesalahanRingkasanMingguan('Gagal memuat ringkasan. Periksa koneksi lalu coba lagi.', true);
  }
  if (!data) return null;

  return {
    id: data.id,
    pesanId: data.pesan_id,
    ...keRingkasanTampil({
      periode: { dari: data.periode_dari, sampai: data.periode_sampai },
      poin: data.poin,
      bacaan: data.bacaan,
      lanjutan: data.lanjutan,
    }),
  };
}

/**
 * Ubah kolom `pesan_coach.ringkasan` menjadi bentuk kartu, untuk pesan yang
 * dimuat dari riwayat chat. `null` bila bentuknya tidak dikenali — pesan
 * seperti itu dilewati kartunya, bukan membuat layar chat ambruk.
 */
export function ringkasanDariPesan(ringkasan: Record<string, unknown> | null): RingkasanMingguan | null {
  if (!ringkasan) return null;
  const periode = ringkasan.periode as { dari?: unknown; sampai?: unknown } | undefined;
  if (
    !periode ||
    typeof periode.dari !== 'string' ||
    typeof periode.sampai !== 'string' ||
    !Array.isArray(ringkasan.poin) ||
    typeof ringkasan.bacaan !== 'string'
  ) {
    return null;
  }
  return keRingkasanTampil({
    periode: { dari: periode.dari, sampai: periode.sampai },
    poin: ringkasan.poin as PoinRingkasan[],
    bacaan: ringkasan.bacaan,
    lanjutan: Array.isArray(ringkasan.lanjutan)
      ? ringkasan.lanjutan.filter((t): t is string => typeof t === 'string')
      : null,
  });
}

export type HasilPermintaanRingkasan =
  | { status: 'baru' | 'sudah-ada'; ringkasanId: string; pesanId: string | null; percakapanId: string | null }
  | { status: 'dilewati' };

/**
 * Minta ringkasan pekan lalu sekarang juga.
 *
 * `dilewati` berarti pekan itu tidak punya timbangan maupun catatan makan —
 * bukan kesalahan, dan app sebaiknya diam saja alih-alih menampilkan kartu
 * "tidak ada data" yang terasa seperti teguran.
 */
export async function mintaRingkasanPekanLalu(): Promise<HasilPermintaanRingkasan> {
  const { data, error } = await supabase.functions.invoke('ringkasan-mingguan', { body: {} });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    if (status === 401) {
      throw new KesalahanRingkasanMingguan('Sesi Anda berakhir. Masuk lagi.', false);
    }
    throw new KesalahanRingkasanMingguan(
      'Ringkasan belum bisa dibuat. Coba lagi nanti.',
      status === 429 || status >= 500 || status === 0,
    );
  }

  const h = data as {
    status: 'baru' | 'sudah-ada' | 'dilewati';
    ringkasan_id?: string;
    pesan_id?: string | null;
    percakapan_id?: string | null;
  };
  if (h.status === 'dilewati' || !h.ringkasan_id) return { status: 'dilewati' };
  return {
    status: h.status,
    ringkasanId: h.ringkasan_id,
    pesanId: h.pesan_id ?? null,
    percakapanId: h.percakapan_id ?? null,
  };
}
