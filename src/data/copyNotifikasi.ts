import { gabungCopyNotifikasi, KATALOG_NOTIFIKASI } from '@recomp/logika';
import type { NotifikasiKatalog } from '@recomp/logika';
import { supabase, supabaseSiap } from '@/lib/supabase';

/**
 * Katalog notifikasi dengan kalimat terbaru dari `copy_notifikasi`.
 *
 * Kalimat bisa diperbaiki di server tanpa rilis app; perangkat memeriksanya
 * ULANG (`gabungCopyNotifikasi`) dan jatuh ke kalimat terbundel bila ada yang
 * tidak lolos atau server tidak terjangkau — notifikasi tidak pernah kosong.
 */
export async function ambilKatalogNotifikasi(): Promise<NotifikasiKatalog[]> {
  if (!supabaseSiap) return [...KATALOG_NOTIFIKASI];
  const { data, error } = await supabase.from('copy_notifikasi').select('jenis, nama, kapan, judul, isi');
  if (error || !data) return [...KATALOG_NOTIFIKASI];
  return gabungCopyNotifikasi(data);
}
