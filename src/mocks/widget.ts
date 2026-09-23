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
    targetKalori: target.target_kalori,
    dihitungPada: new Date(sekarang.getTime() - 9 * 60_000).toISOString(),
  };
}

/** Pengaturan pengingat awal, seperti baris baru `settings_notifications`. */
export const mockPengaturanPengingat = {
  timbangAktif: true,
  jamTimbangMenit: 6 * 60 + 30,
  /** `null`: akhir pekan memakai jam yang sama. */
  jamAkhirPekanMenit: null as number | null,
  ringkasanAktif: true,
  widgetTampilkanAngka: true,
};

/**
 * Waktu timbang 14 pagi terakhir (dari `daily_logs`), untuk saran jam
 * pengingat. Sekitar 06.40 di hari kerja, lebih siang di akhir pekan, dan satu
 * pagi yang sangat telat — supaya saran berbasis median terlihat tahan pencilan.
 */
export function mockWaktuTimbang(sekarang: Date = new Date()): string[] {
  const menitWib = [398, 405, 401, 392, 410, 455, 470, 396, 403, 399, 640, 468, 480, 402];
  const hariIni = new Date(sekarang.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T00:00:00+07:00');
  return menitWib.map((m, i) => new Date(hariIni.getTime() - (i + 1) * 86_400_000 + m * 60_000).toISOString());
}
