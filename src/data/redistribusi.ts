import { supabase } from '@/lib/supabase';
import type { HasilRedistribusi, OpsiRedistribusi } from '@recomp/logika';
import type {
  HasilRedistribusiRow,
  ProteksiProteinRow,
  RedistribusiHariRow,
  RedistribusiMingguanRow,
} from '@/types/database';

/**
 * Akses data redistribusi kalori mingguan.
 *
 * Dua panggilan yang sengaja dipisah, sama seperti di @recomp/logika:
 * MENGHITUNG tawaran dan MENERAPKANNYA. PRD menuntut penerapan selalu
 * keputusan pengguna, dan memisahkannya membuat pratinjau memakai jalur yang
 * SAMA dengan penerapan — yang dilihat pengguna sebelum menekan persis yang ia
 * dapat sesudahnya.
 *
 * Batas bawah kalori harian TIDAK dikirim dari sini. Ia dibaca server dari
 * profil, karena batas yang dikirim klien bukan batas sama sekali: klien bisa
 * mengirim nol. Begitu juga kuota "sekali per pekan" — keduanya ditegakkan di
 * RPC, bukan di layar.
 *
 * Aturan angkanya sama persis dengan `hitungRedistribusi` di @recomp/logika,
 * dan kesamaannya dijaga mesin lewat `npm run cek:paritas`.
 */

export class KesalahanRedistribusi extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanRedistribusi';
  }
}

/** Alasan sebuah tawaran tidak mengubah apa pun. */
export type SebabRedistribusi = NonNullable<HasilRedistribusiRow['sebab']>;

/**
 * Tawaran redistribusi dari server, sudah diterjemahkan ke bentuk TS.
 *
 * `alasan` sengaja DIBUANG dari bentuk ini: server mengirim kode `sebab`, bukan
 * kalimat. Kalimatnya disusun `hitungRedistribusi` di @recomp/logika supaya
 * angka di dalamnya diformat sama dengan angka di seluruh app — satu penyusun
 * kalimat, bukan dua yang bisa berbeda tanda baca.
 */
export type TawaranRedistribusi = Omit<HasilRedistribusi, 'alasan'> & {
  mingguMulai: string;
  hariIni: string;
  /** Batas bawah kalori harian yang DIPAKAI server saat menghitung. */
  batasBawahKalori: number;
  kelipatanKcal: number;
  /** `null` berarti tawarannya memang mengubah sesuatu. */
  sebab: SebabRedistribusi | null;
  /** Hanya terisi pada hasil penerapan. */
  diterapkan: boolean;
  redistribusiId: string | null;
};

/** Bukti per hari bahwa hanya kalori yang bergeser. */
export type BuktiProteksiProtein = {
  mingguMulai: string;
  hariIni: string;
  /** false bila ada hari diredistribusi yang proteinnya di bawah rencana. */
  utuh: boolean;
  /** Status pemicu database yang menolak penurunan target protein. */
  penjagaAktif: boolean;
  jumlahDiredistribusi: number;
  /** Jumlah pergeseran kalori sepekan; negatif berarti dipotong. */
  kaloriDipindah: number;
  hari: {
    tanggal: string;
    namaTipeHari: string;
    diredistribusi: boolean;
    kaloriSebelum: number;
    kaloriSesudah: number;
    selisihKalori: number;
    proteinG: number | null;
    proteinRencanaG: number | null;
    /** Selalu 0 — dan justru itu yang ingin diperlihatkan. */
    selisihProtein: number;
    proteinDiBawahRencana: boolean;
  }[];
};

/**
 * Hitung tawaran redistribusi tanpa mengubah apa pun.
 *
 * @param tanggal tanggal acuan PEKAN; `null` berarti pekan ini.
 * @param opsi cara menangani selisihnya.
 * @param tanggalTumpuk sasaran untuk `tumpuk_satu_hari`; `null` berarti hari
 *   terakhir pekan.
 * @param hariIni acuan "hari ini"; `null` berarti hari ini menurut
 *   Asia/Jakarta, dihitung SERVER supaya tidak bergantung jam perangkat.
 */
export async function pratinjauRedistribusi(
  tanggal: string | null = null,
  opsi: OpsiRedistribusi = 'sebar_rata',
  tanggalTumpuk: string | null = null,
  hariIni: string | null = null,
): Promise<TawaranRedistribusi> {
  const { data, error } = await supabase.rpc('hitung_redistribusi', {
    p_tanggal: tanggal,
    p_opsi: opsi,
    p_tanggal_tumpuk: tanggalTumpuk,
    p_hari_ini: hariIni,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanRedistribusi('Server tidak mengembalikan tawaran.', true);
  return keBentukTs(data as HasilRedistribusiRow);
}

/**
 * Terapkan tawaran redistribusi ke pekan itu.
 *
 * Berbeda dari `terapkanRedistribusi` di @recomp/logika, yang menerapkan hasil
 * ke daftar hari DI MEMORI untuk pratinjau: fungsi ini menulis target baru ke
 * server beserta jejaknya.
 *
 * @param alasan catatan untuk jejak. Kalimatnya disusun
 *   `hitungRedistribusi().alasan` di @recomp/logika supaya angka di dalamnya
 *   diformat sama dengan angka di seluruh app, dan disimpan apa adanya.
 */
export async function terapkanRedistribusiPekan(
  tanggal: string | null = null,
  opsi: OpsiRedistribusi = 'sebar_rata',
  tanggalTumpuk: string | null = null,
  hariIni: string | null = null,
  alasan: string | null = null,
): Promise<TawaranRedistribusi> {
  const { data, error } = await supabase.rpc('terapkan_redistribusi', {
    p_tanggal: tanggal,
    p_opsi: opsi,
    p_tanggal_tumpuk: tanggalTumpuk,
    p_hari_ini: hariIni,
    p_alasan: alasan,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanRedistribusi('Server tidak mengembalikan hasil.', true);
  return keBentukTs(data as HasilRedistribusiRow);
}

/**
 * Bukti bahwa redistribusi hanya menggeser KALORI.
 *
 * PRD menyebut "protein tidak pernah dipotong" sebagai aturan keras, dan klaim
 * seperti itu tidak layak ditampilkan sebagai kalimat saja. Yang dikembalikan
 * di sini adalah angkanya: rencana semula vs yang berlaku per hari, target
 * protein yang tidak ikut bergeser, dan status pemicu database yang
 * menegakkannya (`penjagaAktif`) — supaya UI bisa menunjukkan aturannya sedang
 * BERLAKU, bukan sedang benar kebetulan.
 */
export async function proteksiProtein(
  tanggal: string | null = null,
  hariIni: string | null = null,
): Promise<BuktiProteksiProtein> {
  const { data, error } = await supabase.rpc('proteksi_protein', {
    p_tanggal: tanggal,
    p_hari_ini: hariIni,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanRedistribusi('Server tidak mengembalikan bukti proteksi.', true);

  const j = data as ProteksiProteinRow;
  return {
    mingguMulai: j.minggu_mulai,
    hariIni: j.hari_ini,
    utuh: j.utuh,
    penjagaAktif: j.penjaga_aktif,
    jumlahDiredistribusi: j.jumlah_diredistribusi,
    kaloriDipindah: j.kalori_dipindah,
    hari: j.rincian.map((h) => ({
      tanggal: h.tanggal,
      namaTipeHari: h.nama_tipe_hari ?? 'Tanpa tipe hari',
      diredistribusi: h.diredistribusi,
      kaloriSebelum: h.kalori_rencana,
      kaloriSesudah: h.kalori_berlaku,
      selisihKalori: h.selisih_kalori,
      proteinG: h.protein_g === null ? null : Number(h.protein_g),
      proteinRencanaG: h.protein_rencana === null ? null : Number(h.protein_rencana),
      selisihProtein: h.selisih_protein,
      proteinDiBawahRencana: h.protein_di_bawah_rencana,
    })),
  };
}

/** Jejak penerapan redistribusi, terbaru lebih dulu. */
export async function riwayatRedistribusi(batas = 12): Promise<RedistribusiMingguanRow[]> {
  const { data, error } = await supabase
    .from('redistribusi_mingguan')
    .select('*')
    .order('minggu_mulai', { ascending: false })
    .limit(batas);

  if (error) throw terjemahkan(error);
  return data ?? [];
}

/** Perubahan per hari dari satu penerapan. */
export async function rincianPenerapan(
  redistribusiId: string,
): Promise<RedistribusiHariRow[]> {
  const { data, error } = await supabase
    .from('redistribusi_hari')
    .select('*')
    .eq('redistribusi_id', redistribusiId)
    .order('tanggal', { ascending: true });

  if (error) throw terjemahkan(error);
  return data ?? [];
}

function keBentukTs(j: HasilRedistribusiRow): TawaranRedistribusi {
  return {
    opsi: j.opsi,
    perluDipindah: j.perlu_dipindah,
    terserap: j.terserap,
    tersisa: j.tersisa,
    dibatasiLantai: j.dibatasi_lantai,
    hari: j.hari.map((h) => ({
      tanggal: h.tanggal,
      namaTipeHari: h.nama_tipe_hari ?? 'Tanpa tipe hari',
      targetLama: h.target_lama,
      targetBaru: h.target_baru,
      selisih: h.selisih,
      kenaLantai: h.kena_lantai,
    })),
    mingguMulai: j.minggu_mulai,
    hariIni: j.hari_ini,
    batasBawahKalori: j.batas_bawah_kalori,
    kelipatanKcal: j.kelipatan_kcal,
    sebab: j.sebab,
    diterapkan: j.diterapkan ?? false,
    redistribusiId: j.redistribusi_id ?? null,
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanRedistribusi {
  switch (error.code) {
    case '23505': // unique_violation — kuota sekali per pekan
      return new KesalahanRedistribusi(
        'Budget pekan ini sudah pernah diatur. Redistribusi hanya bisa sekali per pekan.',
        false,
      );
    case '23502': // not_null_violation — profil belum lengkap
      return new KesalahanRedistribusi('Profil belum punya batas bawah kalori.', false);
    case '23503': // foreign_key_violation — belum punya tipe hari bawaan
      return new KesalahanRedistribusi('Profil belum punya tipe hari bawaan.', false);
    case '23514': // check_violation
      return new KesalahanRedistribusi('Nilai yang diminta ditolak database.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanRedistribusi(
        'Sesi Anda berakhir. Masuk lagi untuk mengatur budget.',
        false,
      );
    default:
      return new KesalahanRedistribusi(
        'Gagal mengatur budget. Periksa koneksi lalu coba lagi.',
        true,
      );
  }
}
