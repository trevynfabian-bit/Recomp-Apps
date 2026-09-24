/**
 * Data tiruan halaman Laporan paritas (build pengembangan, sisi frontend).
 *
 * Daftar pasangannya NYATA: setiap baris adalah aturan yang memang dihitung di
 * dua tempat, `@recomp/logika` dan Supabase PostgreSQL, dan dibandingkan oleh
 * `scripts/cek-paritas-makro.mjs` (`npm run cek:paritas`). Yang tiruan hanya
 * HASIL jalannya: waktu, commit, jumlah kasus, dan contoh selisih. Task backend
 * menukarnya dengan laporan yang ditulis skrip itu.
 */

export type AreaParitas = 'Makro & budget' | 'Target & fase' | 'Berat & tren' | 'Komposisi tubuh' | 'Evaluasi & teks' | 'Skema data';

export type PasanganParitas = {
  id: string;
  area: AreaParitas;
  /** Nama aturan dalam bahasa sehari-hari. */
  aturan: string;
  /** Fungsi/konstanta di `@recomp/logika`. */
  ts: string;
  /** Fungsi, view, atau batasan di database. */
  sql: string;
  kasus: number;
  keadaan: 'sama' | 'beda';
  /** Contoh pertama yang berbeda; hanya untuk `beda`. */
  selisih?: { kasus: string; ts: string; sql: string };
};

export type LaporanParitas = {
  /** ISO 8601; null = belum pernah dijalankan. */
  dijalankanPada: string | null;
  commit: string | null;
  pasangan: PasanganParitas[];
};

const PASANGAN: PasanganParitas[] = [
  { id: 'makro', area: 'Makro & budget', aturan: 'Sisa & kelebihan makro harian', ts: 'hitungMakro', sql: 'ringkasan_sisa_harian', kasus: 9, keadaan: 'sama' },
  { id: 'budget', area: 'Makro & budget', aturan: 'Budget kalori mingguan', ts: 'budgetMingguan · lajuBudget', sql: 'budget_mingguan', kasus: 12, keadaan: 'sama' },
  { id: 'redistribusi', area: 'Makro & budget', aturan: 'Redistribusi kalori & kelipatannya', ts: 'hitungRedistribusi · KELIPATAN_KCAL', sql: 'hitung_redistribusi · kelipatan_redistribusi_kcal', kasus: 10, keadaan: 'sama' },
  { id: 'proteksi', area: 'Makro & budget', aturan: 'Proteksi protein saat redistribusi', ts: 'terapkanRedistribusi · periksaProteksiProtein', sql: 'terapkan_redistribusi · proteksi_protein', kasus: 6, keadaan: 'sama' },
  { id: 'tipe-hari', area: 'Target & fase', aturan: 'Deteksi tipe hari dari latihan', ts: 'deteksiTipeHari', sql: 'deteksi_tipe_hari', kasus: 11, keadaan: 'sama' },
  { id: 'target', area: 'Target & fase', aturan: 'Target yang berlaku per tanggal', ts: 'targetBerlaku', sql: 'ambil_target_harian', kasus: 4, keadaan: 'sama' },
  { id: 'fase', area: 'Target & fase', aturan: 'Ganti fase & fase pada tanggal', ts: 'terapkanGantiFase · faseSaat', sql: 'ganti_fase · fase_pada_tanggal', kasus: 7, keadaan: 'sama' },
  { id: 'koridor', area: 'Berat & tren', aturan: 'Koridor target berat & posisinya', ts: 'koridorTarget · statusKoridor', sql: 'koridor_target · status_koridor', kasus: 8, keadaan: 'sama' },
  { id: 'rata', area: 'Berat & tren', aturan: 'Rata-rata berat 7 hari', ts: 'rataRata7Hari', sql: 'simpan_berat_pagi', kasus: 6, keadaan: 'sama' },
  { id: 'deret', area: 'Berat & tren', aturan: 'Deret tren berat harian', ts: 'deretTren', sql: 'deret_rata_rata_7_hari', kasus: 5, keadaan: 'sama' },
  {
    id: 'arah',
    area: 'Berat & tren',
    aturan: 'Arah tren (ambang 0,2 kg)',
    ts: 'sinyalArah · kecukupanTren',
    sql: 'simpan_berat_pagi',
    kasus: 9,
    keadaan: 'beda',
    selisih: { kasus: 'turun persis 0,2 kg dalam 7 hari', ts: 'turun', sql: 'stabil' },
  },
  { id: 'tdee', area: 'Komposisi tubuh', aturan: 'Estimasi TDEE & pengali aktivitas', ts: 'estimasiTdee · PENGALI_AKTIVITAS', sql: 'estimasi_tdee · pengali_aktivitas · kcal_per_kg', kasus: 8, keadaan: 'sama' },
  { id: 'bf', area: 'Komposisi tubuh', aturan: 'Estimasi lemak tubuh (Navy)', ts: 'estimasiBodyFatNavy · KETIDAKPASTIAN_BF', sql: 'estimasi_body_fat · ketidakpastian_bf', kasus: 7, keadaan: 'sama' },
  { id: 'ukuran', area: 'Komposisi tubuh', aturan: 'Riwayat ukuran & batas pinggang', ts: 'ringkasPerubahan · statusBatasPinggang', sql: 'riwayat_ukuran · ambang_pekan_batas', kasus: 9, keadaan: 'sama' },
  { id: 'evaluasi', area: 'Evaluasi & teks', aturan: 'Verdict evaluasi 4 mingguan', ts: 'evaluasi4Mingguan · PEKAN_EVALUASI', sql: 'kode_evaluasi · pekan_evaluasi', kasus: 48, keadaan: 'sama' },
  { id: 'nada', area: 'Evaluasi & teks', aturan: 'Nada teks notifikasi', ts: 'pelanggaranNada · KATALOG_NOTIFIKASI', sql: 'pelanggaran_nada · copy_notifikasi', kasus: 14, keadaan: 'sama' },
  { id: 'lab', area: 'Skema data', aturan: 'Isian hasil lab diterima/ditolak', ts: 'validasi form hasil lab', sql: 'CHECK lab_results · lab_result_markers', kasus: 12, keadaan: 'sama' },
  { id: 'tipe', area: 'Skema data', aturan: 'Tipe baris klien = kolom tabel', ts: 'src/types/database.ts', sql: 'tabel & view publik', kasus: 21, keadaan: 'sama' },
];

/** Tiga keadaan yang bisa dipilih di halaman untuk menilai tampilannya. */
export const mockLaporanParitas: Record<'sama' | 'beda' | 'belum', LaporanParitas> = {
  sama: {
    dijalankanPada: '2026-09-24T06:40:00+07:00',
    commit: 'a1f3c9e',
    pasangan: PASANGAN.map((p) => ({ ...p, keadaan: 'sama', selisih: undefined })),
  },
  beda: { dijalankanPada: '2026-09-24T06:40:00+07:00', commit: 'a1f3c9e', pasangan: PASANGAN },
  belum: { dijalankanPada: null, commit: null, pasangan: [] },
};
