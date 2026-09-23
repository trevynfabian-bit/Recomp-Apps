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

export type { BagianUkuran } from './ukuran.ts';

export {
  HARI_PER_PEKAN,
  lajuTerkini,
  RENTANG_UKURAN_CM,
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
  AngkaSnapshot,
  HasilHubungkan,
  JenisOtorisasi,
  KeadaanSinkronApp,
  KesehatanKoneksi,
  KoneksiSumber,
  MekanismeSync,
  SnapshotHariIni,
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
  LABEL_MASUK,
  masukDariAngka,
  selisihMasuk,
} from './sumberData.ts';

export type {
  JenisSet,
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

export type {
  BarisDilewati,
  BarisUkuranImpor,
  HasilImporHevy,
  HasilImporUkuran,
} from './impor.ts';

export {
  potongBatch,
  UKURAN_BATCH_IMPOR,
  uraiCsv,
  uraiCsvHevy,
  uraiCsvUkuran,
  uraiTanggal,
  uraiWaktuHevy,
} from './impor.ts';

export type {
  JamPengingat,
  JenisNotifikasi,
  KeadaanKosongWidget,
  NotifikasiKatalog,
  RingkasanWidget,
} from './pengingat.ts';

export {
  formatJamMenit,
  geserJamTimbang,
  JAM_TIMBANG_BAWAAN,
  jenisNotifikasiBawaan,
  KATALOG_NOTIFIKASI,
  LANGKAH_JAM_MENIT,
  NOTIF_RINGKASAN,
  NOTIF_TIMBANG,
  pelanggaranNada,
  perluPengingatTimbang,
  isiWidgetLingkar,
  jamPengingatUntuk,
  MIN_TIMBANGAN_SARAN,
  RENTANG_JAM_TIMBANG,
  ringkasJadwal,
  ringkasJenisAktif,
  saranJamTimbang,
  siapkanWidget,
  teksWidget,
  teksWidgetSebaris,
} from './pengingat.ts';

export type {
  AktivitasStrava,
  DataLuar,
  KirimanLuar,
  LatihanLuar,
  PeristiwaHevy,
  RecoveryWhoop,
  SesiHevy,
  SetHevy,
  TidurWhoop,
  WorkoutHevy,
  WorkoutWhoop,
} from './sinkronLuar.ts';

export {
  jenisOlahragaStrava,
  jenisOlahragaWhoop,
  KJ_PER_KCAL,
  kcalDariKj,
  kirimanAktivitasStrava,
  kirimanHapusRecoveryWhoop,
  kirimanHapusStrava,
  kirimanHapusTidurWhoop,
  kirimanHapusWorkoutWhoop,
  kirimanRecoveryWhoop,
  kirimanTidurWhoop,
  kirimanWorkoutWhoop,
  JEDA_KURSOR_HEVY_MS,
  kirimanHevy,
  kursorHevyBerikut,
  sesiDariWorkoutHevy,
  tambahDetik,
} from './sinkronLuar.ts';
