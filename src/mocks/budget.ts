import type { HariBudget } from '@recomp/logika';
import { hariDalamMinggu } from '@recomp/logika';
import type { Fase } from '@recomp/logika';
import { cariTarget, mockDayTypes } from './dailyLog';

/**
 * Data tiruan budget mingguan.
 *
 * Tipe hari sengaja bervariasi sepanjang minggu supaya terlihat bahwa budget
 * mingguan BUKAN angka tetap: ia jumlah target harian, dan target harian ikut
 * tipe harinya.
 */

/** Tipe hari per hari dalam minggu contoh, Senin → Minggu. */
const TIPE_MINGGU_INI = [
  'dt-angkat',
  'dt-beban-lari',
  'dt-rest',
  'dt-angkat',
  'dt-padel',
  'dt-beban-lari',
  'dt-rest',
];

/** Konsumsi yang sudah tercatat, Senin → Minggu. `null` = belum terjadi. */
const KONSUMSI_MINGGU_INI: (number | null)[] = [2910, 3260, 2300, 2760, null, null, null];

/** Tujuh hari minggu ini beserta target dan konsumsinya. */
export function mockHariBudget(hariIni: string, fase: Fase): HariBudget[] {
  return hariDalamMinggu(hariIni).map((tanggal, i) => {
    const dayTypeId = TIPE_MINGGU_INI[i];
    const target = cariTarget(dayTypeId, fase);
    const nama = mockDayTypes.find((d) => d.id === dayTypeId)?.nama ?? 'Rest';
    return {
      tanggal,
      namaTipeHari: nama,
      targetKalori: target.target_kalori,
      // Dibawa supaya proteksi protein bisa dibuktikan, bukan cuma diklaim.
      targetProteinG: target.target_protein_g,
      terpakaiKalori: KONSUMSI_MINGGU_INI[i] ?? 0,
    };
  });
}
