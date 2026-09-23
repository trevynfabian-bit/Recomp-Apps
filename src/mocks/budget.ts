import type { HariBudget } from '@recomp/logika';
import { hariDalamMinggu } from '@recomp/logika';
import type { Fase } from '@recomp/logika';
import type { DayTypeTarget } from '@/types/domain';
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

/**
 * Tujuh hari minggu ini beserta target dan konsumsinya.
 *
 * Target mengikuti aturan snapshot `daily_logs`: hari yang SUDAH LEWAT memakai
 * target yang berlaku saat itu (tabel target awal, fase pada tanggal itu),
 * hari ini dan sesudahnya memakai target terkini dan fase aktif. Menyunting
 * target atau mengganti fase karena itu menggeser sisa jatah minggu ini tanpa
 * menulis ulang hari-hari yang sudah dijalani.
 */
export function mockHariBudget(
  hariIni: string,
  o: {
    faseAktif: Fase;
    /** Fase yang berlaku pada tanggal lampau (`faseSaat`). */
    faseLampau: (tanggal: string) => Fase;
    /** Target terkini dari penyedia target. */
    targetTerkini: (dayTypeId: string, fase: Fase) => DayTypeTarget;
  },
): HariBudget[] {
  return hariDalamMinggu(hariIni).map((tanggal, i) => {
    const dayTypeId = TIPE_MINGGU_INI[i];
    const lampau = tanggal < hariIni;
    const target = lampau ? cariTarget(dayTypeId, o.faseLampau(tanggal)) : o.targetTerkini(dayTypeId, o.faseAktif);
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
