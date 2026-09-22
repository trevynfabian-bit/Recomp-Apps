import { supabase } from '@/lib/supabase';
import type { HasilAnalisisFoto } from '@/mocks/fotoAi';

/**
 * Panggilan ke Edge Function `estimasi-makanan-foto`.
 *
 * Bentuk kembaliannya sengaja sama dengan `analisisFotoStub` di
 * `src/mocks/fotoAi.ts`, jadi layar tinggal menukar sumber datanya tanpa
 * mengubah alurnya.
 */

/** Tipe gambar yang diterima layanan. */
export type TipeGambar = 'image/jpeg' | 'image/png' | 'image/webp';

/** Hasil analisis beserta keterangan tambahan dari layanan asli. */
export type HasilAnalisisFotoServer = HasilAnalisisFoto & {
  /** Satu kalimat asumsi porsi atau alasan ketidakpastian. */
  catatan: string;
  pemakaian?: { input: number; output: number };
};

export class KesalahanAnalisisFoto extends Error {
  constructor(
    pesan: string,
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanAnalisisFoto';
  }
}

/**
 * Kirim satu foto untuk ditaksir kandungan gizinya.
 * @param gambarBase64 isi gambar tanpa awalan `data:`.
 */
export async function analisisFoto(
  gambarBase64: string,
  tipeGambar: TipeGambar,
): Promise<HasilAnalisisFotoServer> {
  const { data, error } = await supabase.functions.invoke('estimasi-makanan-foto', {
    body: { gambar_base64: gambarBase64, tipe_gambar: tipeGambar },
  });

  if (error) {
    // Edge Function mengembalikan pesan berbahasa Indonesia di badan respons;
    // pakai itu bila ada, bukan pesan teknis dari pustaka.
    const pesan = await bacaPesan(error);
    // 429 dan 5xx layak dicoba lagi; 4xx lainnya tidak akan berubah hasilnya.
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    throw new KesalahanAnalisisFoto(pesan, status === 429 || status >= 500);
  }

  if (!data || typeof data !== 'object') {
    throw new KesalahanAnalisisFoto('Layanan tidak mengembalikan hasil.', true);
  }

  return data as HasilAnalisisFotoServer;
}

/** Ambil pesan yang bisa dibaca pengguna dari galat Edge Function. */
async function bacaPesan(error: unknown): Promise<string> {
  const konteks = (error as { context?: Response }).context;
  if (konteks && typeof konteks.json === 'function') {
    try {
      const isi = await konteks.json();
      if (isi?.pesan) return String(isi.pesan);
    } catch {
      // Badan bukan JSON; jatuh ke pesan umum.
    }
  }
  return 'Gagal menganalisis foto. Periksa koneksi lalu coba lagi.';
}
