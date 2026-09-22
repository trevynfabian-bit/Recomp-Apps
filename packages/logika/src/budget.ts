import type {
  BarisKumulatif,
  BudgetMingguan,
  HariBudget,
  LajuBudget,
  RingkasanHariBudget,
} from './tipe';
import { majuHari } from './tren';

/**
 * Budget kalori mingguan.
 *
 * Budget mingguan BUKAN angka tetap: ia jumlah target harian sepanjang minggu,
 * dan target harian sendiri bergantung tipe hari. Minggu berisi dua hari
 * Beban+Lari punya budget lebih besar daripada minggu penuh Rest — itu memang
 * yang diinginkan, bukan kebocoran.
 *
 * Gunanya: satu hari yang kelebihan tidak otomatis merusak minggu. Yang dilihat
 * adalah sisa jatah sampai akhir minggu.
 */

/** Minggu dimulai Senin, sesuai skema `weekly_budgets.minggu_mulai`. */
export function awalMinggu(tanggal: string): string {
  const [y, m, d] = tanggal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 = Minggu. Geser supaya Senin jadi awal.
  const geser = (t.getUTCDay() + 6) % 7;
  return majuHari(tanggal, -geser);
}

/** Tujuh tanggal dalam minggu yang memuat `tanggal`, Senin → Minggu. */
export function hariDalamMinggu(tanggal: string): string[] {
  const senin = awalMinggu(tanggal);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => majuHari(senin, i));
}

/**
 * Hitung budget mingguan dari target & konsumsi tiap hari.
 *
 * @param hari tujuh hari minggu ini beserta target dan konsumsinya
 * @param hariIni tanggal acuan; hari sesudahnya dianggap belum terjadi
 */
export function budgetMingguan(hari: HariBudget[], hariIni: string): BudgetMingguan {
  const rincian: RingkasanHariBudget[] = hari.map((h) => {
    const lampau = h.tanggal < hariIni;
    const iniHariIni = h.tanggal === hariIni;
    return {
      ...h,
      status: lampau ? 'lampau' : iniHariIni ? 'hari ini' : 'mendatang',
      // Selisih hanya bermakna untuk hari yang sudah/sedang berjalan.
      selisih: lampau || iniHariIni ? bulatkan(h.terpakaiKalori - h.targetKalori, 0) : null,
    };
  });

  const budgetTotal = rincian.reduce((n, h) => n + h.targetKalori, 0);
  const terpakai = rincian
    .filter((h) => h.status !== 'mendatang')
    .reduce((n, h) => n + h.terpakaiKalori, 0);

  // Jatah hari yang belum terjadi; dipakai untuk menghitung sisa per hari.
  const mendatang = rincian.filter((h) => h.status === 'mendatang');
  const targetMendatang = mendatang.reduce((n, h) => n + h.targetKalori, 0);

  const sisa = budgetTotal - terpakai;

  /*
   * Hari ini SENGAJA tidak dihitung sebagai hari tersisa. Konsumsi hari ini
   * sudah ikut dikurangkan dari `sisa`, jadi memberinya jatah lagi berarti
   * menghitungnya dua kali dan membuat "bila dibagi rata" tampak lebih longgar
   * dari yang sebenarnya. Sisa itu jatah untuk hari-hari yang BELUM berjalan.
   */
  const hariTersisa = mendatang.length;

  return {
    mingguMulai: rincian[0]?.tanggal ?? hariIni,
    budgetTotal,
    terpakai,
    sisa,
    hariTersisa,
    targetMendatang,
    /** Rata-rata kalori per hari bila sisa dibagi rata ke hari yang tersisa. */
    sisaPerHari: hariTersisa > 0 ? Math.round(sisa / hariTersisa) : null,
    /** Rata-rata jatah per hari menurut rencana semula, untuk pembanding. */
    rencanaPerHari: hariTersisa > 0 ? Math.round(targetMendatang / hariTersisa) : null,
    rincian,
  };
}

function bulatkan(nilai: number, desimal: number): number {
  const f = 10 ** desimal;
  return Math.round(nilai * f) / f;
}

/**
 * Apakah pemakaian budget SESUAI LAJU untuk titik minggu ini.
 *
 * Sisa saja tidak cukup. "Sisa 13.580 kcal" terdengar banyak, padahal maknanya
 * bergantung hari ini hari ke berapa. Yang menjawab adalah membandingkan yang
 * sudah terpakai dengan yang SEHARUSNYA sudah terpakai sampai titik ini.
 *
 * Pembandingnya memakai jumlah TARGET hari-hari yang sudah berjalan, bukan
 * proporsi hari (2 dari 7). Target harian berbeda-beda, jadi proporsi hari akan
 * menyesatkan pada minggu yang hari beratnya menumpuk di awal atau akhir.
 */
export function lajuBudget(budget: BudgetMingguan, ambangKcal = 300): LajuBudget {
  const berjalan = budget.rincian.filter((h) => h.status !== 'mendatang');
  const seharusnya = berjalan.reduce((n, h) => n + h.targetKalori, 0);

  if (berjalan.length === 0) {
    return { seharusnya: 0, selisih: 0, status: 'belum mulai', ambangKcal };
  }

  const selisih = budget.terpakai - seharusnya;
  if (Math.abs(selisih) <= ambangKcal) {
    return { seharusnya, selisih, status: 'sesuai laju', ambangKcal };
  }
  return {
    seharusnya,
    selisih,
    status: selisih > 0 ? 'lebih cepat' : 'lebih lambat',
    ambangKcal,
  };
}

/**
 * Rincian kumulatif: bagaimana jatah minggu ini terkuras hari demi hari.
 *
 * Kolom sisa BERJALAN inilah yang membuat pola terlihat. Daftar per hari saja
 * hanya menunjukkan angka satuan; yang ingin dijawab pengguna adalah "setelah
 * Selasa, tinggal berapa?" — dan itu butuh akumulasi.
 *
 * Hari yang belum berjalan memakai TARGET-nya sebagai proyeksi, ditandai
 * `proyeksi: true`, supaya jelas mana catatan dan mana perkiraan.
 */
export function rincianKumulatif(budget: BudgetMingguan): BarisKumulatif[] {
  let terpakaiKumulatif = 0;
  let proyeksiKumulatif = 0;

  return budget.rincian.map((h) => {
    const proyeksi = h.status === 'mendatang';
    // Hari mendatang diproyeksikan memakai targetnya, bukan nol.
    const nilai = proyeksi ? h.targetKalori : h.terpakaiKalori;

    if (!proyeksi) terpakaiKumulatif += nilai;
    proyeksiKumulatif += nilai;

    return {
      ...h,
      proyeksi,
      nilaiKalori: nilai,
      kumulatif: proyeksiKumulatif,
      // Sisa setelah hari ini; negatif berarti jatah minggu sudah terlampaui.
      sisaBerjalan: budget.budgetTotal - proyeksiKumulatif,
      terpakaiSampaiSini: terpakaiKumulatif,
    };
  });
}
