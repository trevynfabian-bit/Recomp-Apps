import { formatAngka } from './format';
import type {
  BudgetMingguan,
  HariBudget,
  HasilRedistribusi,
  HariRedistribusi,
  OpsiRedistribusi,
} from './tipe';

/**
 * Redistribusi kalori mingguan.
 *
 * Aturan PRD-nya keras dan semuanya ditegakkan di sini, bukan di UI:
 *   • TIDAK otomatis — fungsi ini hanya MENGHITUNG tawaran; penerapan adalah
 *     keputusan pengguna
 *   • maksimal 1x per minggu
 *   • tiap target baru dibulatkan ke 50 kcal
 *   • batas bawah kalori harian tidak pernah dilanggar
 *   • PROTEIN TIDAK PERNAH DIPOTONG — fungsi ini sama sekali tidak menyentuh
 *     makro, hanya kalori
 *
 * Yang dipindah adalah selisih antara sisa jatah dan rencana hari-hari yang
 * belum berjalan. Negatif berarti kelebihan yang sudah terjadi harus ditutup;
 * positif berarti ada jatah menganggur yang boleh dipakai.
 */

/** Semua target baru dibulatkan ke kelipatan ini. */
export const KELIPATAN_KCAL = 50;

/** Berapa kalori yang perlu dipindah agar minggu ini tutup pas di jatahnya. */
export function selisihPerluDipindah(budget: BudgetMingguan): number {
  return budget.sisa - budget.targetMendatang;
}

export function hitungRedistribusi(
  budget: BudgetMingguan,
  opsi: OpsiRedistribusi,
  batasBawahKalori: number,
  /** Tanggal sasaran untuk opsi `tumpuk_satu_hari`. */
  tanggalTumpuk?: string,
): HasilRedistribusi {
  const mendatang = budget.rincian.filter((h) => h.status === 'mendatang');
  const perlu = selisihPerluDipindah(budget);

  const kosong = (alasan: string): HasilRedistribusi => ({
    opsi,
    perluDipindah: perlu,
    terserap: 0,
    tersisa: perlu,
    dibatasiLantai: false,
    alasan,
    hari: mendatang.map((h) => ({
      tanggal: h.tanggal,
      namaTipeHari: h.namaTipeHari,
      targetLama: h.targetKalori,
      targetBaru: h.targetKalori,
      selisih: 0,
      kenaLantai: false,
    })),
  });

  if (opsi === 'abaikan') return kosong('Tidak ada yang diubah.');
  if (mendatang.length === 0) return kosong('Tidak ada hari tersisa untuk diatur.');
  if (perlu === 0) return kosong('Sudah pas — tidak ada yang perlu dipindah.');

  // Bobot penyesuaian per hari: rata, atau seluruhnya ke satu hari.
  const sasaran =
    opsi === 'tumpuk_satu_hari'
      ? tanggalTumpuk ?? mendatang[mendatang.length - 1].tanggal
      : null;

  let dibatasiLantai = false;

  const hari: HariRedistribusi[] = mendatang.map((h) => {
    const bagian =
      opsi === 'sebar_rata'
        ? perlu / mendatang.length
        : h.tanggal === sasaran
          ? perlu
          : 0;

    const mentah = h.targetKalori + bagian;
    // Bulatkan dulu, baru tegakkan lantai — supaya lantai tidak ikut terbulatkan
    // ke bawah dan justru dilanggar.
    const dibulatkan = Math.round(mentah / KELIPATAN_KCAL) * KELIPATAN_KCAL;
    const targetBaru = Math.max(dibulatkan, batasBawahKalori);
    const kenaLantai = targetBaru > dibulatkan;
    if (kenaLantai) dibatasiLantai = true;

    return {
      tanggal: h.tanggal,
      namaTipeHari: h.namaTipeHari,
      targetLama: h.targetKalori,
      targetBaru,
      selisih: targetBaru - h.targetKalori,
      kenaLantai,
    };
  });

  const terserap = hari.reduce((n, h) => n + h.selisih, 0);

  return {
    opsi,
    perluDipindah: perlu,
    terserap,
    // Sisa yang TIDAK terserap karena pembulatan atau lantai; dinyatakan
    // terang-terangan, bukan disembunyikan.
    tersisa: perlu - terserap,
    dibatasiLantai,
    alasan: susunAlasan(opsi, terserap, perlu - terserap, dibatasiLantai, perlu),
    hari,
  };
}

function susunAlasan(
  opsi: OpsiRedistribusi,
  terserap: number,
  tersisa: number,
  dibatasiLantai: boolean,
  perlu: number,
): string {
  const arah = terserap < 0 ? 'dipotong' : 'ditambahkan';
  // Angka di kalimat ini harus diformat sama dengan angka di seluruh app;
  // "1150" di tengah layar penuh "1.150" terbaca seperti angka dari tempat lain.
  const dasar =
    opsi === 'sebar_rata'
      ? `${formatAngka(Math.abs(terserap))} kcal ${arah} rata ke hari yang tersisa`
      : `${formatAngka(Math.abs(terserap))} kcal ${arah} ke satu hari`;

  const catatan: string[] = [];
  if (dibatasiLantai) catatan.push('sebagian tertahan batas bawah kalori harian');

  /*
   * `tersisa` bisa bertanda DUA arah dan artinya berbeda:
   *   • setanda dengan `perlu`  → masih kurang, belum tertutup
   *   • berlawanan tanda        → pembulatan justru melewati yang dibutuhkan
   * Menyebut keduanya "tidak terserap" salah: pada kasus kedua, yang terjadi
   * adalah terpotong LEBIH banyak dari yang perlu.
   */
  if (tersisa !== 0) {
    const kurang = Math.sign(tersisa) === Math.sign(perlu);
    catatan.push(
      kurang
        ? `${formatAngka(Math.abs(tersisa))} kcal belum tertutup karena pembulatan ${KELIPATAN_KCAL} kcal`
        : `${formatAngka(Math.abs(tersisa))} kcal lebih banyak dari yang perlu, akibat pembulatan ${KELIPATAN_KCAL} kcal`,
    );
  }

  return catatan.length > 0 ? `${dasar} — ${catatan.join(', ')}.` : `${dasar}.`;
}

/**
 * Terapkan hasil redistribusi ke daftar hari.
 *
 * Dipisah dari `hitungRedistribusi` dengan sengaja: menghitung tawaran dan
 * menerapkannya adalah dua hal berbeda, dan PRD menuntut penerapan selalu
 * merupakan keputusan pengguna. Memisahkannya juga membuat pratinjau memakai
 * jalur yang SAMA dengan penerapan, jadi yang dilihat pengguna sebelum menekan
 * persis yang ia dapat sesudahnya.
 */
export function terapkanRedistribusi(
  hari: HariBudget[],
  hasil: HasilRedistribusi | null,
): HariBudget[] {
  if (!hasil || hasil.opsi === 'abaikan') return hari;

  const peta = new Map(hasil.hari.map((h) => [h.tanggal, h.targetBaru]));
  return hari.map((h) => {
    const baru = peta.get(h.tanggal);
    if (baru === undefined) return h;
    // Rencana semula disimpan supaya budget mingguan tetap memakai angka itu.
    return { ...h, targetKalori: baru, targetAsliKalori: h.targetAsliKalori ?? h.targetKalori };
  });
}
