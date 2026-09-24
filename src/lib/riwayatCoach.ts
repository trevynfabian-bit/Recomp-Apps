import type { Percakapan } from '@/types/domain';
import { bacaCadangan, simpanCadangan } from './cadangan';

/**
 * Riwayat percakapan Coach di perangkat, per akun (lewat `@/lib/cadangan`,
 * yang dihapus saat keluar).
 *
 * Tanpa ini riwayat hanya hidup di state layar: hilang saat app ditutup, dan
 * juga saat navigator dipasang ulang (mis. skema berganti). Dengan Supabase,
 * salinan ini menjadi cadangan luring di depan tabel percakapan di server.
 */
const NAMA = 'coach.riwayat';
/** Percakapan terbaru yang disimpan; yang lebih lama dilepas (paling lama di depan). */
export const MAKS_PERCAKAPAN_LOKAL = 50;

function sah(x: unknown): x is Percakapan[] {
  return (
    Array.isArray(x) &&
    x.every(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.judul === 'string' &&
        typeof p.diperbaruiPada === 'string' &&
        Array.isArray(p.pesan),
    )
  );
}

/**
 * Riwayat tersimpan, atau `null` bila belum ada / rusak. Pesan yang masih
 * "mengirim" saat app ditutup dipulihkan sebagai "gagal": ia tidak pernah
 * mendapat jawaban, dan pengguna perlu tombol Coba lagi, bukan titik-titik abadi.
 */
export async function pulihkanRiwayatCoach(penggunaId: string): Promise<Percakapan[] | null> {
  const data = await bacaCadangan(NAMA, penggunaId);
  if (!sah(data)) return null;
  return data.map((p) => ({
    ...p,
    pesan: p.pesan.map((m) => (m.status === 'mengirim' ? { ...m, status: 'gagal' as const } : m)),
  }));
}

export function simpanRiwayatCoach(penggunaId: string, riwayat: Percakapan[]): Promise<void> {
  return simpanCadangan(NAMA, penggunaId, riwayat.slice(-MAKS_PERCAKAPAN_LOKAL));
}
