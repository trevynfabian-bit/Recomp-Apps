import { supabase } from '@/lib/supabase';
import { DISCLAIMER_COACH, formatAngka, MAKS_PERTANYAAN_COACH, periksaBatasMedis } from '@recomp/logika';
import type { PenolakanMedis } from '@recomp/logika';
import type {
  AngkaKonteksRow,
  KonteksCoachRow,
  KuotaCoachRow,
  PesanPercakapanRow,
  RiwayatPercakapanRow,
} from '@/types/database';
import type { RujukanData, WidgetCoach } from '@/types/domain';

/**
 * Konteks data untuk AI Coach.
 *
 * PRD memberi coach tiga syarat yang tidak bisa dijamin lewat prompt: ia WAJIB
 * memakai rata-rata 7 hari, ia HARUS membedakan data mentah dari estimasi, dan
 * ia tidak memberi dosis obat. Prompt yang menuliskan syarat itu sebagai kalimat
 * hanya berharap modelnya menurut. Dua yang pertama dijamin oleh BENTUK DATANYA
 * (lihat `konteks_coach` di SQL): berat harian tidak pernah disodorkan sebagai
 * angka berlabel, dan setiap angka membawa `sumber` sebagai field.
 *
 * Yang ketiga ditegakkan DI SINI, sebelum pertanyaan dikirim ke mana pun.
 * `tanyakanKeCoach` memeriksa batas medis lebih dulu dan mengembalikan
 * penolakan tanpa satu pun permintaan jaringan: penolakan jadi pasti, tidak
 * bergantung pada model yang mungkin sedang menurut dan mungkin tidak, dan
 * pertanyaan kesehatan yang sensitif tidak perlu meninggalkan perangkat hanya
 * untuk ditolak.
 */

export class KesalahanCoach extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanCoach';
  }
}

/** Disclaimer tetap; ditampilkan di layar Coach, bukan hanya saat menolak. */
export { DISCLAIMER_COACH };

/**
 * Ambil konteks data lengkap untuk satu tanggal.
 *
 * @param persenLemak persen lemak bila diketahui; tanpa nilainya, metode TDEE
 *   Katch-McArdle dilewati (tidak ditebak) dan konteksnya jujur soal itu.
 */
export async function konteksCoach(
  tanggal: string | null = null,
  persenLemak: number | null = null,
): Promise<KonteksCoachRow> {
  const { data, error } = await supabase.rpc('konteks_coach', {
    p_tanggal: tanggal,
    p_persen_lemak: persenLemak,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanCoach('Data Coach belum bisa dimuat. Coba lagi sebentar lagi.', true);

  const k = data as KonteksCoachRow;

  // Pemeriksaan bentuk di batas jaringan, bukan kepercayaan buta. Angka tanpa
  // sumber akan lolos ke prompt sebagai angka tanpa asal, dan di situlah
  // pembedaan "mentah vs estimasi" runtuh tanpa ada yang menyadarinya.
  const tanpaSumber = (k.angka ?? []).filter((a) => !['manual', 'sinkron', 'estimasi'].includes(a.sumber));
  if (tanpaSumber.length > 0) {
    throw new KesalahanCoach(`Konteks memuat ${tanpaSumber.length} angka tanpa asal yang dikenal.`, false);
  }

  return k;
}

/** Cari satu angka yang boleh dikutip; `null` bila datanya belum cukup. */
export function angka(k: KonteksCoachRow, kunci: string): AngkaKonteksRow | null {
  return (k.angka ?? []).find((a) => a.kunci === kunci) ?? null;
}

/** Angka mana saja yang merupakan ESTIMASI, untuk dilabeli di layar. */
export function angkaEstimasi(k: KonteksCoachRow): AngkaKonteksRow[] {
  return (k.angka ?? []).filter((a) => a.sumber === 'estimasi');
}

/**
 * Seberapa banyak masukan sebuah angka yang ditaksir, bila diketahui.
 *
 * Penanda `estimasi` saja tidak cukup jujur: "1 dari 23 entri ditaksir" dan
 * "20 dari 23" mendapat penanda yang sama, padahal keduanya keadaan yang sangat
 * berbeda. Server mengirim rinciannya di `dasar.sumber_rincian`; fungsi ini
 * mengangkatnya supaya layar bisa menyebut angkanya, bukan cuma memberi label.
 */
export function porsiTaksiran(angka: AngkaKonteksRow): { ditaksir: number; total: number } | null {
  const r = angka.dasar?.sumber_rincian as { entri_estimasi?: number; total_entri?: number } | undefined;
  if (!r || typeof r.entri_estimasi !== 'number' || typeof r.total_entri !== 'number') {
    return null;
  }
  return { ditaksir: r.entri_estimasi, total: r.total_entri };
}

/**
 * Hasil pemeriksaan sebelum pertanyaan dikirim.
 *
 * `ditolak` berarti pertanyaannya TIDAK dikirim ke mana pun — bukan dikirim lalu
 * jawabannya disaring.
 */
export type PemeriksaanPertanyaan =
  | { ditolak: true; penolakan: PenolakanMedis }
  | { ditolak: false; pertanyaan: string };

/**
 * Periksa pertanyaan terhadap batas medis SEBELUM mengirimnya.
 *
 * Sisi yang paling penting justru yang TIDAK ditolak: app ini memang
 * membicarakan protein, kalori, dan suplemen makanan sepanjang hari, jadi
 * pendeteksi yang terlalu bersemangat akan menolak pertanyaan wajar dan membuat
 * seluruh fiturnya tidak bisa dipakai. Aturannya hidup di `periksaBatasMedis`
 * dan diuji dari dua arah oleh `npm run cek:medis`.
 */
export function periksaPertanyaan(pertanyaan: string): PemeriksaanPertanyaan {
  const penolakan = periksaBatasMedis(pertanyaan);
  if (penolakan) return { ditolak: true, penolakan };
  return { ditolak: false, pertanyaan };
}

/** Jawaban `tanyakanKeCoach`. */
export type HasilTanya =
  | {
      jenis: 'jawaban';
      percakapanId: string;
      pesanId: string | null;
      teks: string;
      rujukan: RujukanData[];
      widget: WidgetCoach[];
    }
  | {
      jenis: 'ditolak';
      penolakan: PenolakanMedis;
      /**
       * Di mana batasnya ditegakkan. `pertanyaan`: di perangkat atau server,
       * sebelum model dipanggil. `jawaban`: model sudah menjawab, tapi
       * jawabannya melewati batas medis dan diganti kartu ini — teks aslinya
       * tidak pernah sampai ke perangkat.
       */
      sumber: 'pertanyaan' | 'jawaban';
      percakapanId: string | null;
      pesanId: string | null;
    };

/**
 * Kirim satu pertanyaan ke coach.
 *
 * Batas medis diperiksa DI SINI lebih dulu: pertanyaan yang ditolak tidak
 * meninggalkan perangkat. Server memeriksanya sekali lagi (untuk klien lama),
 * lalu memeriksa JAWABAN model juga — keduanya pulang sebagai `ditolak`, jadi
 * layar Coach cukup merender satu jenis kartu penolakan.
 *
 * Kuota harian yang habis datang sebagai `KesalahanCoach` yang TIDAK bisa
 * diulang: mencoba lagi dalam semenit tidak mengubah apa pun sampai besok.
 */
export async function tanyakanKeCoach(
  pertanyaan: string,
  percakapanId: string | null = null,
  persenLemak: number | null = null,
): Promise<HasilTanya> {
  // Batas yang sama dengan server & CHECK `pesan_teks_wajar`: ditolak di sini
  // dengan kalimat yang jelas, bukan setelah perjalanan ke server.
  if (pertanyaan.trim().length > MAKS_PERTANYAAN_COACH) {
    throw new KesalahanCoach(
      `Pertanyaannya lebih dari ${formatAngka(MAKS_PERTANYAAN_COACH)} karakter. Persingkat, lalu kirim lagi.`,
      false,
    );
  }
  const periksa = periksaPertanyaan(pertanyaan);
  if (periksa.ditolak) {
    return {
      jenis: 'ditolak',
      penolakan: periksa.penolakan,
      sumber: 'pertanyaan',
      percakapanId,
      pesanId: null,
    };
  }

  const { data, error } = await supabase.functions.invoke('coach-chat', {
    body: { pertanyaan, percakapan_id: percakapanId, persen_lemak: persenLemak },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status ?? 0;
    if (status === 429) {
      throw new KesalahanCoach('Batas pertanyaan hari ini sudah tercapai. Coach bisa ditanya lagi besok.', false);
    }
    if (status === 401) {
      throw new KesalahanCoach('Sesi Anda berakhir. Masuk lagi untuk memakai Coach.', false);
    }
    if (status === 404) {
      throw new KesalahanCoach('Percakapan ini sudah tidak ada. Mulai percakapan baru.', false);
    }
    if (status === 400) {
      throw new KesalahanCoach('Pertanyaan ini belum bisa dikirim. Periksa isinya, lalu kirim lagi.', false);
    }
    throw new KesalahanCoach('Coach sedang tidak bisa dihubungi. Coba lagi.', status === 0 || status >= 500);
  }

  const h = data as {
    ditolak?: boolean;
    sumber_penolakan?: 'jawaban';
    penolakan?: PenolakanMedis;
    percakapan_id?: string;
    pesan_id?: string | null;
    teks?: string;
    rujukan?: RujukanData[];
    widget?: WidgetCoach[];
    galat?: string;
  };

  if (h.ditolak && h.penolakan) {
    return {
      jenis: 'ditolak',
      penolakan: h.penolakan,
      sumber: h.sumber_penolakan === 'jawaban' ? 'jawaban' : 'pertanyaan',
      percakapanId: h.percakapan_id ?? percakapanId,
      pesanId: h.pesan_id ?? null,
    };
  }
  if (typeof h.teks !== 'string' || !h.percakapan_id) {
    // Termasuk penolakan dari model sendiri, yang pulang sebagai 200 + galat.
    throw new KesalahanCoach(h.galat ?? 'Coach tidak mengembalikan jawaban.', true);
  }
  return {
    jenis: 'jawaban',
    percakapanId: h.percakapan_id,
    pesanId: h.pesan_id ?? null,
    teks: h.teks,
    rujukan: h.rujukan ?? [],
    widget: h.widget ?? [],
  };
}

/** Sisa kuota pertanyaan hari ini, untuk ditampilkan sebelum pengguna mengetik. */
export async function kuotaCoach(): Promise<{
  terpakai: number;
  batas: number;
  sisa: number;
  pulihPada: string;
}> {
  const { data, error } = await supabase.rpc('kuota_coach');
  if (error) throw terjemahkan(error);
  const k = data as KuotaCoachRow;
  return { terpakai: k.terpakai, batas: k.batas, sisa: k.sisa, pulihPada: k.pulih_pada };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanCoach {
  switch (error.code) {
    case '22003': // numeric_value_out_of_range — periode TDEE di luar batas
      return new KesalahanCoach(error.message, false);
    case '28000':
    case 'PGRST301':
      return new KesalahanCoach('Sesi Anda berakhir. Masuk lagi untuk memakai Coach.', false);
    default:
      return new KesalahanCoach('Data Coach belum bisa dimuat. Periksa koneksi, lalu coba lagi.', true);
  }
}

/**
 * Daftar utas coach, terbaru dulu (`riwayat_percakapan_saya`). Halaman
 * berikutnya diminta dengan `berikutnya` dari jawaban sebelumnya.
 */
export async function riwayatPercakapan(sebelum: string | null = null, batas = 20): Promise<RiwayatPercakapanRow> {
  const { data, error } = await supabase.rpc('riwayat_percakapan_saya', { p_sebelum: sebelum, p_batas: batas });
  if (error) throw galatRiwayat(error);
  return data as RiwayatPercakapanRow;
}

/**
 * Pesan satu utas dalam urutan tulis (`pesan_percakapan`); halaman yang lebih
 * lama diminta dengan `lebih_lama` dari jawaban sebelumnya.
 */
export async function pesanPercakapan(
  percakapanId: string,
  sebelumUrutan: number | null = null,
  batas = 50,
): Promise<PesanPercakapanRow> {
  const { data, error } = await supabase.rpc('pesan_percakapan', {
    p_percakapan: percakapanId,
    p_sebelum_urutan: sebelumUrutan,
    p_batas: batas,
  });
  if (error) throw galatRiwayat(error);
  return data as PesanPercakapanRow;
}

function galatRiwayat(error: { code?: string; message: string }): KesalahanCoach {
  if (error.code === 'P0002')
    return new KesalahanCoach('Percakapan ini sudah tidak ada. Mulai percakapan baru.', false);
  if (error.code === '28000' || error.code === 'PGRST301') {
    return new KesalahanCoach('Sesi Anda berakhir. Masuk lagi untuk melihat riwayat.', false);
  }
  return new KesalahanCoach(
    /fetch|network|jaringan/i.test(error.message)
      ? 'Riwayat percakapan belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
      : 'Riwayat percakapan belum bisa dimuat. Coba lagi sebentar lagi.',
    true,
  );
}
