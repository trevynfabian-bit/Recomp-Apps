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

/**
 * Fase yang BERLAKU pada satu tanggal — kembaran `fase_pada_tanggal`.
 * Periode yang sudah ditutup adalah sejarah; periode berjalan dan tanggal di
 * luar riwayat mengikuti fase aktif profil (tebakan terbaik yang tersedia).
 */
export function faseSaat(riwayat: PeriodeFase[], tanggal: string, faseAktif: Fase): Fase {
  const periode = riwayat
    .filter((p) => p.mulai <= tanggal && (p.selesai === null || p.selesai >= tanggal))
    .sort((a, b) => b.mulai.localeCompare(a.mulai))[0];
  if (!periode || periode.selesai === null) return faseAktif;
  return periode.fase;
}

/**
 * Jangkar koridor Tren: tanggal mulai periode berjalan dan berat awalnya.
 *
 * Berat awal kosong (belum ada timbangan dalam 7 hari sebelum fase dimulai)
 * jatuh ke timbangan PERTAMA sejak fase dimulai — koridor tetap berangkat dari
 * fase ini, bukan dari fase sebelumnya. Tanpa keduanya `beratKg` null: koridor
 * belum bisa digambar, dan layar harus mengatakannya alih-alih meminjam jangkar
 * lama. `null` seluruhnya hanya bila tidak ada periode berjalan.
 */
export function jangkarKoridor(
  riwayat: PeriodeFase[],
  timbangan: { tanggal: string; berat_pagi_kg: number | null }[],
): { tanggal: string; beratKg: number | null } | null {
  const berjalan = periodeBerjalan(riwayat);
  if (!berjalan) return null;
  if (berjalan.beratAwalKg !== null) return { tanggal: berjalan.mulai, beratKg: berjalan.beratAwalKg };
  const pertama = timbangan
    .filter((t) => t.tanggal >= berjalan.mulai && t.berat_pagi_kg !== null)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))[0];
  return { tanggal: berjalan.mulai, beratKg: pertama ? (pertama.berat_pagi_kg as number) : null };
}
