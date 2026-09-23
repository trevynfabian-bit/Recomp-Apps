// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
/**
 * Riwayat fase program: kembaran TypeScript dari RPC `ganti_fase`.
 *
 * Aturannya sama persis dengan database, karena app memakainya untuk dua hal
 * yang tidak boleh berbeda pendapat dengan server:
 *   • pratinjau di sheet konfirmasi ("periode Lean Gain 9–22 Sep ditutup"),
 *     yang harus menyebut apa yang BENAR-BENAR akan terjadi;
 *   • state tiruan sebelum backend tersambung.
 *
 * Empat kasus `ganti_fase`:
 *   1. tanggal menabrak periode yang sudah ditutup → ditolak (riwayat tidak
 *      ditulis ulang);
 *   2. fase sama dengan periode berjalan → tidak ada yang berubah;
 *   3. periode berjalan dimulai pada/sesudah tanggal itu → periode itu DIGANTI
 *      (tidak pernah berlaku sehari penuh; menutupnya menghasilkan periode nol
 *      hari);
 *   4. selain itu → periode berjalan ditutup kemarin, periode baru dibuka.
 */
import type { Fase } from './tipe.ts';
import { mundurHari } from './tren.ts';

export type PeriodeFase = {
  fase: Fase;
  /** YYYY-MM-DD */
  mulai: string;
  /** YYYY-MM-DD; null = periode yang sedang berjalan (tepat satu). */
  selesai: string | null;
  /** Rata-rata 7 hari saat periode dimulai; jangkar koridor Tren. */
  beratAwalKg: number | null;
};

export type HasilGantiFase =
  | { jenis: 'ditolak'; alasan: string }
  | { jenis: 'tetap'; riwayat: PeriodeFase[] }
  | { jenis: 'diganti'; riwayat: PeriodeFase[]; diganti: PeriodeFase; baru: PeriodeFase }
  | { jenis: 'ditutup'; riwayat: PeriodeFase[]; ditutup: PeriodeFase | null; baru: PeriodeFase };

export function periodeBerjalan(riwayat: PeriodeFase[]): PeriodeFase | null {
  return riwayat.find((p) => p.selesai === null) ?? null;
}

/** Terapkan pergantian fase pada riwayat (urutan riwayat: lama → baru). */
export function terapkanGantiFase(
  riwayat: PeriodeFase[],
  faseBaru: Fase,
  tanggal: string,
  beratAwalKg: number | null,
): HasilGantiFase {
  if (riwayat.some((p) => p.selesai !== null && tanggal <= p.selesai)) {
    return { jenis: 'ditolak', alasan: 'Tanggal mulai jatuh di periode fase yang sudah selesai.' };
  }

  const berjalan = periodeBerjalan(riwayat);
  if (berjalan && berjalan.fase === faseBaru && tanggal >= berjalan.mulai) {
    return { jenis: 'tetap', riwayat };
  }

  const baru: PeriodeFase = { fase: faseBaru, mulai: tanggal, selesai: null, beratAwalKg };

  if (berjalan && tanggal <= berjalan.mulai) {
    return {
      jenis: 'diganti',
      riwayat: riwayat.map((p) => (p === berjalan ? baru : p)),
      diganti: berjalan,
      baru,
    };
  }

  const ditutup = berjalan ? { ...berjalan, selesai: mundurHari(tanggal, 1) } : null;
  return {
    jenis: 'ditutup',
    riwayat: [...riwayat.map((p) => (p === berjalan ? (ditutup as PeriodeFase) : p)), baru],
    ditutup,
    baru,
  };
}
