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
  usiaPada,
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

export { alasanDeteksi, aturanDeteksiTipeHari, deteksiTipeHari, type HasilDeteksi } from './deteksiTipeHari.ts';

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
  redistribusiBasi,
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

export type { ArahGerakan, ArahKekuatan, JenisSet, LatihanDalamSesi, RingkasanLatihan, RingkasanSesi, SesiLatihan, SetLatihan } from './latihan.ts';

export {
  AMBANG_ARAH_KEKUATAN,
  arahKekuatan,
  e1rmEpley,
  formatBeban,
  MAKS_REPS_E1RM,
  ringkasArahKekuatan,
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
  CopyNotifikasi,
  JamPengingat,
  JenisNotifikasi,
  KeadaanKosongWidget,
  MasukanWidget,
  NotifikasiKatalog,
  RencanaNotifikasi,
  RingkasanWidget,
} from './pengingat.ts';

export {
  formatJamMenit,
  geserJamTimbang,
  JAM_TIMBANG_BAWAAN,
  copySah,
  gabungCopyNotifikasi,
  HARI_JADWAL_PENGINGAT,
  jenisNotifikasiBawaan,
  jamSqlDariMenit,
  rencanaPengingatTimbang,
  waktuWib,
  KATALOG_NOTIFIKASI,
  menitDariJamSql,
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

export type { HasilPulihkanSesi, KeputusanSesi, KodeGagalMasuk, SesiServer, SesiTersimpan } from './akun.ts';
export {
  buatSesiTersimpan,
  emailSah,
  kodeGagalMasuk,
  LAMA_SESI_HARI,
  PESAN_GAGAL_MASUK,
  pesanGagalAturUlang,
  pesanPemulihanSesi,
  pulihkanSesi,
  putuskanSesi,
  VERSI_SESI_TERSIMPAN,
} from './akun.ts';

export type { BarisTarget, SnapshotTargetHari, TargetBerlaku } from './targetBerlaku.ts';
export { cariBarisTarget, targetBerlaku, tipeHariBerlaku } from './targetBerlaku.ts';

export type { BarisMatriks, HasilPeriksaTarget, IsianTarget, KolomTarget, NilaiTarget, SelMatriks } from './targetHarian.ts';
export {
  ISIAN_KOSONG,
  isianBerubah,
  isianDariTarget,
  karboTersisaG,
  KKAL_PER_GRAM,
  periksaTarget,
  RENTANG_TARGET,
  rincianKaloriMakro,
  susunMatriksTarget,
  uraiGram,
  uraiKalori,
  URUTAN_FASE_MATRIKS,
  urutanFaseJanggal,
} from './targetHarian.ts';

export type { PeringatanProtein } from './peringatanProtein.ts';
export { peringatanProtein, PROTEIN_MIN_G_PER_KG } from './peringatanProtein.ts';

export type { HasilGantiFase, PeriodeFase } from './periodeFase.ts';
export { faseSaat, jangkarKoridor, periodeBerjalan, terapkanGantiFase } from './periodeFase.ts';

export type { ButirStatusPrivasi, KunciStatusPrivasi, MasukanStatusPrivasi } from './privasi.ts';
export { DATA_TERSIMPAN, susunStatusPrivasi } from './privasi.ts';

export type { BerkasEkspor, NilaiSel, TabelEkspor } from './ekspor.ts';
export {
  csvDariTabel,
  formatUkuranBerkas,
  namaBerkasEkspor,
  NOTIF_EKSPOR_SIAP,
  ringkasIsiEkspor,
  selCsv,
  susunBerkasEkspor,
  VERSI_FORMAT_EKSPOR,
} from './ekspor.ts';

export type {
  BarisDataMentahLab,
  BarisHasilLabServer,
  GalatPenandaLab,
  HasilLab,
  HasilPeriksaLab,
  IsianHasilLab,
  IsianPenandaLab,
  PenandaLab,
  PosisiPenanda,
  RingkasanHasilLab,
} from './hasilLab.ts';
export {
  barisDataMentahLab,
  BATAS_PANJANG_LAB,
  hasilLabDariServer,
  hasilLabSama,
  isianDariHasilLab,
  kalimatRingkasanLab,
  kelompokkanPerTahun,
  PENANDA_KOSONG,
  penandaDariTemplat,
  periksaHasilLab,
  posisiPenanda,
  ringkasHasilLab,
  TEMPLAT_PANEL_LAB,
  tulisNilaiLab,
  tulisRujukanLab,
  uraiNilaiLab,
  uraiTanggalLab,
} from './hasilLab.ts';
