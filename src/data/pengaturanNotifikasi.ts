import { jamSqlDariMenit, KATALOG_NOTIFIKASI, menitDariJamSql } from '@recomp/logika';
import type { JenisNotifikasi } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import type { Database, SettingsNotificationsRow } from '@/types/database';

/**
 * Preferensi widget & pengingat (`settings_notifications`).
 *
 * Layar memakai bentuk yang sama dengan tiruannya (`mockPengaturanPengingat`):
 * sakelar per jenis, jam dalam MENIT, dan sakelar angka widget. Pemetaan ke
 * kolom `<jenis>_aktif` mengikuti KATALOG_NOTIFIKASI, jadi jenis baru di
 * katalog tanpa kolomnya gagal di `cek:widget`, bukan diam-diam tidak tersimpan.
 */

export type PengaturanPengingat = {
  jenis: Record<JenisNotifikasi, boolean>;
  jamTimbangMenit: number;
  jamAkhirPekanMenit: number | null;
  widgetTampilkanAngka: boolean;
};

type Pembaruan = Database['public']['Tables']['settings_notifications']['Update'];

const KOLOM: Record<JenisNotifikasi, keyof Pembaruan & `${JenisNotifikasi}_aktif`> = {
  timbang: 'timbang_aktif',
  ukuran: 'ukuran_aktif',
  ringkasan: 'ringkasan_aktif',
  evaluasi: 'evaluasi_aktif',
  sumber: 'sumber_aktif',
};

export function pengaturanDariBaris(b: SettingsNotificationsRow): PengaturanPengingat {
  return {
    jenis: Object.fromEntries(KATALOG_NOTIFIKASI.map((n) => [n.jenis, b[KOLOM[n.jenis]]])) as Record<
      JenisNotifikasi,
      boolean
    >,
    jamTimbangMenit: menitDariJamSql(b.jam_timbang),
    jamAkhirPekanMenit: b.jam_timbang_akhir_pekan === null ? null : menitDariJamSql(b.jam_timbang_akhir_pekan),
    widgetTampilkanAngka: b.widget_aktif,
  };
}

/** Perubahan sebagian; sakelar jenis pun cukup yang berubah saja. */
export type PerubahanPengingat = Partial<Omit<PengaturanPengingat, 'jenis'>> & {
  jenis?: Partial<Record<JenisNotifikasi, boolean>>;
};

/** Hanya kolom yang berubah — dua perangkat yang mengubah hal berbeda tidak saling menimpa. */
export function pembaruanDari(p: PerubahanPengingat): Pembaruan {
  const u: Pembaruan = {};
  if (p.jenis) for (const [j, v] of Object.entries(p.jenis) as [JenisNotifikasi, boolean][]) u[KOLOM[j]] = v;
  if (p.jamTimbangMenit !== undefined) u.jam_timbang = jamSqlDariMenit(p.jamTimbangMenit);
  if (p.jamAkhirPekanMenit !== undefined) {
    u.jam_timbang_akhir_pekan = p.jamAkhirPekanMenit === null ? null : jamSqlDariMenit(p.jamAkhirPekanMenit);
  }
  if (p.widgetTampilkanAngka !== undefined) u.widget_aktif = p.widgetTampilkanAngka;
  return u;
}

export async function ambilPengaturanPengingat(): Promise<PengaturanPengingat> {
  const { data, error } = await supabase.rpc('pengaturan_notifikasi', {});
  if (error || !data) throw error ?? new Error('Preferensi kosong');
  return pengaturanDariBaris(data);
}

export async function simpanPengaturanPengingat(p: PerubahanPengingat): Promise<void> {
  const { data: sesi } = await supabase.auth.getSession();
  const userId = sesi.session?.user.id;
  if (!userId) throw new Error('Tidak ada sesi login');
  const { error } = await supabase.from('settings_notifications').update(pembaruanDari(p)).eq('user_id', userId);
  if (error) throw error;
}
