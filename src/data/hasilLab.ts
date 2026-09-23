import { BATAS_PANJANG_LAB } from '@recomp/logika';
import type { HasilLab } from '@recomp/logika';
import { supabase } from '@/lib/supabase';

/**
 * Service CRUD hasil lab di Supabase: `muat_hasil_lab`, `simpan_hasil_lab`,
 * dan `hapus_hasil_lab` (RPC).
 *
 * Simpan menulis hasil lab dan SELURUH penandanya dalam satu transaksi, jadi
 * tidak pernah ada hasil setengah tersimpan. Aturan isinya sama dengan
 * `periksaHasilLab` (dijaga tabelnya sendiri); galat dari server diubah ke
 * kalimat yang sama nadanya dengan form. Seperti target, simpan membawa waktu
 * baris itu terakhir berubah saat dimuat: bila sudah diubah di perangkat lain,
 * server menolak alih-alih menimpanya.
 *
 * Hasil lab tidak disalin ke penyimpanan perangkat (berbeda dengan target):
 * ini data kesehatan paling sensitif di app, dan layarnya cukup berkata
 * "belum termuat" saat tidak ada sinyal.
 */

export class KesalahanHasilLab extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
    /** `konflik`: sudah diubah di perangkat lain; `tidak-ada`: sudah dihapus. */
    readonly kode: 'konflik' | 'tidak-ada' | null = null,
  ) {
    super(pesan);
    this.name = 'KesalahanHasilLab';
  }
}

/** Hasil lab dari server, dengan waktu terakhir berubah untuk simpanan berikutnya. */
export type HasilLabServer = HasilLab & { diperbaruiPada: string };

type BarisServer = {
  id: string;
  tanggal: string;
  nama: string;
  laboratorium: string | null;
  diperbarui_pada: string;
  penanda: { nama: string; nilai: number; satuan: string; rujukanMin: number | null; rujukanMaks: number | null }[];
};

function keHasilLab(b: BarisServer): HasilLabServer {
  return {
    id: b.id,
    tanggal: b.tanggal,
    nama: b.nama,
    laboratorium: b.laboratorium,
    diperbaruiPada: b.diperbarui_pada,
    penanda: b.penanda.map((p) => ({
      nama: p.nama,
      nilai: Number(p.nilai),
      satuan: p.satuan,
      rujukanMin: p.rujukanMin === null ? null : Number(p.rujukanMin),
      rujukanMaks: p.rujukanMaks === null ? null : Number(p.rujukanMaks),
    })),
  };
}

export async function muatHasilLab(): Promise<HasilLabServer[]> {
  const { data, error } = await supabase.rpc('muat_hasil_lab');
  if (error) throw terjemahkan(error, 'muat');
  return (data as BarisServer[]).map(keHasilLab);
}

/** Tambah (tanpa `id`) atau ganti seluruh isi satu hasil lab (dengan `id`). */
export async function simpanHasilLabServer(
  hasil: Omit<HasilLab, 'id'>,
  ubah?: { id: string; diperbaruiPada?: string },
): Promise<HasilLabServer> {
  const { data, error } = await supabase.rpc('simpan_hasil_lab', {
    p_hasil: {
      nama: hasil.nama,
      tanggal: hasil.tanggal,
      laboratorium: hasil.laboratorium,
      penanda: hasil.penanda,
      ...(ubah?.diperbaruiPada ? { diperbarui_pada: ubah.diperbaruiPada } : {}),
    },
    p_id: ubah?.id ?? null,
  });
  if (error) throw terjemahkan(error, 'simpan');
  return keHasilLab(data as BarisServer);
}

export async function hapusHasilLabServer(id: string): Promise<void> {
  const { error } = await supabase.rpc('hapus_hasil_lab', { p_id: id });
  if (error) throw terjemahkan(error, 'hapus');
}

/** Pelanggaran aturan tabel → kalimat yang sama nadanya dengan form (`periksaHasilLab`). */
const PESAN_ATURAN: Record<string, string> = {
  lab_results_nama_wajar: `Nama panel paling panjang ${BATAS_PANJANG_LAB.panel} huruf.`,
  lab_results_laboratorium_wajar: `Nama laboratorium paling panjang ${BATAS_PANJANG_LAB.laboratorium} huruf.`,
  lab_results_tanggal_awal: 'Tanggal paling awal 1/1/2000.',
  lab_result_markers_nama_wajar: `Nama penanda paling panjang ${BATAS_PANJANG_LAB.penanda} huruf.`,
  lab_result_markers_satuan_wajar: `Satuan diisi, paling panjang ${BATAS_PANJANG_LAB.satuan} huruf.`,
  lab_result_markers_nilai_wajar: 'Nilai ditulis sebagai angka, paling banyak tiga desimal.',
  lab_result_markers_rujukan_min_wajar: 'Batas bawah ditulis sebagai angka, paling banyak tiga desimal.',
  lab_result_markers_rujukan_maks_wajar: 'Batas atas ditulis sebagai angka, paling banyak tiga desimal.',
  lab_result_markers_rentang_urut: 'Batas bawah lebih besar dari batas atas; periksa lagi urutannya.',
};

function terjemahkan(error: { code?: string; message: string }, untuk: 'muat' | 'simpan' | 'hapus'): KesalahanHasilLab {
  if (/fetch|network|jaringan/i.test(error.message)) {
    return new KesalahanHasilLab(
      untuk === 'muat'
        ? 'Hasil lab belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
        : untuk === 'simpan'
          ? 'Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.'
          : 'Belum terhapus. Periksa koneksi, lalu coba lagi.',
      true,
    );
  }
  switch (error.code) {
    case '23514': {
      const aturan = /constraint "([a-z_]+)"/.exec(error.message)?.[1];
      if (/setidaknya satu penanda/i.test(error.message)) return new KesalahanHasilLab('Isi setidaknya satu penanda dengan nilainya.', false);
      return new KesalahanHasilLab((aturan && PESAN_ATURAN[aturan]) ?? 'Isian hasil lab belum sesuai aturannya.', false);
    }
    case '23505':
      return new KesalahanHasilLab('Ada penanda yang namanya sama; setiap penanda cukup ditulis sekali.', false);
    case '22007':
      return new KesalahanHasilLab('Tanggal pengambilan sampel tidak bisa di masa depan.', false);
    case '22023': // pesan dari simpan_hasil_lab sudah berbahasa Indonesia
      return new KesalahanHasilLab(error.message, false);
    case 'P0002':
      return new KesalahanHasilLab('Hasil lab ini sudah tidak ada; mungkin sudah dihapus di perangkat lain.', false, 'tidak-ada');
    case '40001':
      return new KesalahanHasilLab(
        'Hasil lab ini baru saja diubah di perangkat lain. Isi terbarunya sudah dimuat; periksa lalu simpan lagi.',
        false,
        'konflik',
      );
    case '28000':
    case 'PGRST301':
      return new KesalahanHasilLab('Sesi berakhir. Masuk lagi untuk melanjutkan.', false);
    default:
      return new KesalahanHasilLab(
        untuk === 'muat'
          ? 'Hasil lab belum bisa dimuat. Coba lagi sebentar lagi.'
          : untuk === 'simpan'
            ? 'Belum tersimpan. Coba lagi sebentar lagi; isian Anda masih di sini.'
            : 'Belum terhapus. Coba lagi sebentar lagi.',
        true,
      );
  }
}
