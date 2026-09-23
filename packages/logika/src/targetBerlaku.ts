/**
 * Target absolut yang BERLAKU untuk satu hari — satu aturan untuk web, app,
 * dan server.
 *
 * Kembaran SQL-nya `ambil_target_harian(tanggal)`; keduanya dijaga sama oleh
 * `npm run cek:paritas`. Aturannya:
 *
 *   1. Tipe hari: yang tercatat di catatan hari itu (pilihan manual atau hasil
 *      auto-deteksi) bila masih ada di daftar; bila belum tercatat atau tipe
 *      harinya sudah dihapus, tipe hari BAWAAN. Tanpa tipe bawaan: tidak ada
 *      target yang bisa disebut berlaku (`null`).
 *   2. Fase: yang tersimpan di catatan hari itu; bila belum ada, fase yang
 *      berlaku pada tanggal itu (`faseSaat`, dihitung pemanggil).
 *   3. Angka: snapshot di catatan hari itu — hari yang sudah lewat memegang
 *      angka yang berlaku SAAT ITU, bukan target yang disunting sesudahnya.
 *      Tanpa snapshot, target tabel untuk (tipe hari x fase) itu. Tanpa
 *      keduanya: "belum diisi" — TIDAK ada cadangan dari tipe hari atau fase
 *      lain, karena angka pinjaman adalah angka salah yang tampak benar.
 */
import type { NilaiTarget } from './targetHarian';
import type { DayType, Fase } from './tipe';

/** Satu baris target absolut (tipe hari x fase), bentuk `day_type_targets`. */
export type BarisTarget = NilaiTarget & { day_type_id: string; fase: Fase };

/** Bagian catatan harian (`daily_logs`) yang menentukan target hari itu. */
export type SnapshotTargetHari = {
  day_type_id: string | null;
  day_type_override: boolean;
  fase: Fase | null;
  target_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
};

export type TargetBerlaku = {
  tipeHari: DayType;
  /** Tipe hari dipilih manual (bukan auto-deteksi atau bawaan). */
  override: boolean;
  fase: Fase;
  /** Dari mana angkanya: snapshot catatan hari itu, tabel target, atau belum ada. */
  asal: 'snapshot' | 'target' | 'belum-diisi';
  nilai: NilaiTarget | null;
};

/**
 * Tipe hari yang berlaku untuk sebuah pilihan: pilihan itu bila masih ada di
 * daftar, selain itu tipe hari bawaan; `null` bila keduanya tidak ada.
 */
export function tipeHariBerlaku(tipeHari: DayType[], dayTypeId: string | null): DayType | null {
  return (
    (dayTypeId !== null ? tipeHari.find((d) => d.id === dayTypeId) : undefined) ??
    tipeHari.find((d) => d.is_default) ??
    null
  );
}

/** Baris target untuk (tipe hari x fase), atau `null` — tanpa cadangan. */
export function cariBarisTarget<T extends BarisTarget>(target: T[], dayTypeId: string, fase: Fase): T | null {
  return target.find((t) => t.day_type_id === dayTypeId && t.fase === fase) ?? null;
}

export function targetBerlaku(m: {
  tipeHari: DayType[];
  target: BarisTarget[];
  /** Catatan hari itu, bila sudah ada. */
  snapshot: SnapshotTargetHari | null;
  /** Fase yang berlaku pada tanggal itu, untuk hari yang belum tercatat. */
  faseTanggal: Fase;
}): TargetBerlaku | null {
  const s = m.snapshot;
  const tipe = tipeHariBerlaku(m.tipeHari, s?.day_type_id ?? null);
  if (!tipe) return null;
  const fase = s?.fase ?? m.faseTanggal;
  const baris = cariBarisTarget(m.target, tipe.id, fase);

  // Per kolom seperti `coalesce(snapshot, tabel)` di SQL: kolom snapshot
  // selalu ditulis bersamaan, jadi dalam praktiknya semuanya atau tidak sama sekali.
  const ambil = (k: keyof NilaiTarget): number | null => s?.[k] ?? baris?.[k] ?? null;
  const kalori = ambil('target_kalori');
  const protein = ambil('target_protein_g');
  const lemak = ambil('target_lemak_g');
  const satFat = ambil('batas_sat_fat_g');
  const lengkap = kalori !== null && protein !== null && lemak !== null && satFat !== null;

  return {
    tipeHari: tipe,
    override: s?.day_type_override ?? false,
    fase,
    asal: !lengkap ? 'belum-diisi' : s?.target_kalori != null ? 'snapshot' : 'target',
    nilai: lengkap
      ? { target_kalori: kalori, target_protein_g: protein, target_lemak_g: lemak, batas_sat_fat_g: satFat }
      : null,
  };
}
