import { supabase } from '@/lib/supabase';
import type { RingkasanWidgetDb } from '@/types/database';

/**
 * Masukan widget layar kunci untuk hari ini, dihitung server
 * (`daily_summaries` via `ringkasan_widget`). Bentuknya langsung masukan
 * `siapkanWidget` di @recomp/logika — app memakai fungsi yang sama untuk
 * pratinjau, dan (lewat App Group) widget native membaca JSON yang sama.
 */
export async function ambilRingkasanWidget(): Promise<RingkasanWidgetDb> {
  const { data, error } = await supabase.rpc('ringkasan_widget', {});
  if (error || !data) throw error ?? new Error('Ringkasan widget kosong');
  return data;
}
