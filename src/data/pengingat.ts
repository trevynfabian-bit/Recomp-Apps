import { tanggalHariIni } from '@recomp/logika';
import { ambilPengaturanPengingat, type PengaturanPengingat } from '@/data/pengaturanNotifikasi';
import { jadwalkanPengingatTimbang } from '@/lib/notifikasi';
import { supabase, supabaseSiap } from '@/lib/supabase';
import { mockPengaturanPengingat } from '@/mocks/widget';

/**
 * Menyegarkan jadwal pengingat dari keadaan TERKINI: preferensi pengguna dan
 * apakah berat hari ini sudah tercatat (dari perangkat mana pun — termasuk
 * timbangan yang masuk lewat Apple Health, atau iPad).
 *
 * Dipanggil saat app dibuka & kembali aktif, dan saat pengaturan pengingat
 * berubah. Tanpa Supabase, preferensinya tiruan dan berat hari ini dianggap
 * belum tercatat.
 */
export async function segarkanPengingat(pengaturan?: PengaturanPengingat): Promise<number> {
  const p = pengaturan ?? (supabaseSiap ? await ambilPengaturanPengingat() : mockPengaturanPengingat());
  return jadwalkanPengingatTimbang({
    aktif: p.jenis.timbang,
    jadwal: { hariKerjaMenit: p.jamTimbangMenit, akhirPekanMenit: p.jamAkhirPekanMenit },
    sudahTimbangHariIni: supabaseSiap ? await beratHariIniTercatat() : false,
  });
}

async function beratHariIniTercatat(): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('berat_pagi_kg')
    .eq('tanggal', tanggalHariIni())
    .maybeSingle();
  // Ragu → anggap belum: pengingat yang terkirim padahal sudah timbang lebih
  // ringan daripada pengingat yang hilang untuk orang yang lupa.
  if (error) return false;
  return data?.berat_pagi_kg != null;
}
