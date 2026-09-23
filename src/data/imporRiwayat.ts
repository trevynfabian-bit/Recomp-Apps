import { potongBatch, UKURAN_BATCH_IMPOR } from '@recomp/logika';
import type { BarisDilewati, BarisUkuranImpor, SesiLatihan } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import type { ImportJobRow, KirimanHealthKit } from '@/types/database';

/**
 * Jalankan impor riwayat sekali terhadap `import_jobs`.
 *
 * Berkas sudah diurai & dipratinjau di perangkat. Di sini isinya dikirim
 * BERTAHAP (`potongBatch`, ukuran sama dengan batas server), dan kemajuan
 * dilaporkan dari angka yang disimpan SERVER setelah tiap potongan — bukan
 * dari hitungan lokal — supaya "120 dari 312" yang terlihat adalah yang
 * benar-benar sudah tersimpan.
 *
 * Potongan yang gagal menandai job `gagal` dengan alasannya. Mengulang impor
 * aman: server menulis per kunci alami (sesi per waktu mulai, ukuran per
 * tanggal), jadi potongan yang sudah masuk tidak tergandakan.
 */

export type IsiImpor =
  | { sumber: 'hevy_csv'; sesi: SesiLatihan[] }
  | { sumber: 'ukuran_lama'; baris: BarisUkuranImpor[] }
  | { sumber: 'apple_health'; kiriman: KirimanHealthKit[] };

export class KesalahanImpor extends Error {
  constructor(
    pesan: string,
    readonly job: ImportJobRow | null,
  ) {
    super(pesan);
    this.name = 'KesalahanImpor';
  }
}

function potongan(isi: IsiImpor): { total: number; batch: Record<string, unknown>[] } {
  if (isi.sumber === 'hevy_csv') {
    return {
      total: isi.sesi.length,
      batch: potongBatch(isi.sesi, UKURAN_BATCH_IMPOR.hevy_csv).map((sesi) => ({ sesi })),
    };
  }
  if (isi.sumber === 'ukuran_lama') {
    return {
      total: isi.baris.length,
      batch: potongBatch(isi.baris, UKURAN_BATCH_IMPOR.ukuran_lama).map((baris) => ({ baris })),
    };
  }
  // Apple Health: perangkat sudah menyusun kiriman sebesar batas server.
  const jumlah = (k: KirimanHealthKit) => (k.sampel?.length ?? 0) + (k.berat?.length ?? 0) + (k.dihapus?.length ?? 0);
  return { total: isi.kiriman.reduce((t, k) => t + jumlah(k), 0), batch: isi.kiriman };
}

export async function jalankanImporRiwayat(
  isi: IsiImpor,
  ringkas: string,
  dilewati: BarisDilewati[],
  onKemajuan: (selesai: number, total: number) => void,
): Promise<ImportJobRow> {
  const { total, batch } = potongan(isi);
  if (total === 0) throw new KesalahanImpor('Tidak ada yang bisa diimpor.', null);

  const { data: mulai, error: galatMulai } = await supabase.rpc('mulai_impor', {
    p_sumber: isi.sumber,
    p_total: total,
    p_ringkas: ringkas,
    p_dilewati: dilewati,
  });
  if (galatMulai || !mulai) {
    const sedangBerjalan = galatMulai?.code === '55006';
    throw new KesalahanImpor(
      sedangBerjalan
        ? 'Impor lain dari sumber ini masih berjalan. Tunggu sampai selesai, lalu coba lagi.'
        : 'Impor tidak bisa dimulai. Periksa koneksi, lalu coba lagi.',
      null,
    );
  }

  let job = mulai;
  for (const p of batch) {
    const { data, error } = await supabase.rpc('impor_batch', { p_job: job.id, p_isi: p });
    if (error || !data) {
      await supabase.rpc('selesaikan_impor', { p_job: job.id, p_galat: 'Pengiriman terputus di tengah impor.' });
      throw new KesalahanImpor(
        `Impor berhenti di ${job.selesai} dari ${job.total}. Yang sudah masuk aman; mengulang impor tidak menggandakannya.`,
        job,
      );
    }
    job = data;
    onKemajuan(job.selesai, job.total);
  }

  const { data: akhir, error: galatAkhir } = await supabase.rpc('selesaikan_impor', { p_job: job.id });
  if (galatAkhir || !akhir) throw new KesalahanImpor('Impor tersimpan, tapi statusnya belum tercatat.', job);
  return akhir;
}

/** Job terakhir per sumber, untuk kartu "sudah diimpor". */
export async function imporTerakhir(): Promise<ImportJobRow[]> {
  const { data, error } = await supabase.rpc('impor_terakhir');
  if (error) throw error;
  return data ?? [];
}
