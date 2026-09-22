import { supabase } from '@/lib/supabase';
import { rincianKumulatif } from '@recomp/logika';
import type {
  BarisKumulatif,
  BudgetMingguan,
  LajuBudget,
  RingkasanHariBudget,
} from '@recomp/logika';
import type { BudgetMingguanRow } from '@/types/database';

/**
 * Akses data budget kalori mingguan.
 *
 * Angka budget dihitung SERVER lewat `budget_mingguan`, bukan di klien dari
 * tujuh baris `daily_logs`. Alasannya sama dengan tren, dan sama kuatnya:
 * widget lock screen dan AI coach membaca angka yang sama, dan keduanya tidak
 * bisa menjalankan TypeScript. Kalau aturannya hanya hidup di klien, widget
 * akan menampilkan sisa yang dihitung dengan aturan lain — dan selisih 200 kkal
 * antara app dan widget adalah jenis bug yang tidak pernah dilaporkan, hanya
 * membuat orang berhenti percaya pada budgetnya.
 *
 * `@recomp/logika` tetap memegang aturan yang sama untuk web dashboard, dan
 * kesamaannya dijaga mesin lewat `npm run cek:paritas`. Yang TIDAK dihitung
 * ulang di sini cuma agregasi; `rincianKumulatif` memang dijalankan lokal
 * karena ia murni turunan dari rincian yang baru saja diterima — tidak ada
 * aturan baru yang bisa menyimpang darinya.
 */

export class KesalahanBudget extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanBudget';
  }
}

/** Bentuk siap pakai layar Budget, sudah diterjemahkan dari JSON SQL. */
export type SnapshotBudget = BudgetMingguan & {
  /** Tanggal yang dianggap "hari ini" oleh server. */
  hariIni: string;
  laju: LajuBudget;
  /** Sisa berjalan hari demi hari; hari mendatang diproyeksikan dari target. */
  kumulatif: BarisKumulatif[];
};

/**
 * Budget pekan yang memuat `tanggal`.
 *
 * @param tanggal tanggal acuan PEKAN; `null` berarti pekan ini.
 * @param hariIni acuan "hari ini"; `null` berarti hari ini menurut
 *   Asia/Jakarta, dihitung SERVER supaya tidak bergantung jam perangkat.
 *   Dipisah dari `tanggal` supaya pekan yang seluruhnya masih di depan bisa
 *   ditampilkan sebagai rencana (`belum mulai`), bukan sebagai pekan yang
 *   tertinggal jauh dari lajunya.
 * @param ambangKcal selisih yang masih dianggap sesuai laju.
 */
export async function snapshotBudget(
  tanggal: string | null = null,
  hariIni: string | null = null,
  ambangKcal = 300,
): Promise<SnapshotBudget> {
  const { data, error } = await supabase.rpc('budget_mingguan', {
    p_tanggal: tanggal,
    p_hari_ini: hariIni,
    p_ambang_kcal: ambangKcal,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanBudget('Server tidak mengembalikan budget.', true);

  const j = data as BudgetMingguanRow;

  const rincian: RingkasanHariBudget[] = j.rincian.map((h) => ({
    tanggal: h.tanggal,
    // Hari tanpa tipe hari sama sekali tidak pernah terjadi lewat RPC-nya
    // (ada tipe hari bawaan), tapi UI tidak boleh ikut ambruk kalau terjadi.
    namaTipeHari: h.nama_tipe_hari ?? 'Tanpa tipe hari',
    targetKalori: h.target_kalori,
    targetAsliKalori: h.target_asli_kalori ?? undefined,
    terpakaiKalori: h.terpakai_kalori,
    targetProteinG: h.target_protein_g,
    status: h.status,
    selisih: h.selisih,
  }));

  const budget: BudgetMingguan = {
    mingguMulai: j.minggu_mulai,
    budgetTotal: j.budget_total,
    terpakai: j.terpakai,
    sisa: j.sisa,
    hariTersisa: j.hari_tersisa,
    targetMendatang: j.target_mendatang,
    sisaPerHari: j.sisa_per_hari,
    rencanaPerHari: j.rencana_per_hari,
    rincian,
  };

  return {
    ...budget,
    hariIni: j.hari_ini,
    laju: {
      seharusnya: j.laju.seharusnya,
      selisih: j.laju.selisih,
      status: j.laju.status,
      ambangKcal: j.laju.ambang_kcal,
    },
    kumulatif: rincianKumulatif(budget),
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanBudget {
  switch (error.code) {
    case '22003': // numeric_value_out_of_range — ambang negatif
      return new KesalahanBudget('Ambang laju tidak boleh negatif.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanBudget('Sesi Anda berakhir. Masuk lagi untuk melihat budget.', false);
    default:
      return new KesalahanBudget('Gagal memuat budget. Periksa koneksi lalu coba lagi.', true);
  }
}
