import type { RealtimeChannel } from '@supabase/supabase-js';
import { masukDariAngka } from '@recomp/logika';
import type { KeadaanSinkronApp, KoneksiSumber, SnapshotHariIni, SumberData } from '@recomp/logika';
import { supabase } from '@/lib/supabase';
import type { HealthConnectionRow } from '@/types/database';

/**
 * Realtime untuk data kesehatan.
 *
 * Yang didengarkan adalah DENYUT, bukan data mentah: `health_connections`
 * berubah setiap kali sebuah sumber selesai mengirim (sinkron_terakhir,
 * status, galat). Angka yang masuk tidak dikirim lewat Realtime — setelah
 * denyut, klien meminta `snapshot_hari_ini` (angka yang sudah dipilih server,
 * tanpa hitungan ganda) lalu membandingkannya dengan snapshot sebelumnya.
 *
 * `daily_logs`, `workouts`, dan `import_jobs` juga dipublikasikan; di sini
 * cukup diteruskan sebagai "tabel ini berubah" supaya layar yang memuatnya
 * bisa memuat ulang.
 *
 * RLS berlaku pada Realtime: filter `user_id=eq.<id>` mengurangi lalu lintas,
 * bukan satu-satunya penjaga.
 */

export const URUTAN_SUMBER: readonly SumberData[] = ['apple_health', 'whoop', 'strava', 'hevy'];

/** Baris koneksi (atau ketiadaannya) → bentuk yang dibaca layar. */
export function koneksiDariBaris(
  sumber: SumberData,
  baris: HealthConnectionRow | undefined,
  snapshot: SnapshotHariIni | null,
): KoneksiSumber {
  if (!baris) {
    return { sumber, status: 'belum', terhubungPada: null, sinkronTerakhir: null, galatTerakhir: null, masukHariIni: [] };
  }
  return {
    sumber,
    status: baris.status,
    terhubungPada: baris.terhubung_pada,
    sinkronTerakhir: baris.sinkron_terakhir,
    galatTerakhir: baris.galat_terakhir,
    masukHariIni: baris.status === 'terhubung' ? masukDariAngka(snapshot?.per_sumber[sumber]) : [],
  };
}

export function susunKoneksi(baris: HealthConnectionRow[], snapshot: SnapshotHariIni | null): KoneksiSumber[] {
  return URUTAN_SUMBER.map((s) => koneksiDariBaris(s, baris.find((b) => b.sumber === s), snapshot));
}

export async function ambilKoneksi(): Promise<HealthConnectionRow[]> {
  const { data, error } = await supabase.from('health_connections').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function ambilSnapshotHariIni(): Promise<SnapshotHariIni> {
  const { data, error } = await supabase.rpc('snapshot_hari_ini', {});
  if (error || !data) throw error ?? new Error('Snapshot kosong');
  return data;
}

type Pendengar = {
  onKoneksi: (baris: HealthConnectionRow) => void;
  onTabelBerubah: (tabel: 'daily_logs' | 'workouts' | 'import_jobs') => void;
  onStatus: (status: KeadaanSinkronApp['realtime']) => void;
};

/** Berlangganan denyut sinkron milik satu pengguna; kembalikan fungsi berhenti. */
export function langgananSinkron(userId: string, p: Pendengar): () => void {
  const filter = `user_id=eq.${userId}`;
  p.onStatus('menyambung');
  const kanal: RealtimeChannel = supabase
    .channel(`sinkron:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'health_connections', filter }, (e) => {
      if (e.eventType !== 'DELETE') p.onKoneksi(e.new as HealthConnectionRow);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs', filter }, () => p.onTabelBerubah('daily_logs'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter }, () => p.onTabelBerubah('workouts'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'import_jobs', filter }, () => p.onTabelBerubah('import_jobs'))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') p.onStatus('terhubung');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') p.onStatus('terputus');
    });
  return () => {
    void supabase.removeChannel(kanal);
  };
}
