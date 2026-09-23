import { tanggalDariWaktu } from '@recomp/logika';
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

/** Keadaan layar kunci yang bisa dipratinjau di halaman Widget & pengingat. */
export type SkenarioWidget = 'hari-ini' | 'angka-lama' | 'hari-baru' | 'belum-masuk' | 'tanpa-target';

export const LABEL_SKENARIO_WIDGET: Record<SkenarioWidget, string> = {
  'hari-ini': 'Hari ini',
  'angka-lama': 'Angka lama',
  'hari-baru': 'Hari baru',
  'belum-masuk': 'Belum masuk',
  'tanpa-target': 'Tanpa target',
};

/**
 * Apa yang tersimpan di perangkat untuk tiap skenario, sebagai masukan
 * `siapkanWidget`. "Hari baru" sengaja MENYIMPAN ringkasan kemarin lengkap
 * dengan angkanya — pratinjau harus membuktikan angka itu tidak muncul.
 */
export function mockMasukanWidget(skenario: SkenarioWidget, sekarang: Date = new Date()) {
  const { target } = mockSnapshotHariIni();
  const hariIni = tanggalDariWaktu(sekarang.toISOString());
  const ringkasan = mockRingkasanWidget(sekarang);
  const targetHari = { kalori: target.target_kalori, proteinG: target.target_protein_g };
  switch (skenario) {
    case 'angka-lama':
      return {
        masuk: true,
        ringkasan: {
          ...ringkasan,
          dihitungPada: new Date(sekarang.getTime() - 3 * 60 * 60_000).toISOString(),
          tanggal: hariIni,
        },
        target: targetHari,
      };
    case 'hari-baru':
      return {
        masuk: true,
        ringkasan: { ...ringkasan, tanggal: tanggalDariWaktu(new Date(sekarang.getTime() - 86_400_000).toISOString()) },
        target: targetHari,
      };
    case 'belum-masuk':
      return { masuk: false, ringkasan: null, target: null };
    case 'tanpa-target':
      return { masuk: true, ringkasan: null, target: null };
    default:
      return { masuk: true, ringkasan: { ...ringkasan, tanggal: hariIni }, target: targetHari };
  }
}
