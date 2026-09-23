import { supabase } from '@/lib/supabase';
import { evaluasi4Mingguan } from '@recomp/logika';
import type { Fase, HasilEvaluasi } from '@recomp/logika';
import type { Evaluasi4MingguanRow, EvaluasiPeriodikRow } from '@/types/database';

/**
 * Evaluasi 4 mingguan: arah berat × pinggang × kekuatan → rekomendasi.
 *
 * Pembagian tugasnya sama dengan TDEE dan body fat. Server MENURUNKAN sumbunya
 * dari catatan dan memilih kode verdict, karena AI coach dan notifikasi
 * membacanya tanpa bisa menjalankan TypeScript. Kalimatnya — judul, ringkasan,
 * rekomendasi — disusun `evaluasi4Mingguan` di sini dari sumbu yang SAMA, supaya
 * hanya ada satu penyusun kalimat. `npm run cek:paritas` membuktikan kode dan
 * keyakinan kedua sisi identik untuk seluruh 960 kombinasi masukan.
 *
 * Satu hal yang perlu terlihat di layar, bukan disembunyikan: sumbu kekuatan
 * selalu `belum jelas` sampai data beban latihan tersedia, jadi keyakinan
 * evaluasi tidak pernah `tinggi` untuk sekarang. `sumbu.kekuatan.sebab`
 * menyebut alasannya.
 */

export class KesalahanEvaluasi extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanEvaluasi';
  }
}

export type SnapshotEvaluasi = HasilEvaluasi & {
  periodeDari: string;
  periodeSampai: string;
  fase: Fase;
  pekanData: number;
  /** Sumbu beserta angka penyusunnya, supaya verdict bisa ditelusuri. */
  sumbu: Evaluasi4MingguanRow['sumbu'];
};

/**
 * Evaluasi empat pekan yang SUDAH selesai sebelum `acuan`.
 *
 * Pekan berjalan sengaja tidak ikut: verdict yang berubah Selasa lalu berubah
 * lagi Kamis tidak akan dipercaya siapa pun.
 */
export async function evaluasiEmpatPekan(acuan: string | null = null): Promise<SnapshotEvaluasi> {
  const { data, error } = await supabase.rpc('evaluasi_4_mingguan', { p_sampai: acuan });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanEvaluasi('Server tidak mengembalikan evaluasi.', true);

  const j = data as Evaluasi4MingguanRow;
  const hasil = evaluasi4Mingguan({
    fase: j.fase,
    arahBerat: j.sumbu.berat.arah,
    arahPinggang: j.sumbu.pinggang.arah,
    arahKekuatan: j.sumbu.kekuatan.arah,
    pekanData: j.pekan_data,
  });

  // Pemeriksaan di batas jaringan: kalau kode server dan kode TypeScript
  // berbeda, salah satu pohon keputusannya menyimpang dan kalimat yang
  // ditampilkan tidak cocok dengan verdict yang disimpan. Lebih baik gagal
  // terang-terangan daripada menampilkan rekomendasi yang salah.
  if (hasil.kode !== j.kode || hasil.keyakinan !== j.keyakinan) {
    throw new KesalahanEvaluasi(
      `Verdict server (${j.kode}) tidak cocok dengan aturan app (${hasil.kode}).`,
      false,
    );
  }

  return {
    ...hasil,
    periodeDari: j.periode_dari,
    periodeSampai: j.periode_sampai,
    fase: j.fase,
    pekanData: j.pekan_data,
    sumbu: j.sumbu,
  };
}

/**
 * Simpan verdict ke `evaluasi_periodik` supaya tidak ikut hilang saat
 * percakapan yang mengantarkannya dihapus.
 *
 * Satu periode satu verdict; menyimpan ulang periode yang sama MEMPERBARUI
 * barisnya, karena dua verdict untuk empat pekan yang sama berarti salah
 * satunya kedaluwarsa dan tidak ada cara memilih.
 */
export async function simpanEvaluasi(
  e: SnapshotEvaluasi,
  pesanId: string | null = null,
): Promise<EvaluasiPeriodikRow> {
  const { data: sesi } = await supabase.auth.getUser();
  const userId = sesi?.user?.id;
  if (!userId) throw new KesalahanEvaluasi('Sesi Anda berakhir. Masuk lagi.', false);

  const { data, error } = await supabase
    .from('evaluasi_periodik')
    .upsert(
      {
        user_id: userId,
        periode_dari: e.periodeDari,
        periode_sampai: e.periodeSampai,
        fase: e.fase,
        arah_berat: e.sumbu.berat.arah,
        arah_pinggang: e.sumbu.pinggang.arah,
        arah_kekuatan: e.sumbu.kekuatan.arah,
        pekan_data: e.pekanData,
        kode: e.kode,
        judul: e.judul,
        ringkas: e.ringkas,
        rekomendasi: e.rekomendasi,
        penentu: e.penentu,
        keyakinan: e.keyakinan,
        pesan_id: pesanId,
      },
      { onConflict: 'user_id,periode_dari' },
    )
    .select()
    .single();

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanEvaluasi('Evaluasi tidak tersimpan.', true);
  return data;
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanEvaluasi {
  switch (error.code) {
    case '23514': // check_violation — periode tidak sah atau kode tak dikenal
      return new KesalahanEvaluasi('Evaluasi ditolak database: periode atau kodenya tidak sah.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanEvaluasi('Sesi Anda berakhir. Masuk lagi untuk melihat evaluasi.', false);
    default:
      return new KesalahanEvaluasi('Gagal memuat evaluasi. Periksa koneksi lalu coba lagi.', true);
  }
}
