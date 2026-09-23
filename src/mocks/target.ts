import { periksaTarget, isianDariTarget } from '@recomp/logika';
import type { PerubahanTarget } from '@/data/target';

/**
 * Simpan target tiruan (Fase 4, sisi frontend).
 *
 * Seperti server nanti, isinya diperiksa ULANG di sini — form bukan
 * satu-satunya penjaga. Gagal bila perangkat luring, untuk mencoba jalur
 * gagal simpan di web (DevTools → Offline).
 */
export function mockSimpanTarget(perubahan: PerubahanTarget[]): Promise<void> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return gagal(new Error('Failed to fetch'));
      }
      const tidakSah = perubahan.find((p) => !periksaTarget(isianDariTarget(p.nilai)).sah);
      if (tidakSah) return gagal(new Error(`Target ${tidakSah.day_type_id} (${tidakSah.fase}) tidak sah`));
      selesai();
    }, 700),
  );
}
