import type { HasilLab } from '@recomp/logika';

/**
 * Riwayat hasil lab tiruan (Fase 4, sisi frontend).
 *
 * Angka dan rentang rujukannya dibuat masuk akal untuk pria dewasa, dengan
 * dua profil lipid berjarak sembilan bulan supaya perubahan antarwaktu bisa
 * dilihat. Rentang rujukan adalah milik "laboratorium" di sini — app tidak
 * punya rentangnya sendiri.
 */
export const mockRiwayatLab: HasilLab[] = [
  {
    id: 'lab-3',
    tanggal: '2026-09-03',
    nama: 'Profil lipid',
    laboratorium: 'Lab klinik',
    penanda: [
      { nama: 'Kolesterol total', nilai: 212, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 200 },
      { nama: 'Kolesterol LDL', nilai: 138, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 130 },
      { nama: 'Kolesterol HDL', nilai: 48, satuan: 'mg/dL', rujukanMin: 40, rujukanMaks: null },
      { nama: 'Trigliserida', nilai: 130, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 150 },
    ],
  },
  {
    id: 'lab-2',
    tanggal: '2026-06-14',
    nama: 'Panel darah lengkap',
    laboratorium: 'Lab klinik',
    penanda: [
      { nama: 'Hemoglobin', nilai: 15.1, satuan: 'g/dL', rujukanMin: 13, rujukanMaks: 17 },
      { nama: 'Hematokrit', nilai: 45, satuan: '%', rujukanMin: 40, rujukanMaks: 50 },
      { nama: 'Leukosit', nilai: 6.8, satuan: 'ribu/µL', rujukanMin: 4, rujukanMaks: 10 },
      { nama: 'Trombosit', nilai: 245, satuan: 'ribu/µL', rujukanMin: 150, rujukanMaks: 400 },
      { nama: 'Glukosa puasa', nilai: 92, satuan: 'mg/dL', rujukanMin: 70, rujukanMaks: 100 },
      { nama: 'HbA1c', nilai: 5.3, satuan: '%', rujukanMin: null, rujukanMaks: 5.7 },
      { nama: 'Kreatinin', nilai: 1.0, satuan: 'mg/dL', rujukanMin: 0.7, rujukanMaks: 1.3 },
      { nama: 'SGPT (ALT)', nilai: 38, satuan: 'U/L', rujukanMin: null, rujukanMaks: 41 },
      { nama: 'Vitamin D (25-OH)', nilai: 24, satuan: 'ng/mL', rujukanMin: 30, rujukanMaks: 100 },
    ],
  },
  {
    id: 'lab-1',
    tanggal: '2025-12-10',
    nama: 'Profil lipid',
    laboratorium: 'Lab klinik',
    penanda: [
      { nama: 'Kolesterol total', nilai: 225, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 200 },
      { nama: 'Kolesterol LDL', nilai: 150, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 130 },
      { nama: 'Kolesterol HDL', nilai: 44, satuan: 'mg/dL', rujukanMin: 40, rujukanMaks: null },
      { nama: 'Trigliserida', nilai: 160, satuan: 'mg/dL', rujukanMin: null, rujukanMaks: 150 },
    ],
  },
];

/**
 * Simpan hasil lab tiruan: jeda seperti jaringan, gagal bila perangkat luring
 * (untuk mencoba jalur gagal simpan di web).
 */
export function mockSimpanHasilLab(): Promise<void> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return gagal(new Error('Failed to fetch'));
      selesai();
    }, 700),
  );
}
