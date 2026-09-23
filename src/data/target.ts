import { RENTANG_TARGET } from '@recomp/logika';
import type { DayType, Fase, NilaiTarget } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import type { TargetApiRow } from '@/types/database';
import type { DayTypeTarget } from '@/types/domain';

/**
 * Akses target per tipe hari: `muat_target` dan `simpan_target` (RPC).
 *
 * Satu panggilan memuat tipe hari DAN seluruh targetnya (tiap tipe hari x
 * tiap fase), supaya keduanya tidak pernah terbaca dari dua saat berbeda.
 * Simpan mengirim beberapa target sekaligus dan server menerapkannya semua
 * atau tidak sama sekali; aturan isiannya sama dengan `periksaTarget`, dijaga
 * tabelnya sendiri (lihat migrasi skema_target_preferensi).
 *
 * Berlaku mulai hari ini: server menyegarkan snapshot hari ini dan hari
 * mendatang yang sudah tercatat, kecuali hari yang kalorinya sudah
 * diredistribusi — jumlahnya dikembalikan supaya layar bisa mengatakannya.
 */

export class KesalahanTarget extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
    /** `konflik`: target sudah diubah di perangkat lain sejak dimuat. */
    readonly kode: 'konflik' | null = null,
  ) {
    super(pesan);
    this.name = 'KesalahanTarget';
  }
}

export type PerubahanTarget = {
  day_type_id: string;
  fase: Fase;
  nilai: NilaiTarget;
  /** Waktu baris terakhir berubah saat dimuat; bila berbeda di server, simpanan ditolak. */
  diperbarui_pada?: string;
};

export type DataTarget = { tipeHari: DayType[]; target: DayTypeTarget[] };

export type HasilSimpanTarget = {
  /** Baris yang tersimpan, apa adanya dari server. */
  target: DayTypeTarget[];
  /** YYYY-MM-DD (Asia/Jakarta). */
  berlakuMulai: string;
  hariDisegarkan: number;
  /** Hari ini/mendatang yang sudah diredistribusi: tetap memakai angka redistribusinya. */
  hariDiredistribusiTetap: number;
};

function keTarget(b: TargetApiRow): DayTypeTarget {
  return {
    id: b.id,
    day_type_id: b.day_type_id,
    fase: b.fase,
    target_kalori: Number(b.target_kalori),
    target_protein_g: Number(b.target_protein_g),
    target_lemak_g: Number(b.target_lemak_g),
    batas_sat_fat_g: Number(b.batas_sat_fat_g),
    diperbarui_pada: b.updated_at,
  };
}

export async function muatTarget(): Promise<DataTarget> {
  const { data, error } = await supabase.rpc('muat_target');
  if (error) throw terjemahkan(error, 'muat');
  return {
    tipeHari: data.tipe_hari.map(({ id, nama, auto_detect, is_default }) => ({ id, nama, auto_detect, is_default })),
    target: data.target.map(keTarget),
  };
}

/**
 * Target satu (tipe hari x fase) langsung dari server, tanpa memuat semuanya.
 * `null` bila belum diisi — tanpa cadangan dari tipe hari atau fase lain.
 * Tanpa `fase`, fase yang berlaku hari ini.
 */
export async function ambilTarget(
  dayTypeId: string,
  fase?: Fase,
): Promise<{ fase: Fase; target: DayTypeTarget | null; karboG: number | null }> {
  const { data, error } = await supabase.rpc('ambil_target', { p_day_type_id: dayTypeId, p_fase: fase ?? null });
  if (error) throw terjemahkan(error, 'muat');
  const b = data[0];
  if (!b) throw new KesalahanTarget('Target belum bisa dimuat. Coba lagi sebentar lagi.', true);
  if (!b.diisi || !b.target_id) return { fase: b.fase, target: null, karboG: null };
  return {
    fase: b.fase,
    target: {
      id: b.target_id,
      day_type_id: b.day_type_id,
      fase: b.fase,
      target_kalori: Number(b.target_kalori),
      target_protein_g: Number(b.target_protein_g),
      target_lemak_g: Number(b.target_lemak_g),
      batas_sat_fat_g: Number(b.batas_sat_fat_g),
    },
    karboG: b.karbo_g,
  };
}

export async function simpanTargetServer(perubahan: PerubahanTarget[]): Promise<HasilSimpanTarget> {
  const { data, error } = await supabase.rpc('simpan_target', {
    p_perubahan: perubahan.map((p) => ({
      day_type_id: p.day_type_id,
      fase: p.fase,
      ...p.nilai,
      ...(p.diperbarui_pada ? { diperbarui_pada: p.diperbarui_pada } : {}),
    })),
  });
  if (error) throw terjemahkan(error, 'simpan');
  return {
    target: data.target.map(keTarget),
    berlakuMulai: data.berlaku_mulai,
    hariDisegarkan: data.hari_disegarkan,
    hariDiredistribusiTetap: data.hari_diredistribusi_tetap,
  };
}

const ribuan = (n: number) => n.toLocaleString('id-ID');

/** Pelanggaran aturan tabel → kalimat yang sama nadanya dengan `periksaTarget`. */
const PESAN_ATURAN: Record<string, string> = {
  day_type_targets_kalori_masuk_akal: `Kalori antara ${ribuan(RENTANG_TARGET.kalori.min)} dan ${ribuan(RENTANG_TARGET.kalori.maks)} kcal.`,
  day_type_targets_protein_rentang: `Protein antara ${RENTANG_TARGET.protein.min} dan ${RENTANG_TARGET.protein.maks} g.`,
  day_type_targets_lemak_rentang: `Lemak antara ${RENTANG_TARGET.lemak.min} dan ${RENTANG_TARGET.lemak.maks} g.`,
  day_type_targets_sat_fat_rentang: `Batas sat fat antara ${RENTANG_TARGET.satFat.min} dan ${RENTANG_TARGET.satFat.maks} g.`,
  day_type_targets_sat_fat_dalam_lemak: 'Batas sat fat paling tinggi sama dengan target lemak, karena sat fat bagian dari lemak.',
  day_type_targets_makro_dalam_kalori: 'Protein dan lemak saja sudah lebih besar dari target kalorinya; target kalori perlu setidaknya sebesar itu.',
};

/**
 * Galat PostgREST/Postgres → pesan berbahasa Indonesia. Kode SQLSTATE-nya
 * sama dengan yang di-`raise` `simpan_target`.
 */
function terjemahkan(error: { code?: string; message: string }, untuk: 'muat' | 'simpan'): KesalahanTarget {
  if (/fetch|network|jaringan/i.test(error.message)) {
    return new KesalahanTarget(
      untuk === 'muat'
        ? 'Target belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
        : 'Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.',
      true,
    );
  }
  switch (error.code) {
    case '23514': {
      const aturan = /constraint "([a-z_]+)"/.exec(error.message)?.[1];
      return new KesalahanTarget((aturan && PESAN_ATURAN[aturan]) ?? 'Target ini belum sesuai aturan isian.', false);
    }
    case '23503':
      return new KesalahanTarget('Tipe hari ini sudah tidak ada. Muat ulang target, lalu coba lagi.', false);
    case '40001':
      return new KesalahanTarget(
        'Target ini baru saja diubah di perangkat lain. Angka terbarunya sudah dimuat; periksa lalu simpan lagi.',
        false,
        'konflik',
      );
    case '22023': // pesan dari simpan_target sudah berbahasa Indonesia
      return new KesalahanTarget(error.message, false);
    case '28000':
    case 'PGRST301':
      return new KesalahanTarget('Sesi berakhir. Masuk lagi untuk melanjutkan.', false);
    default:
      return new KesalahanTarget(
        untuk === 'muat' ? 'Target belum bisa dimuat. Coba lagi sebentar lagi.' : 'Target belum tersimpan. Coba lagi sebentar lagi.',
        true,
      );
  }
}
