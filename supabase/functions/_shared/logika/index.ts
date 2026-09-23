// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
/**
 * Titik masuk paket logika bersama Recomp Coach.
 *
 * Dipakai app iOS (Expo/Metro) dan web dashboard (Next.js). Mengekspor
 * TypeScript sumber, jadi tidak ada langkah build dan tidak ada artefak
 * yang bisa basi.
 */
export type {
  ArahMetrik,
  BarisKumulatif,
  BudgetMingguan,
  DayType,
  HariBudget,
  HariRedistribusi,
  HasilRedistribusi,
  HasilBodyFat,
  HasilEvaluasi,
  HasilTdee,
  InputBodyFat,
  InputEvaluasi,
  InputTdee,
  LajuBudget,
  EntriBeratRingkas,
  Fase,
  HitunganMakro,
  JenisOlahraga,
  KecocokanFase,
  KategoriMedis,
  KecukupanTren,
  KelompokPesan,
  KekuranganBodyFat,
  KomposisiTubuh,
  KoridorTarget,
  MacroProgress,
  MetodeTdee,
  ModeMakro,
  OpsiRedistribusi,
  PenolakanMedis,
  PerubahanUkuran,
  PesanRingkas,
  ProteksiProtein,
  RataRata7Hari,
  RingkasanHariBudget,
  RingkasanPerubahan,
  SinyalArah,
  StatusBatasPinggang,
  StatusKoridor,
  TitikKoridor,
  TitikTren,
  TitikUkuran,
  WorkoutRingkas,
} from './tipe.ts';

export {
  formatAngka,
  formatDesimal,
  formatMakro,
  formatRentangTanggal,
  formatTanggalPanjang,
  rasio,
  tanggalHariIni,
  ZONA_WAKTU,
} from './format.ts';

export { hitungMakro, keteranganMakro } from './makro.ts';

export {
  formatJam,
  judulPercakapan,
  kelompokkanPerTanggal,
  labelTanggalRelatif,
  MAKS_JUDUL,
  tanggalDariWaktu,
} from './percakapan.ts';

export { estimasiBodyFatNavy, komposisiTubuh, KETIDAKPASTIAN_BF } from './bodyFat.ts';

export { evaluasi4Mingguan, PEKAN_EVALUASI } from './evaluasi.ts';

export { DISCLAIMER_COACH, periksaBatasMedis, periksaJawabanMedis } from './batasMedis.ts';

export { alasanDeteksi, deteksiTipeHari, type HasilDeteksi } from './deteksiTipeHari.ts';

export {
  arahSesuaiFase,
  deretTren,
  kecukupanTren,
  JENDELA_HARI,
  majuHari,
  mundurHari,
  rataRata7Hari,
  selisihHari,
  sinyalArah,
} from './tren.ts';

export { koridorTarget, LAJU_PER_MINGGU, statusKoridor } from './koridor.ts';

export {
  HARI_PER_PEKAN,
  lajuTerkini,
  ringkasPerubahan,
  statusBatasPinggang,
} from './ukuran.ts';

export { awalMinggu, budgetMingguan, hariDalamMinggu, lajuBudget, rincianKumulatif } from './budget.ts';
export {
  CM_PER_INCI,
  KG_PER_LB,
  labelBerat,
  labelPanjang,
  periksaBatasPinggang,
  periksaTinggi,
  RENTANG_BATAS_PINGGANG_CM,
  RENTANG_TINGGI_CM,
  simpanBerat,
  simpanPanjang,
  tampilkanBerat,
  tampilkanPanjang,
} from './satuan.ts';
export type { Satuan } from './satuan.ts';

export {
  hitungRedistribusi,
  KELIPATAN_KCAL,
  periksaProteksiProtein,
  selisihPerluDipindah,
  terapkanRedistribusi,
} from './redistribusi.ts';

export {
  bandingkanTargetTdee,
  estimasiTdee,
  KCAL_PER_KG,
  pengaliRataRata,
  PENGALI_AKTIVITAS,
} from './tdee.ts';

export type {
  ArahTujuan,
  DataRingkasanMingguan,
  KunciPoin,
  PoinRingkasan,
  PoinTampil,
  RingkasanTampil,
  SumberPoin,
} from './ringkasan.ts';

export {
  angkaDariTeks,
  angkaYangBoleh,
  bacaanCadangan,
  formatDeltaPoin,
  formatNilaiPoin,
  judulRingkasan,
  keRingkasanTampil,
  KUNCI_POIN,
  LABEL_POIN,
  MAKS_LANJUTAN,
  periksaAngkaBacaan,
  saringLanjutan,
  tampilkanPoin,
} from './ringkasan.ts';

export type {
  HasilHubungkan,
  JenisOtorisasi,
  KeadaanSinkronApp,
  KesehatanKoneksi,
  KoneksiSumber,
  MekanismeSync,
  StatusKoneksi,
  SumberData,
  TingkatKesehatan,
  TingkatSinkronApp,
} from './sumberData.ts';

export {
  formatWaktuRelatif,
  kesehatanKoneksi,
  pesanGagalHubungkan,
  PROFIL_SUMBER,
  ringkasanKoneksi,
  samarkanKunci,
  statusSinkronApp,
  URUTAN_SUMBER,
  urutkanKoneksi,
  validasiKunciHevy,
} from './sumberData.ts';

export type {
  LatihanDalamSesi,
  RingkasanLatihan,
  RingkasanSesi,
  SesiLatihan,
  SetLatihan,
} from './latihan.ts';

export {
  e1rmEpley,
  formatBeban,
  MAKS_REPS_E1RM,
  ringkasLatihan,
  ringkasPekan,
  ringkasSesi,
} from './latihan.ts';
