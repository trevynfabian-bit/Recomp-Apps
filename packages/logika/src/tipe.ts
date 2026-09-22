/**
 * Tipe domain yang dipakai BERSAMA oleh app iOS dan web dashboard.
 *
 * Hanya yang benar-benar dibutuhkan perhitungan yang ada di sini. Tipe khusus
 * layar (mis. snapshot siap-tampil) tetap tinggal di masing-masing aplikasi.
 */

/** Fase program yang menentukan target harian & budget mingguan. */
export type Fase = 'Maintenance' | 'Lean Gain' | 'Cut';

/** Konfigurasi tipe hari. Tidak ada faktor pengali — target hidup terpisah. */
export type DayType = {
  id: string;
  nama: string;
  /** Boleh menjadi hasil auto-deteksi dari workout. */
  auto_detect: boolean;
  is_default: boolean;
};

/** Kategori olahraga yang dipakai aturan auto-deteksi tipe hari. */
export type JenisOlahraga = 'angkat_beban' | 'lari' | 'padel' | 'lainnya';

/** Workout secukupnya untuk menebak tipe hari dan menjelaskan alasannya. */
export type WorkoutRingkas = {
  id: string;
  nama: string;
  jenis: JenisOlahraga;
  sumber: 'hevy' | 'strava' | 'whoop' | 'healthkit' | 'manual';
  durasi_menit: number;
};

/** Pasangan konsumsi vs target untuk satu makro. */
export type MacroProgress = {
  key: 'kalori' | 'protein' | 'lemak' | 'karbo' | 'satFat';
  label: string;
  terpakai: number;
  /** Target absolut; `null` bila makro tersebut tidak ditargetkan (karbo). */
  target: number | null;
  unit: 'kcal' | 'g';
  /** true untuk sat fat: target berperan sebagai BATAS, bukan sasaran. */
  isBatas?: boolean;
};

/** Cara panel ringkasan menampilkan angka utama tiap makro. */
export type ModeMakro = 'sisa' | 'terpakai';

/** Hasil hitung satu makro, siap ditampilkan tanpa logika tambahan. */
export type HitunganMakro = {
  nilaiUtama: number;
  /** true bila target/batas sudah terlampaui (sisa negatif). */
  terlampaui: boolean;
  /** Rasio 0..1 untuk bar progress. */
  progres: number;
};

/** Satu timbangan, secukupnya untuk perhitungan tren. */
export type EntriBeratRingkas = {
  tanggal: string;
  berat_pagi_kg: number | null;
};

/** Hasil rata-rata bergerak 7 hari untuk satu tanggal. */
export type RataRata7Hari = {
  tanggal: string;
  /** `null` bila tidak ada timbangan sama sekali dalam jendelanya. */
  rataRataKg: number | null;
  /** Berapa hari yang benar-benar ditimbang dalam jendela itu. */
  jumlahTimbangan: number;
};

/** Satu titik pada grafik tren. */
export type TitikTren = {
  tanggal: string;
  rataRataKg: number | null;
  beratHarianKg: number | null;
};

/** Arah berat sepekan terakhir. */
export type SinyalArah = {
  arah: 'naik' | 'turun' | 'datar' | 'belum cukup data';
  /** Selisih rata-rata sekarang terhadap sepekan lalu; `null` bila data kurang. */
  perubahanKg: number | null;
  /** Ambang yang dianggap masih "datar". */
  ambangKg: number;
};

/** Batas bawah & atas koridor target untuk satu tanggal. */
export type TitikKoridor = {
  tanggal: string;
  bawahKg: number;
  atasKg: number;
};

/** Koridor target lengkap beserta jangkarnya. */
export type KoridorTarget = {
  fase: Fase;
  /** Berat (rata-rata 7 hari) saat fase dimulai. */
  beratJangkarKg: number;
  tanggalJangkar: string;
  titik: TitikKoridor[];
};

/** Posisi rata-rata sekarang terhadap koridor. */
export type StatusKoridor = {
  posisi: 'di dalam koridor' | 'di atas koridor' | 'di bawah koridor' | 'belum bisa dinilai';
  /** Jarak ke batas terdekat; 0 bila di dalam, `null` bila belum bisa dinilai. */
  selisihKg: number | null;
  bawahKg: number | null;
  atasKg: number | null;
};

/** Kecocokan arah berat terhadap yang diharapkan fase aktif. */
export type KecocokanFase = 'sesuai' | 'belum bergerak' | 'berlawanan' | 'belum bisa dinilai';

/** Seberapa cukup data untuk tiap angka di layar Tren. */
export type KecukupanTren = {
  adaTimbangan: boolean;
  /** Seluruh timbangan yang pernah tercatat. */
  jumlahTotal: number;
  /** Timbangan dalam jendela 7 hari yang berakhir di tanggal tersebut. */
  jumlahDalamJendela: number;
  cukupRataRata: boolean;
  /** true bila ketujuh hari dalam jendela benar-benar ditimbang. */
  jendelaPenuh: boolean;
  /** Sinyal arah butuh DUA jendela berisi, bukan satu. */
  cukupArah: boolean;
  hariLagiUntukArah: number | null;
};

/** Satu hari dalam minggu beserta target dan konsumsinya. */
export type HariBudget = {
  tanggal: string;
  namaTipeHari: string;
  /** Target yang berlaku — bisa sudah diubah redistribusi. */
  targetKalori: number;
  /**
   * Target menurut RENCANA SEMULA (day_type_targets), sebelum redistribusi.
   * Budget mingguan dihitung dari sini, bukan dari target yang sudah diubah:
   * kalau budget ikut turun saat target dipotong, redistribusi membatalkan
   * dirinya sendiri dan defisitnya tidak pernah berkurang.
   */
  targetAsliKalori?: number;
  terpakaiKalori: number;
  /**
   * Target protein harian. Dibawa di sini bukan untuk dihitung, melainkan
   * untuk DIBUKTIKAN tidak berubah: redistribusi hanya menyentuh kalori.
   */
  targetProteinG?: number;
};

/** Hari budget yang sudah diberi status & selisih. */
export type RingkasanHariBudget = HariBudget & {
  status: 'lampau' | 'hari ini' | 'mendatang';
  /** Konsumsi dikurangi target; `null` untuk hari yang belum terjadi. */
  selisih: number | null;
};

/** Ringkasan budget kalori satu minggu. */
export type BudgetMingguan = {
  mingguMulai: string;
  budgetTotal: number;
  terpakai: number;
  /** Boleh negatif: negatif berarti jatah minggu ini sudah terlampaui. */
  sisa: number;
  /**
   * Hari yang BELUM berjalan. Hari ini tidak termasuk: konsumsinya sudah
   * dikurangkan dari `sisa`, jadi menghitungnya lagi akan menggandakan jatah.
   */
  hariTersisa: number;
  targetMendatang: number;
  sisaPerHari: number | null;
  /** Jatah per hari menurut rencana semula; pembanding bagi `sisaPerHari`. */
  rencanaPerHari: number | null;
  rincian: RingkasanHariBudget[];
};

/** Perbandingan pemakaian budget terhadap laju yang seharusnya. */
export type LajuBudget = {
  /** Jumlah target hari-hari yang sudah berjalan. */
  seharusnya: number;
  /** Terpakai dikurangi seharusnya; positif berarti lebih cepat dari laju. */
  selisih: number;
  status: 'sesuai laju' | 'lebih cepat' | 'lebih lambat' | 'belum mulai';
  /** Selisih di bawah ini masih dianggap sesuai laju. */
  ambangKcal: number;
};

/** Satu baris rincian kumulatif budget mingguan. */
export type BarisKumulatif = RingkasanHariBudget & {
  /** true bila angkanya proyeksi dari target, bukan konsumsi tercatat. */
  proyeksi: boolean;
  nilaiKalori: number;
  /** Akumulasi termasuk proyeksi hari mendatang. */
  kumulatif: number;
  /** Sisa jatah setelah hari ini; boleh negatif. */
  sisaBerjalan: number;
  /** Akumulasi konsumsi TERCATAT saja, tanpa proyeksi. */
  terpakaiSampaiSini: number;
};

/** Pilihan penanganan kelebihan/kekurangan kalori mingguan. */
export type OpsiRedistribusi = 'sebar_rata' | 'tumpuk_satu_hari' | 'abaikan';

/** Usulan target baru untuk satu hari. */
export type HariRedistribusi = {
  tanggal: string;
  namaTipeHari: string;
  targetLama: number;
  targetBaru: number;
  selisih: number;
  /** true bila target tertahan batas bawah kalori harian. */
  kenaLantai: boolean;
};

/** Hasil perhitungan satu opsi redistribusi. Belum diterapkan. */
export type HasilRedistribusi = {
  opsi: OpsiRedistribusi;
  /** Negatif berarti kelebihan yang harus ditutup. */
  perluDipindah: number;
  /** Yang benar-benar terserap setelah pembulatan & lantai. */
  terserap: number;
  /** Yang TIDAK terserap; dinyatakan terang-terangan. */
  tersisa: number;
  dibatasiLantai: boolean;
  alasan: string;
  hari: HariRedistribusi[];
};

/** Hasil pemeriksaan bahwa protein tidak ikut dipotong redistribusi. */
export type ProteksiProtein = {
  /** true bila target protein tiap hari sama persis sebelum dan sesudah. */
  utuh: boolean;
  hari: {
    tanggal: string;
    namaTipeHari: string;
    proteinG: number;
    proteinSesudahG: number;
    kaloriSebelum: number;
    kaloriSesudah: number;
  }[];
};

/** Masukan untuk estimasi TDEE. Field `null` berarti metodenya dilewati. */
export type InputTdee = {
  beratKg: number;
  tinggiCm: number | null;
  usiaTahun: number | null;
  jenisKelamin: 'pria' | 'wanita' | null;
  /** Persen lemak tubuh bila diketahui; dibutuhkan Katch-McArdle. */
  persenLemak: number | null;
  /** Tipe hari sepanjang minggu, untuk pengali aktivitas. */
  tipeHariMinggu: string[];
  /** Berapa hari data asupan & berat yang tersedia. */
  hariData: number;
  rataAsupanKalori: number | null;
  /** Perubahan berat sepanjang periode data; positif berarti naik. */
  perubahanBeratKg: number | null;
};

/** Satu metode perhitungan TDEE. */
export type MetodeTdee = {
  nama: string;
  nilai: number;
  /** Ringkasan dari mana angkanya, supaya bisa ditelusuri. */
  dasar: string;
  /** true bila memakai data pengguna, bukan rumus populasi. */
  berbasisData: boolean;
};

/** Hasil estimasi TDEE sebagai rentang. */
export type HasilTdee = {
  metode: MetodeTdee[];
  min: number | null;
  maks: number | null;
  tengah: number | null;
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
  alasanKeyakinan: string;
};

/**
 * Masukan rumus Navy; semua lingkar dalam cm.
 *
 * `tinggiCm` dan `jenisKelamin` boleh null karena kolomnya memang nullable di
 * `profiles`: pengguna baru belum tentu mengisinya. Rumus ini yang memutuskan
 * apa yang kurang, bukan pemanggilnya.
 */
export type InputBodyFat = {
  jenisKelamin: 'pria' | 'wanita' | null;
  tinggiCm: number | null;
  pinggangCm: number;
  leherCm: number;
  /** Lingkar pinggul — hanya dipakai rumus versi wanita. */
  pinggulCm?: number | null;
};

/**
 * Apa yang membuat estimasi tidak bisa dihitung, dalam bentuk yang bisa
 * diperiksa kode. Tiga yang pertama bisa diperbaiki pengguna dari profil;
 * `ukuran` hanya bisa diperbaiki dengan mengukur ulang.
 */
export type KekuranganBodyFat = 'tinggi' | 'jenis-kelamin' | 'pinggul' | 'ukuran';

/** Hasil estimasi persen lemak tubuh. */
export type HasilBodyFat = {
  metode: 'Navy';
  /** Persen lemak; null bila datanya tidak cukup untuk dihitung. */
  persen: number | null;
  /** Rentang wajar mengingat galat metode; null bila `persen` null. */
  rentang: { bawah: number; atas: number } | null;
  /** Galat baku metode, dalam poin persentase. */
  ketidakpastian: number;
  /** Pergeseran estimasi bila meteran pinggang meleset 1 cm, dalam poin. */
  sensitivitasPinggang: number | null;
  /** Kenapa tidak bisa dihitung; null bila berhasil. */
  alasanKosong: string | null;
  /**
   * Bentuk kekurangannya yang bisa diperiksa kode, supaya UI tahu kapan
   * pantas menawarkan "lengkapi profil" dan kapan justru menyesatkan.
   */
  kurang: KekuranganBodyFat | null;
};

/** Pecahan berat badan menjadi massa lemak dan massa bebas lemak. */
export type KomposisiTubuh = {
  lemakKg: number;
  bebasLemakKg: number;
};

/** Satu titik riwayat untuk SATU bagian tubuh. */
export type TitikUkuran = {
  tanggal: string;
  /** Nilai dalam cm. */
  nilai: number;
};

/** Perubahan antara dua pencatatan berurutan. */
export type PerubahanUkuran = {
  dari: string;
  ke: string;
  nilaiDari: number;
  nilaiKe: number;
  /** `nilaiKe − nilaiDari`, dibulatkan ke 0,1 cm. */
  selisih: number;
  jarakHari: number;
  /**
   * Selisih dinormalkan ke tujuh hari. Tanpa ini, selang yang tidak seragam
   * terbaca seolah sebanding — padahal pencatatan mingguan sering tertunda.
   */
  lajuPerPekan: number;
};

/** Riwayat perubahan satu bagian tubuh beserta totalnya. */
export type RingkasanPerubahan = {
  perubahan: PerubahanUkuran[];
  /** Selisih pencatatan terakhir terhadap yang pertama; null bila baru satu. */
  totalSelisih: number | null;
  rentangHari: number | null;
  awal: TitikUkuran | null;
  akhir: TitikUkuran | null;
};

/** Keadaan lingkar pinggang terhadap batas yang ditetapkan pengguna. */
export type StatusBatasPinggang = {
  keadaan: 'belum-ditetapkan' | 'lewat' | 'mendekat' | 'aman';
  /** `pinggang − batas`; positif berarti sudah di atas batas. */
  selisihCm: number | null;
  lajuPerPekan: number | null;
  /** Perkiraan pekan sampai batas tercapai; 0 bila sudah lewat. */
  pekanLagi: number | null;
};

/**
 * Bentuk MINIMAL sebuah pesan yang dibutuhkan penataan riwayat.
 * Sengaja tidak memakai tipe pesan milik app: paket ini dipakai web dashboard
 * juga, dan keduanya tidak perlu sepakat soal field di luar tiga ini.
 */
export type PesanRingkas = {
  id: string;
  peran: 'pengguna' | 'coach';
  teks: string;
  /** ISO 8601. */
  waktu: string;
};

/** Sekelompok pesan yang terjadi pada tanggal yang sama. */
export type KelompokPesan = {
  tanggal: string;
  /** "Hari ini", "Kemarin", atau tanggal panjang. */
  label: string;
  idPesan: string[];
};

/** Arah sebuah metrik selama periode evaluasi. */
export type ArahMetrik = 'naik' | 'datar' | 'turun' | 'belum jelas';

/** Masukan evaluasi 4 mingguan. */
export type InputEvaluasi = {
  fase: Fase;
  arahBerat: ArahMetrik;
  arahPinggang: ArahMetrik;
  arahKekuatan: ArahMetrik;
  /** Berapa pekan data yang benar-benar ada. */
  pekanData: number;
};

/** Verdict evaluasi 4 mingguan. */
export type HasilEvaluasi = {
  /** Kode stabil; dipakai pengujian dan penelusuran, bukan untuk ditampilkan. */
  kode: string;
  judul: string;
  ringkas: string;
  rekomendasi: string;
  /** Sumbu mana yang paling menentukan verdict ini. */
  penentu: string;
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
};
