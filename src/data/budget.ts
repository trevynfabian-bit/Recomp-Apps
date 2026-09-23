import { supabase } from '@/lib/supabase';
import { rincianKumulatif } from '@recomp/logika';
import type {
  BarisKumulatif,
  BudgetMingguan,
  Fase,
  LajuBudget,
  RingkasanHariBudget,
} from '@recomp/logika';
import type {
  BudgetMingguanRow,
  EndpointBudgetRow,
  TargetHarianRow,
} from '@/types/database';

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
  const budget = keBudgetTs(j);

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

/** Ubah jawaban `budget_mingguan` menjadi bentuk TS paket bersama. */
function keBudgetTs(j: BudgetMingguanRow): BudgetMingguan {
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

  return {
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
}

/**
 * Satu snapshot untuk SELURUH layar Budget.
 *
 * Dipanggil sekali, bukan lima kali. Alasannya bukan kecepatan: catatan makan
 * yang masuk di antara dua panggilan menghasilkan layar yang angkanya tidak
 * cocok satu sama lain — sisa pekan mengatakan satu hal, tawaran redistribusi
 * mengatakan hal lain — dan ketidakcocokan seperti itu tidak akan pernah bisa
 * direproduksi saat dilaporkan.
 *
 * `kumulatif` dihitung DI SINI dari `budget.rincian` yang baru saja diterima.
 * Itu bukan pengecualian dari aturan "angka dari server": ia turunan murni dari
 * data yang sama, jadi tidak ada aturan baru yang bisa menyimpang — dan
 * menaruhnya di SQL hanya menambah satu paritas lagi untuk dijaga.
 */
export type SnapshotLayarBudget = {
  hariIni: string;
  mingguMulai: string;
  fase: Fase;
  budget: BudgetMingguan;
  laju: LajuBudget;
  kumulatif: BarisKumulatif[];
  /** `null` bila pengguna belum punya tipe hari sama sekali. */
  targetHariIni: {
    namaTipeHari: string;
    fase: Fase;
    override: boolean;
    targetKalori: number | null;
    targetProteinG: number | null;
    targetLemakG: number | null;
    batasSatFatG: number | null;
  } | null;
  redistribusi: {
    /** true bila kuota pekan ini sudah terpakai; sekali per pekan. */
    kuotaTerpakai: boolean;
    /** Pratinjau `sebar_rata` dari server; belum diterapkan. */
    tawaran: EndpointBudgetRow['redistribusi']['tawaran'];
    penerapanTerakhir: EndpointBudgetRow['redistribusi']['penerapan_terakhir'];
  };
  proteksiProtein: { utuh: boolean; penjagaAktif: boolean; kaloriDipindah: number };
  tdee: EndpointBudgetRow['tdee'];
};

export async function snapshotLayarBudget(
  tanggal: string | null = null,
  hariIni: string | null = null,
  ambangKcal = 300,
  persenLemak: number | null = null,
): Promise<SnapshotLayarBudget> {
  const { data, error } = await supabase.rpc('endpoint_budget_mingguan', {
    p_tanggal: tanggal,
    p_hari_ini: hariIni,
    p_ambang_kcal: ambangKcal,
    p_persen_lemak: persenLemak,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanBudget('Server tidak mengembalikan data budget.', true);

  const j = data as EndpointBudgetRow;
  const budget = keBudgetTs(j.budget);
  const t: Omit<TargetHarianRow, 'day_type_id'> | null = j.target_hari_ini;

  return {
    hariIni: j.hari_ini,
    mingguMulai: j.minggu_mulai,
    fase: j.fase,
    budget,
    laju: {
      seharusnya: j.budget.laju.seharusnya,
      selisih: j.budget.laju.selisih,
      status: j.budget.laju.status,
      ambangKcal: j.budget.laju.ambang_kcal,
    },
    kumulatif: rincianKumulatif(budget),
    targetHariIni: t
      ? {
          namaTipeHari: t.nama_tipe_hari,
          fase: t.fase,
          override: t.override,
          targetKalori: t.target_kalori,
          targetProteinG: t.target_protein_g === null ? null : Number(t.target_protein_g),
          targetLemakG: t.target_lemak_g === null ? null : Number(t.target_lemak_g),
          batasSatFatG: t.batas_sat_fat_g === null ? null : Number(t.batas_sat_fat_g),
        }
      : null,
    redistribusi: {
      kuotaTerpakai: j.redistribusi.kuota_terpakai,
      tawaran: j.redistribusi.tawaran,
      penerapanTerakhir: j.redistribusi.penerapan_terakhir,
    },
    proteksiProtein: {
      utuh: j.proteksi_protein.utuh,
      penjagaAktif: j.proteksi_protein.penjaga_aktif,
      kaloriDipindah: j.proteksi_protein.kalori_dipindah,
    },
    tdee: j.tdee,
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
