import type { RingkasanWidget } from '@recomp/logika';
import { mockSnapshotHariIni } from './dailyLog';

/**
 * Ringkasan hari ini untuk pratinjau widget, diturunkan dari snapshot tiruan
 * yang SAMA dengan layar Hari Ini — supaya pratinjau widget dan layar utama
 * tidak menampilkan dua "sisa" yang berbeda. Task backend menukarnya dengan
 * `daily_summaries` yang dihitung server.
 */
export function mockRingkasanWidget(sekarang: Date = new Date()): RingkasanWidget {
  const { log, target } = mockSnapshotHariIni();
  return {
    sisaKalori: target.target_kalori - log.kalori,
    sisaProteinG: target.target_protein_g - log.protein_g,
    dihitungPada: new Date(sekarang.getTime() - 9 * 60_000).toISOString(),
  };
}

/** Pengaturan pengingat awal, seperti baris baru `settings_notifications`. */
export const mockPengaturanPengingat = {
  timbangAktif: true,
  jamTimbangMenit: 6 * 60 + 30,
  ringkasanAktif: true,
  widgetTampilkanAngka: true,
};
