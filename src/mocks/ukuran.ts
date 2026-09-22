import type { UkuranTubuh } from '@/types/domain';

/**
 * Ukuran tubuh mingguan tiruan.
 *
 * Bentuknya mengikuti tabel `body_measurements` di PRD, termasuk pemisahan
 * lengan dan paha KIRI/KANAN — asimetri itu nyata dan berguna dilacak, jadi
 * tidak boleh dirata-ratakan diam-diam.
 */
export const mockUkuran: UkuranTubuh[] = [
  {
    id: 'uk-1',
    tanggal: '2026-09-01',
    pinggang_cm: 84.5,
    dada_cm: 102.0,
    leher_cm: 38.5,
    lengan_kiri_cm: 35.2,
    lengan_kanan_cm: 35.8,
    paha_kiri_cm: 57.5,
    paha_kanan_cm: 58.0,
  },
  {
    id: 'uk-2',
    tanggal: '2026-09-08',
    pinggang_cm: 84.8,
    dada_cm: 102.4,
    leher_cm: 38.5,
    lengan_kiri_cm: 35.4,
    lengan_kanan_cm: 36.0,
    paha_kiri_cm: 57.8,
    paha_kanan_cm: 58.2,
  },
  {
    id: 'uk-3',
    tanggal: '2026-09-15',
    pinggang_cm: 85.2,
    dada_cm: 102.9,
    leher_cm: 38.7,
    lengan_kiri_cm: 35.6,
    lengan_kanan_cm: 36.1,
    paha_kiri_cm: 58.0,
    paha_kanan_cm: 58.5,
  },
  {
    id: 'uk-4',
    tanggal: '2026-09-22',
    pinggang_cm: 85.4,
    dada_cm: 103.4,
    leher_cm: 38.7,
    lengan_kiri_cm: 35.9,
    lengan_kanan_cm: 36.4,
    paha_kiri_cm: 58.3,
    paha_kanan_cm: 58.8,
  },
];
