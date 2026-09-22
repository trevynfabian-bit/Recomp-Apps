import { colors } from '@/theme';
import type { FoodLog, JenisSumber, SumberBerat } from '@/types/domain';

/** Label & warna kanonis tiap jenis sumber, dipakai semua penanda di app. */
export const METADATA_SUMBER: Record<
  JenisSumber,
  { label: string; warna: string; penjelasan: string }
> = {
  manual: {
    label: 'Manual',
    warna: colors.jade,
    penjelasan: 'Anda catat sendiri — data mentah.',
  },
  sinkron: {
    label: 'Sinkron',
    warna: colors.textMuted,
    penjelasan: 'Ditarik dari perangkat atau layanan — data mentah.',
  },
  estimasi: {
    label: 'Estimasi',
    warna: colors.amber,
    penjelasan: 'Hasil perkiraan, bukan catatan asli — periksa bila terasa meleset.',
  },
};

/** Petakan `daily_logs.sumber_berat` ke jenis sumber. */
export function sumberBerat(sumber: SumberBerat | null): JenisSumber | null {
  if (sumber === null) return null;
  return sumber === 'healthkit' ? 'sinkron' : 'manual';
}

/**
 * Petakan `food_logs.sumber` ke jenis sumber.
 * Entri foto AI adalah ESTIMASI meski pengguna sempat mengoreksinya, karena
 * titik awal angkanya tetap tebakan model.
 */
export function sumberMakanan(sumber: FoodLog['sumber']): JenisSumber {
  return sumber === 'foto_ai' ? 'estimasi' : 'manual';
}

/** Berapa entri makanan yang berasal dari estimasi, untuk catatan ringkas. */
export function hitungEstimasi(foodLogs: FoodLog[]): number {
  return foodLogs.filter((f) => sumberMakanan(f.sumber) === 'estimasi').length;
}
