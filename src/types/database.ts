/**
 * Tipe tabel & RPC Supabase, ditulis tangan agar cocok dengan berkas di
 * `supabase/migrations/`. Kalau migrasi berubah, berkas ini ikut diperbarui.
 *
 * Nama kolom sengaja sama persis dengan database (Bahasa Indonesia) supaya
 * tidak ada lapisan penerjemahan yang bisa salah diam-diam.
 */

import type { DataRingkasanMingguan, MasukanWidget, PoinRingkasan, SnapshotHariIni } from '@recomp/logika';

export type FaseProgram = 'Maintenance' | 'Lean Gain' | 'Cut';
export type SumberBeratDb = 'manual' | 'healthkit';
export type SumberMakananDb = 'manual' | 'foto_ai';
export type JenisOlahragaDb = 'angkat_beban' | 'lari' | 'padel' | 'lainnya';
export type SumberWorkoutDb = 'hevy' | 'strava' | 'whoop' | 'healthkit' | 'manual';

export type ProfileRow = {
  user_id: string;
  nama: string | null;
  /** Satuan TAMPILAN saja; yang disimpan selalu cm & kg. */
  satuan: 'metrik' | 'imperial';
  fase_aktif: FaseProgram;
  /** Jangkar koridor target; null sebelum fase pertama dicatat. */
  fase_mulai_tanggal: string | null;
  fase_berat_awal_kg: number | null;
  tinggi_cm: number | null;
  jenis_kelamin: 'pria' | 'wanita' | null;
  batas_pinggang_cm: number | null;
  tanggal_lahir: string | null;
  /** Kalori harian yang tidak boleh dilewati ke bawah oleh redistribusi. */
  batas_bawah_kalori: number;
  created_at: string;
  updated_at: string;
};

export type DayTypeRow = {
  id: string;
  user_id: string;
  nama: string;
  auto_detect: boolean;
  is_default: boolean;
  urutan: number;
  created_at: string;
};

export type DayTypeTargetRow = {
  id: string;
  user_id: string;
  day_type_id: string;
  fase: FaseProgram;
  target_kalori: number;
  target_protein_g: number;
  target_lemak_g: number;
  batas_sat_fat_g: number;
  created_at: string;
  updated_at: string;
};

export type DailyLogRow = {
  id: string;
  user_id: string;
  /** `YYYY-MM-DD`, sudah dinormalisasi ke Asia/Jakarta. */
  tanggal: string;
  berat_pagi_kg: number | null;
  day_type_id: string | null;
  day_type_override: boolean;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  target_kalori: number | null;
  /** Target SEBELUM redistribusi; null bila hari itu belum pernah disesuaikan. */
  target_asli_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
  /** Fase yang BERLAKU pada tanggal itu, bukan fase aktif saat dibaca. */
  fase: FaseProgram | null;
  catatan: string | null;
  sumber_berat: SumberBeratDb | null;
  /**
   * Jam timbang: dari sampel HealthKit, atau saat diketik untuk berat HARI
   * INI. `null` untuk berat hari lalu yang diketik belakangan.
   */
  waktu_timbang: string | null;
  /** Nama asal berat HealthKit (mis. "Withings"); `null` untuk berat yang diketik. */
  asal_berat: string | null;
  created_at: string;
  updated_at: string;
};

/** Baris view `v_tipe_hari_aktif`: tipe hari + target untuk fase yang aktif. */
export type TipeHariAktifRow = {
  day_type_id: string;
  user_id: string;
  nama: string;
  auto_detect: boolean;
  is_default: boolean;
  urutan: number;
  fase: FaseProgram;
  target_id: string | null;
  target_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
};

/** Hasil `ambil_target_harian`: target yang berlaku untuk satu tanggal. */
export type TargetHarianRow = {
  day_type_id: string;
  nama_tipe_hari: string;
  fase: FaseProgram;
  override: boolean;
  target_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
};

/** Hasil `ringkasan_harian`: satu baris ringkasan siap tampil. */
export type RingkasanHarianRow = {
  tanggal: string;
  berat_pagi_kg: number | null;
  sumber_berat: SumberBeratDb | null;
  nama_tipe_hari: string | null;
  fase: FaseProgram | null;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  target_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
  catatan: string | null;
  jumlah_entri: number;
  jumlah_estimasi: number;
};

/** Hasil `ringkasan_sisa_harian`: ringkasan hari beserta sisa tiap makro. */
export type RingkasanSisaRow = {
  tanggal: string;
  nama_tipe_hari: string | null;
  fase: FaseProgram | null;
  berat_pagi_kg: number | null;
  sumber_berat: SumberBeratDb | null;
  terpakai_kalori: number;
  terpakai_protein_g: number;
  terpakai_lemak_g: number;
  terpakai_karbo_g: number;
  terpakai_sat_fat_g: number;
  target_kalori: number | null;
  target_protein_g: number | null;
  target_lemak_g: number | null;
  batas_sat_fat_g: number | null;
  /** Boleh negatif: negatif berarti sudah melewati target/batas. */
  sisa_kalori: number | null;
  sisa_protein_g: number | null;
  sisa_lemak_g: number | null;
  sisa_sat_fat_g: number | null;
  sat_fat_terlampaui: boolean;
  kalori_terlampaui: boolean;
  catatan: string | null;
  jumlah_entri: number;
  jumlah_estimasi: number;
};

/** Hasil `rata_rata_berat_7_hari`. */
export type RataRataBeratRow = {
  tanggal: string;
  rata_rata_kg: number | null;
  jumlah_timbangan: number;
};

/** Hasil `deret_rata_rata_7_hari` — satu baris per tanggal dalam rentang. */
export type DeretRataRataRow = RataRataBeratRow & {
  /** Berat pagi mentah hari itu; `null` bila tidak ditimbang. */
  berat_harian_kg: number | null;
};

/**
 * Hasil `tren_berat_7_hari` — satu snapshot layar Tren.
 * Nama kunci mengikuti SQL; service yang menerjemahkannya ke bentuk TS.
 */
export type TrenSnapshotRow = {
  dari: string;
  sampai: string;
  deret: DeretRataRataRow[];
  rata_rata: RataRataBeratRow;
  sepekan_lalu: RataRataBeratRow;
  arah: {
    arah: 'naik' | 'turun' | 'datar' | 'belum cukup data';
    perubahan_kg: number | null;
    ambang_kg: number;
  };
  kecukupan: {
    ada_timbangan: boolean;
    jumlah_total: number;
    jumlah_dalam_jendela: number;
    cukup_rata_rata: boolean;
    jendela_penuh: boolean;
    cukup_arah: boolean;
    hari_lagi_untuk_arah: number | null;
  };
  /** `null` bila pengguna belum pernah menimbang sama sekali. */
  jangkar_fase: {
    fase: FaseProgram;
    tanggal_mulai: string;
    berat_awal_kg: number;
  } | null;
  /** Titik koridor sepanjang rentang yang digambar; kosong bila tanpa jangkar. */
  koridor: { tanggal: string; bawah_kg: number; atas_kg: number }[];
  status_koridor: {
    posisi: 'di bawah koridor' | 'di dalam koridor' | 'di atas koridor' | 'belum bisa dinilai';
    selisih_kg: number | null;
    bawah_kg: number | null;
    atas_kg: number | null;
  };
};

/** Satu hari dalam rincian `budget_mingguan`. */
export type HariBudgetRow = {
  tanggal: string;
  nama_tipe_hari: string | null;
  /** Target yang BERLAKU — bisa sudah dipotong redistribusi. */
  target_kalori: number;
  /** Target menurut rencana semula; `null` bila hari itu belum disesuaikan. */
  target_asli_kalori: number | null;
  target_protein_g: number;
  terpakai_kalori: number;
  terpakai_protein_g: number;
  status: 'lampau' | 'hari ini' | 'mendatang';
  /** `null` untuk hari yang belum berjalan. */
  selisih: number | null;
};

/**
 * Hasil `budget_mingguan` — satu snapshot budget kalori sepekan.
 * Nama kunci mengikuti SQL; service yang menerjemahkannya ke bentuk TS.
 */
export type BudgetMingguanRow = {
  minggu_mulai: string;
  hari_ini: string;
  /** Jumlah target ASLI sepekan; redistribusi tidak mengecilkannya. */
  budget_total: number;
  terpakai: number;
  /** Boleh negatif: jatah pekan sudah terlampaui. */
  sisa: number;
  /** Hari yang BELUM berjalan; hari ini tidak termasuk. */
  hari_tersisa: number;
  target_mendatang: number;
  sisa_per_hari: number | null;
  rencana_per_hari: number | null;
  laju: {
    /** Jumlah target BERLAKU hari-hari yang sudah berjalan. */
    seharusnya: number;
    selisih: number;
    status: 'sesuai laju' | 'lebih cepat' | 'lebih lambat' | 'belum mulai';
    ambang_kcal: number;
  };
  rincian: HariBudgetRow[];
};

/** Satu hari dalam usulan `hitung_redistribusi`. */
export type HariRedistribusiRow = {
  tanggal: string;
  nama_tipe_hari: string | null;
  target_lama: number;
  target_baru: number;
  selisih: number;
  /** true bila target tertahan batas bawah kalori harian. */
  kena_lantai: boolean;
};

/**
 * Hasil `hitung_redistribusi` / `terapkan_redistribusi`.
 *
 * `sebab` adalah KODE, bukan kalimat: kalimatnya disusun @recomp/logika supaya
 * angka di dalamnya diformat sama dengan angka di seluruh app.
 */
export type HasilRedistribusiRow = {
  minggu_mulai: string;
  hari_ini: string;
  opsi: OpsiRedistribusiDb;
  /** Negatif berarti kelebihan yang harus ditutup. */
  perlu_dipindah: number;
  terserap: number;
  /** Yang TIDAK terserap karena pembulatan atau lantai. */
  tersisa: number;
  dibatasi_lantai: boolean;
  /** Batas bawah kalori harian menurut PROFIL, bukan menurut pemanggil. */
  batas_bawah_kalori: number;
  kelipatan_kcal: number;
  sebab: 'abaikan' | 'tanpa hari tersisa' | 'sudah pas' | 'tidak ada perubahan' | null;
  hari: HariRedistribusiRow[];
  /** Hanya ada pada jawaban `terapkan_redistribusi`. */
  diterapkan?: boolean;
  redistribusi_id?: string | null;
};

/** Masukan yang dikumpulkan server untuk `estimasi_tdee`. */
export type MasukanTdeeRow = {
  /** Rata-rata 7 hari, bukan timbangan hari itu. */
  berat_kg: number | null;
  tinggi_cm: number | null;
  usia_tahun: number | null;
  jenis_kelamin: 'pria' | 'wanita' | null;
  persen_lemak: number | null;
  /** Tipe hari yang BENAR-BENAR dijalani dalam periode. */
  tipe_hari_minggu: string[];
  hari_data: number;
  rata_asupan_kalori: number | null;
  perubahan_berat_kg: number | null;
};

/** Satu metode TDEE beserta angka penyusunnya. */
export type MetodeTdeeRow = {
  nama: string;
  nilai: number;
  berbasis_data: boolean;
  bmr?: number;
  pengali?: number;
  lbm_kg?: number;
  energi_berat_kcal_per_hari?: number;
};

/**
 * Hasil `estimasi_tdee`.
 *
 * Tidak memuat kalimat penjelas: `dasar` tiap metode dan `alasan_keyakinan`
 * disusun `estimasiTdee` di @recomp/logika dari `masukan` yang sama, supaya
 * angka di dalam kalimatnya diformat sekali saja.
 */
export type EstimasiTdeeRow = {
  dari: string;
  sampai: string;
  masukan: MasukanTdeeRow;
  /** Berapa hari dalam periode yang benar-benar punya catatan asupan. */
  hari_tercatat: number;
  pengali_aktivitas: number;
  kcal_per_kg: number;
  metode: MetodeTdeeRow[];
  min: number | null;
  maks: number | null;
  tengah: number | null;
  lebar: number | null;
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
};

/** Satu hari dalam bukti `proteksi_protein`. */
export type ProteksiProteinHariRow = {
  tanggal: string;
  nama_tipe_hari: string | null;
  diredistribusi: boolean;
  /** Target kalori menurut rencana semula. */
  kalori_rencana: number;
  /** Target kalori yang berlaku setelah redistribusi. */
  kalori_berlaku: number;
  selisih_kalori: number;
  protein_g: number | null;
  protein_rencana: number | null;
  /** Selalu 0: redistribusi tidak menyentuh protein. */
  selisih_protein: number;
  protein_di_bawah_rencana: boolean;
};

/**
 * Hasil `proteksi_protein` — bukti terbaca bahwa redistribusi hanya menggeser
 * kalori. `penjaga_aktif` melaporkan pemicu database yang menegakkannya, bukan
 * sekadar keadaan angkanya saat ini.
 */
export type ProteksiProteinRow = {
  minggu_mulai: string;
  hari_ini: string;
  utuh: boolean;
  penjaga_aktif: boolean;
  jumlah_diredistribusi: number;
  kalori_dipindah: number;
  rincian: ProteksiProteinHariRow[];
};

/**
 * Satu angka yang boleh DIKUTIP coach, beserta asalnya.
 *
 * `sumber` adalah FIELD, bukan kata di dalam kalimat: model bisa lupa menulis
 * "estimasi", tapi ia tidak bisa menghapus field — dan app yang merender
 * kartunya membaca field itu.
 */
export type AngkaKonteksRow = {
  kunci: string;
  nilai: number;
  unit: string;
  sumber: JenisSumberDb;
  /** Seberapa tipis dasarnya; angka tanpa dasar tidak bisa diperiksa pengguna. */
  dasar: Record<string, unknown>;
};

/** Asal sebuah angka; sama dengan JenisSumber di @/types/domain. */
export type JenisSumberDb = 'manual' | 'sinkron' | 'estimasi';

/**
 * Hasil `konteks_coach` — satu snapshot data untuk AI Coach.
 *
 * Timbangan HARIAN sengaja tidak ada di `angka[]`: ia hanya muncul di
 * `tren.deret`, tempat ia jelas merupakan titik grafik dan bukan "berat Anda
 * hari ini". Coach tidak bisa mengutip angka yang tidak diberikan.
 */
export type KonteksCoachRow = {
  hari_ini: string;
  fase: FaseProgram;
  profil: {
    tinggi_cm: number | null;
    jenis_kelamin: 'pria' | 'wanita' | null;
    usia_tahun: number | null;
    satuan: 'metrik' | 'imperial';
    batas_pinggang_cm: number | null;
    batas_bawah_kalori: number;
  };
  angka: AngkaKonteksRow[];
  tren: Record<string, unknown>;
  budget: Record<string, unknown>;
  target_hari_ini: Record<string, unknown> | null;
  ukuran: Record<string, unknown>;
  body_fat: EstimasiBodyFatRow;
  tdee: EstimasiTdeeRow;
  evaluasi_terakhir: Record<string, unknown> | null;
  ringkasan_terakhir: Record<string, unknown> | null;
  /** Bendera aturan, bukan kalimatnya; teksnya milik @recomp/logika. */
  aturan: {
    wajib_rata_rata_7_hari: boolean;
    berat_harian_tidak_dikutip: boolean;
    setiap_angka_bersumber: boolean;
    dosis_obat_ditolak_di_klien: boolean;
    sumber_dikenal: JenisSumberDb[];
  };
};

/** ringkasan_mingguan — laporan berkala mingguan. */
export type RingkasanMingguanRow = {
  id: string;
  user_id: string;
  /** Senin pekan yang diringkas; database menuntut Senin dan tepat 7 hari. */
  periode_dari: string;
  periode_sampai: string;
  /** Poin MENTAH dari `poin_ringkasan_mingguan`; diformat `keRingkasanTampil`. */
  poin: PoinRingkasan[];
  bacaan: string;
  lanjutan: string[] | null;
  /** Pesan yang mengantarkannya; jadi `null` bila pesannya dihapus. */
  pesan_id: string | null;
  created_at: string;
};

/** Hasil `kuota_coach`: pertanyaan coach hari ini (Asia/Jakarta). */
export type KuotaCoachRow = {
  terpakai: number;
  batas: number;
  sisa: number;
  /** ISO 8601; tengah malam Asia/Jakarta berikutnya. */
  pulih_pada: string;
};

/** Hasil `simpan_ringkasan_mingguan`. `baru` false berarti pekan itu sudah diringkas. */
export type SimpanRingkasanRow = {
  baru: boolean;
  ringkasan_id: string;
  pesan_id: string | null;
  percakapan_id: string | null;
  periode: { dari: string; sampai: string };
};

/** Jawaban `poin_ringkasan_mingguan`; bentuknya milik paket logika bersama. */
export type PoinRingkasanMingguanRow = DataRingkasanMingguan;

/** Arah sebuah metrik selama periode evaluasi. */
export type ArahMetrikDb = 'naik' | 'datar' | 'turun' | 'belum jelas';

/**
 * evaluasi_periodik — verdict evaluasi 4 mingguan.
 *
 * Ketiga sumbu masukannya disimpan, bukan hanya verdictnya: tanpa itu, verdict
 * yang terasa salah tidak bisa ditelusuri ke masukannya. `kode` dibatasi CHECK
 * ke daftar yang benar-benar dihasilkan `evaluasi4Mingguan`, dan kesamaan kedua
 * daftar itu dijaga `npm run cek:evaluasi`.
 */
export type EvaluasiPeriodikRow = {
  id: string;
  user_id: string;
  periode_dari: string;
  periode_sampai: string;
  fase: FaseProgram;
  arah_berat: ArahMetrikDb;
  arah_pinggang: ArahMetrikDb;
  arah_kekuatan: ArahMetrikDb;
  pekan_data: number;
  kode: string;
  judul: string;
  ringkas: string;
  rekomendasi: string;
  penentu: string;
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
  pesan_id: string | null;
  created_at: string;
};

/**
 * Hasil `evaluasi_4_mingguan` — verdict beserta sumbu yang diturunkan dari data.
 *
 * Tidak memuat kalimat (judul, ringkas, rekomendasi): kalimatnya disusun
 * `evaluasi4Mingguan` di @recomp/logika dari sumbu yang SAMA, dan
 * `npm run cek:paritas` membuktikan kode & keyakinannya identik untuk seluruh
 * 960 kombinasi masukan.
 */
export type Evaluasi4MingguanRow = {
  periode_dari: string;
  periode_sampai: string;
  fase: FaseProgram;
  pekan_data: number;
  sumbu: {
    berat: {
      arah: ArahMetrikDb;
      awal_kg: number | null;
      akhir_kg: number | null;
      selisih_kg: number | null;
      ambang_kg: number;
      jumlah_timbangan: [number | null, number | null];
    };
    pinggang: {
      arah: ArahMetrikDb;
      awal_cm: number | null;
      akhir_cm: number | null;
      selisih_cm: number | null;
      ambang_cm: number;
      jumlah_pencatatan: number;
    };
    kekuatan: { arah: ArahMetrikDb; sebab: string };
  };
  kode: string;
  penentu: string;
  keyakinan: 'rendah' | 'sedang' | 'tinggi';
};

/** percakapan — satu utas AI Coach. */
export type PercakapanRow = {
  id: string;
  user_id: string;
  /** Diturunkan dari pertanyaan pertama; lihat `judulPercakapan`. */
  judul: string;
  /** Waktu pesan terakhir; dijaga trigger, bukan pemanggil. */
  diperbarui_pada: string;
  created_at: string;
};

/**
 * pesan_coach — satu pesan dalam percakapan.
 *
 * `rujukan`/`widget`/`ringkasan`/`evaluasi`/`penolakan` hanya boleh terisi pada
 * pesan coach; database menolak sebaliknya. Bentuknya `unknown` di sini karena
 * isinya milik `@/types/domain` (RujukanData, WidgetCoach, …) dan divalidasi di
 * tempat ia dirender, bukan di lapisan tabel.
 */
export type PesanCoachRow = {
  id: string;
  /** Urutan monoton dalam satu percakapan; dipakai mengurutkan, bukan `waktu`. */
  urutan: number;
  percakapan_id: string;
  user_id: string;
  peran: 'pengguna' | 'coach';
  teks: string;
  waktu: string;
  rujukan: unknown[] | null;
  widget: unknown[] | null;
  ringkasan: Record<string, unknown> | null;
  evaluasi: Record<string, unknown> | null;
  penolakan: Record<string, unknown> | null;
  created_at: string;
};

/** alert_pinggang — jejak keadaan batas pinggang. */
export type AlertPinggangRow = {
  id: string;
  /** Urutan monoton; dipakai menentukan keadaan TERAKHIR, bukan created_at. */
  urutan: number;
  user_id: string;
  keadaan: 'belum-ditetapkan' | 'aman' | 'mendekat' | 'lewat';
  tanggal_ukuran: string;
  pinggang_cm: number;
  batas_cm: number | null;
  selisih_cm: number | null;
  laju_per_pekan: number | null;
  pekan_lagi: number | null;
  /** false untuk perbaikan yang dicatat tapi tidak diberitahukan. */
  dikirim: boolean;
  created_at: string;
};

/** Keadaan batas pinggang, sama bentuknya di riwayat maupun alert. */
export type StatusBatasPinggangRow = {
  keadaan: 'belum-ditetapkan' | 'lewat' | 'mendekat' | 'aman';
  batas_cm: number | null;
  pinggang_cm: number;
  selisih_cm: number | null;
  laju_per_pekan: number | null;
  pekan_lagi: number | null;
  ambang_pekan: number;
};

/**
 * Hasil `periksa_alert_pinggang`.
 *
 * `perlu_kirim` true HANYA saat keadaannya memburuk dibanding yang terakhir
 * tercatat: mengirim "masih di atas batas" setiap pekan adalah cara tercepat
 * membuat orang mematikan notifikasi.
 */
export type AlertPinggangHasilRow = {
  /** `null` bila belum ada satu pun lingkar pinggang untuk dinilai. */
  status: StatusBatasPinggangRow | null;
  tanggal_ukuran?: string | null;
  perlu_kirim: boolean;
  sebab: 'tanpa pencatatan' | 'tidak perlu' | 'sudah diberitahukan' | 'memburuk';
  /** Id jejak yang baru ditulis; `null` pada pratinjau. */
  dicatat_id?: string | null;
  alert_terakhir: {
    keadaan: AlertPinggangRow['keadaan'];
    tanggal_ukuran: string;
    dikirim: boolean;
    created_at: string;
  } | null;
};

/**
 * Hasil `riwayat_ukuran` — riwayat beserta delta per bagian tubuh.
 *
 * Kuncinya `bagian` adalah nama kolom (`pinggang_cm`, …), dan bagian yang tidak
 * pernah diukur TIDAK muncul — bukan muncul sebagai deret kosong, yang akan
 * terbaca sebagai "diukur tapi nol".
 */
export type RiwayatUkuranRow = {
  sampai: string;
  jumlah: number;
  hari_per_pekan: number;
  maks_titik_laju: number;
  catatan: {
    tanggal: string;
    pinggang_cm: number | null;
    dada_cm: number | null;
    leher_cm: number | null;
    lengan_kiri_cm: number | null;
    lengan_kanan_cm: number | null;
    paha_kiri_cm: number | null;
    paha_kanan_cm: number | null;
    catatan: string | null;
  }[];
  bagian: Record<
    string,
    {
      titik: { tanggal: string; nilai: number }[];
      perubahan: {
        dari: string;
        ke: string;
        nilai_dari: number;
        nilai_ke: number;
        selisih: number;
        jarak_hari: number;
        laju_per_pekan: number;
      }[];
      /** `null` bila baru satu pencatatan; nol akan terbaca "tidak berubah". */
      total_selisih: number | null;
      rentang_hari: number | null;
      awal: { tanggal: string; nilai: number };
      akhir: { tanggal: string; nilai: number };
      /** Laju dari beberapa pencatatan terakhir sekaligus. */
      laju_terkini: number | null;
      jumlah: number;
    }
  >;
  /** `null` bila belum ada satu pun lingkar pinggang untuk dinilai. */
  batas_pinggang: {
    keadaan: 'belum-ditetapkan' | 'lewat' | 'mendekat' | 'aman';
    batas_cm: number | null;
    pinggang_cm: number;
    selisih_cm: number | null;
    laju_per_pekan: number | null;
    pekan_lagi: number | null;
    ambang_pekan: number;
  } | null;
};

/**
 * Hasil `estimasi_body_fat`.
 *
 * `kurang` adalah KODE, bukan kalimat: kalimatnya disusun `estimasiBodyFatNavy`
 * di @recomp/logika dari `masukan` yang sama. Satu kode hanya ada di sisi
 * server — `catatan` — karena TypeScript menerima lingkar pinggang & leher
 * sebagai angka, jadi keadaan "belum pernah mencatat ukuran" tidak punya
 * padanan di sana.
 */
export type EstimasiBodyFatRow = {
  metode: 'Navy';
  /** `null` bila datanya tidak cukup; `kurang` menyebut sebabnya. */
  persen: number | null;
  rentang: { bawah: number; atas: number } | null;
  /** Galat baku metode terhadap DXA, dalam poin persentase. */
  ketidakpastian: number;
  /** Pergeseran estimasi bila meteran pinggang meleset 1 cm. */
  sensitivitas_pinggang: number | null;
  kurang: 'catatan' | 'jenis-kelamin' | 'tinggi' | 'pinggul' | 'ukuran' | null;
  /** `null` bila belum ada timbangan untuk dipecah. */
  komposisi: { lemak_kg: number; bebas_lemak_kg: number } | null;
  /** Rata-rata 7 hari yang dipakai memecah komposisi. */
  berat_kg: number | null;
  masukan: {
    tanggal_ukuran: string | null;
    jenis_kelamin: 'pria' | 'wanita' | null;
    tinggi_cm: number | null;
    pinggang_cm: number | null;
    leher_cm: number | null;
    pinggul_cm: number | null;
  };
};

/**
 * body_measurements — satu pencatatan ukuran tubuh per tanggal.
 *
 * Semua kolom ukuran NULLABLE: orang yang pekan ini cuma mengukur pinggang
 * tidak terhalang, dan database hanya menuntut barisnya berisi setidaknya satu
 * ukuran. Perhatikan bedanya dengan `UkuranTubuh` di `@/types/domain`, yang
 * dibangun lebih dulu untuk UI dan menuntut ketujuhnya terisi — service yang
 * menjembatani keduanya yang harus memutuskan apa yang ditampilkan untuk
 * bagian tubuh yang tidak diukur, dan "0 cm" bukan jawabannya.
 */
export type BodyMeasurementRow = {
  id: string;
  user_id: string;
  tanggal: string;
  pinggang_cm: number | null;
  dada_cm: number | null;
  leher_cm: number | null;
  lengan_kiri_cm: number | null;
  lengan_kanan_cm: number | null;
  paha_kiri_cm: number | null;
  paha_kanan_cm: number | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Baris `health_connections` — STATUS koneksi sumber data.
 *
 * Token OAuth dan kunci API ada di `health_connection_secrets`, yang sengaja
 * tidak punya tipe di sini: klien tidak punya hak apa pun atas tabel itu, dan
 * tipe yang ada akan mengundang kode yang mencoba membacanya.
 *
 * Klien hanya boleh MENULIS baris `apple_health` miliknya sendiri (izin
 * HealthKit hanya ada di perangkat); sumber lain ditulis Edge Function.
 */
export type HealthConnectionRow = {
  id: string;
  user_id: string;
  sumber: 'apple_health' | 'whoop' | 'strava' | 'hevy';
  /** Diturunkan dari `sumber` oleh database; tidak bisa ditulis. */
  mekanisme: 'healthkit' | 'webhook' | 'cron';
  status: 'terhubung' | 'terputus';
  /** Id akun Strava/WHOOP untuk mengarahkan webhook; `null` untuk sumber lain. */
  akun_eksternal: string | null;
  terhubung_pada: string;
  /** Diisi database saat status menjadi `terputus`. */
  diputus_pada: string | null;
  sinkron_terakhir: string | null;
  galat_terakhir: string | null;
  galat_pada: string | null;
  /** Sumber yang ditarik cron (Hevy): peristiwa sejak waktu ini belum diambil. */
  kursor_sinkron: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Baris `workout_sets` — set latihan beban dari Hevy. Hanya dibaca klien;
 * Hevy adalah sumber kebenarannya.
 */
export type WorkoutSetRow = {
  id: string;
  workout_id: string;
  user_id: string;
  latihan: string;
  /** Urutan latihan dalam sesi (1…); latihan yang sama bisa muncul dua kali. */
  latihan_ke: number;
  set_ke: number;
  jenis_set: 'normal' | 'warmup' | 'dropset' | 'failure';
  /** `null` = berat badan tanpa beban tambahan. */
  beban_kg: number | null;
  reps: number;
  created_at: string;
};

/** Jenis angka di `health_data`; satuannya tetap per jenis (lihat `satuan`). */
export type JenisDataKesehatan =
  | 'kalori_aktif'
  | 'langkah'
  | 'tidur'
  | 'hr_istirahat'
  | 'hrv'
  | 'recovery'
  | 'strain';

/**
 * Baris `health_data` — satu angka dari satu sumber.
 *
 * Kunci dedup: (user_id, sumber, asal, jenis, id_eksternal). Penulis memakai
 * upsert pada kunci itu, jadi sinkron ulang memperbarui, tidak menambah.
 * `tanggal` dan `satuan` diturunkan database dan tidak bisa ditulis.
 */
export type HealthDataRow = {
  id: string;
  user_id: string;
  sumber: HealthConnectionRow['sumber'];
  /** Bundle id HKSource untuk Apple Health; `null` untuk API langsung. */
  asal: string | null;
  id_eksternal: string;
  jenis: JenisDataKesehatan;
  satuan: 'kcal' | 'langkah' | 'menit' | 'bpm' | 'ms' | 'persen' | 'skor';
  nilai: number;
  waktu_mulai: string;
  waktu_selesai: string | null;
  /** Asia/Jakarta, dari waktu_mulai (tidur: waktu_selesai). */
  tanggal: string;
  created_at: string;
  updated_at: string;
};

/**
 * Masukan `sinkron_healthkit`: satu kiriman dari HKAnchoredObjectQuery.
 * Jangkar di perangkat baru boleh dimajukan setelah panggilan berhasil.
 */
export type KirimanHealthKit = {
  sampel?: {
    jenis: Exclude<JenisDataKesehatan, 'recovery' | 'strain'>;
    /** UUID sampel, atau `total:<YYYY-MM-DD>` untuk total harian. */
    id: string;
    /** Bundle id HKSource; kosongkan untuk total gabungan HealthKit. */
    asal?: string | null;
    nilai: number;
    mulai: string;
    selesai?: string | null;
  }[];
  dihapus?: { jenis: JenisDataKesehatan; id: string; asal?: string | null }[];
  berat?: { id: string; kg: number; waktu: string; nama_asal?: string | null }[];
};

export type StatusBeratSinkron = 'disimpan' | 'manual_dipertahankan' | 'ada_yang_lebih_pagi' | 'bukan_pagi';

/** Keluaran `sinkron_healthkit`. */
export type HasilSinkronHealthKit = {
  disimpan: number;
  dihapus: number;
  dilewati: {
    bagian: 'sampel' | 'berat';
    indeks: number;
    alasan:
      | 'nilai_di_luar_rentang'
      | 'jenis_tidak_dikenal'
      | 'bukan_apple_health'
      | 'format_tidak_sah'
      | 'waktu_tidak_sah'
      | 'tidak_sah';
  }[];
  berat: { tanggal: string; kg: number; status: StatusBeratSinkron; nama_asal: string | null }[];
  /** Tambahan HARI INI per jenis, setelah anti-dobel — isi banner "data baru masuk". */
  masuk: { jenis: 'kalori_aktif' | 'langkah' | 'tidur'; jumlah: number }[];
  sinkron_terakhir: string;
};

/** Sumber impor riwayat sekali; sama dengan `SumberImpor` di SheetImporRiwayat. */
export type SumberImporDb = 'hevy_csv' | 'apple_health' | 'ukuran_lama';

/** Baris `import_jobs` — satu impor riwayat beserta kemajuannya. */
export type ImportJobRow = {
  id: string;
  user_id: string;
  sumber: SumberImporDb;
  status: 'berjalan' | 'selesai' | 'gagal';
  total: number;
  selesai: number;
  ringkas: string;
  /** Baris berkas yang dilewati parser di perangkat. */
  dilewati_berkas: { baris: number; alasan: string }[];
  /** Hitungan server. `sudah_ada`: data yang lebih dulu ada dan TIDAK ditimpa. */
  hasil: { disimpan: number; sudah_ada: number; dilewati: number };
  galat: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
  selesai_pada: string | null;
};

/**
 * Baris `settings_notifications` — satu per pengguna. Sakelar `<jenis>_aktif`
 * mengikuti KATALOG_NOTIFIKASI; jam dalam format kolom `time` ("06:30:00").
 */
export type SettingsNotificationsRow = {
  user_id: string;
  timbang_aktif: boolean;
  ukuran_aktif: boolean;
  ringkasan_aktif: boolean;
  evaluasi_aktif: boolean;
  sumber_aktif: boolean;
  jam_timbang: string;
  /** `null` = akhir pekan memakai jam hari kerja. */
  jam_timbang_akhir_pekan: string | null;
  /** Angka tampil di widget layar kunci. */
  widget_aktif: boolean;
  /** Selalu true — dikunci CHECK database. */
  notif_netral: true;
  created_at: string;
  updated_at: string;
};

/** Baris `daily_summaries` — dihitung server, hanya dibaca klien & widget. */
export type DailySummaryRow = {
  user_id: string;
  tanggal: string;
  nama_tipe_hari: string | null;
  target_kalori: number | null;
  target_protein_g: number | null;
  kalori: number;
  protein_g: number;
  /** Boleh negatif; `null` bila target tidak ada. */
  sisa_kalori: number | null;
  sisa_protein_g: number | null;
  sumber: JenisSumberDb;
  dihitung_pada: string;
};

/** Keluaran `ringkasan_widget` — langsung masukan `siapkanWidget`. */
export type RingkasanWidgetDb = MasukanWidget & { tanggal: string; tampilkanAngka: boolean };

/** Baris `copy_notifikasi` — konfigurasi, dibaca semua pengguna login. */
export type CopyNotifikasiRow = {
  jenis: 'timbang' | 'ukuran' | 'ringkasan' | 'evaluasi' | 'sumber';
  nama: string;
  kapan: string;
  judul: string;
  isi: string;
  diperbarui_pada: string;
};

/** Olahraga/jenis yang punya urutan prioritas sumber sendiri. */
export type OlahragaPrioritas = 'angkat_beban' | 'lari' | 'padel' | 'lainnya' | JenisDataKesehatan;

/** Sumber dalam urutan prioritas: sumber koneksi + `manual` (latihan saja). */
export type SumberPrioritas = HealthConnectionRow['sumber'] | 'manual';

/** Baris `source_priority` — urutan pilihan pengguna; tanpa baris = urutan bawaan. */
export type SourcePriorityRow = {
  id: string;
  user_id: string;
  olahraga: OlahragaPrioritas;
  sumber: SumberPrioritas;
  /** Makin tinggi makin diutamakan; unik per (pengguna, olahraga). */
  rank: number;
  created_at: string;
  updated_at: string;
};

/**
 * Satu angka per (hari, jenis) dari `agregat_kesehatan_harian`: total dari
 * SATU sumber dan SATU perangkat — tidak pernah dijumlah antar keduanya.
 */
export type AgregatKesehatanHarianRow = {
  tanggal: string;
  jenis: JenisDataKesehatan;
  nilai: number;
  satuan: HealthDataRow['satuan'];
  sumber: HealthConnectionRow['sumber'];
  asal: string | null;
  /** Sumber lain yang punya data hari itu tapi tidak dihitung. */
  sumber_diabaikan: HealthConnectionRow['sumber'][];
};

/** Jejak per baris dari `data_kesehatan_terhitung`, untuk menjelaskan pilihan. */
export type DataKesehatanTerhitungRow = Pick<
  HealthDataRow,
  'id' | 'tanggal' | 'jenis' | 'sumber' | 'asal' | 'nilai' | 'satuan'
> & {
  source_priority_rank: number;
  dihitung: boolean;
};

/** Sesi dari `latihan_terhitung`: per (hari, olahraga) hanya sumber teratas. */
export type LatihanTerhitungRow = Pick<WorkoutRow, 'id' | 'tanggal' | 'nama' | 'jenis' | 'sumber' | 'durasi_menit'>;

/**
 * Hasil `endpoint_budget_mingguan` — satu snapshot untuk seluruh layar Budget.
 *
 * Tidak memuat rincian kumulatif: ia turunan MURNI dari `budget.rincian`, jadi
 * klien menghitungnya lewat `rincianKumulatif` di @recomp/logika.
 */
export type EndpointBudgetRow = {
  hari_ini: string;
  minggu_mulai: string;
  fase: FaseProgram;
  budget: BudgetMingguanRow;
  /**
   * `null` bila pengguna belum punya tipe hari sama sekali. `day_type_id`
   * sengaja tidak disertakan: layar Budget tidak mengubah tipe hari.
   */
  target_hari_ini: Omit<TargetHarianRow, 'day_type_id'> | null;
  redistribusi: {
    /** true bila pekan itu sudah pernah diatur; kuotanya sekali per pekan. */
    kuota_terpakai: boolean;
    /** Pratinjau `sebar_rata`; tidak menulis apa pun. */
    tawaran: HasilRedistribusiRow;
    penerapan_terakhir: {
      id: string;
      opsi: OpsiRedistribusiDb;
      perlu_dipindah: number;
      terserap: number;
      tersisa: number;
      dibatasi_lantai: boolean;
      alasan: string | null;
      created_at: string;
    } | null;
  };
  proteksi_protein: ProteksiProteinRow;
  tdee: {
    min: number | null;
    maks: number | null;
    tengah: number | null;
    keyakinan: 'rendah' | 'sedang' | 'tinggi';
    hari_data: number;
    hari_tercatat: number;
  };
};

/** Opsi redistribusi; sama persis dengan OpsiRedistribusi di @recomp/logika. */
export type OpsiRedistribusiDb = 'sebar_rata' | 'tumpuk_satu_hari' | 'abaikan';

/** redistribusi_mingguan — satu penerapan redistribusi budget. */
export type RedistribusiMingguanRow = {
  id: string;
  user_id: string;
  /** Senin pekan yang disesuaikan. */
  minggu_mulai: string;
  opsi: OpsiRedistribusiDb;
  /** Negatif berarti kelebihan yang harus ditutup. */
  perlu_dipindah: number;
  terserap: number;
  /** Yang TIDAK terserap; database menjamin terserap + tersisa = perlu_dipindah. */
  tersisa: number;
  dibatasi_lantai: boolean;
  alasan: string | null;
  created_at: string;
};

/** redistribusi_hari — perubahan target kalori per hari. */
export type RedistribusiHariRow = {
  id: string;
  redistribusi_id: string;
  user_id: string;
  tanggal: string;
  target_lama: number;
  target_baru: number;
  kena_lantai: boolean;
};

/** fase_periode — riwayat fase program. */
export type FasePeriodeRow = {
  id: string;
  user_id: string;
  fase: FaseProgram;
  mulai_tanggal: string;
  /** `null` berarti periode yang sedang berjalan; hanya boleh satu. */
  selesai_tanggal: string | null;
  /** Rata-rata 7 hari saat periode dimulai; jangkar koridor target. */
  berat_awal_kg: number | null;
  created_at: string;
};

export type WorkoutRow = {
  id: string;
  user_id: string;
  /** Sudah dinormalisasi ke Asia/Jakarta sebelum ditulis. */
  tanggal: string;
  nama: string;
  jenis: JenisOlahragaDb;
  sumber: SumberWorkoutDb;
  durasi_menit: number | null;
  external_id: string | null;
  /** Waktu mulai asli; bila ada, `tanggal` = tanggal WIB-nya (dijaga CHECK). */
  waktu_mulai: string | null;
  created_at: string;
};

/** Hasil `deteksi_tipe_hari`: tebakan tipe hari beserta dasarnya. */
export type DeteksiTipeHariRow = {
  day_type_id: string;
  nama: string;
  /** Workout yang menentukan hasilnya, mis. "Push Day A (hevy)". */
  dasar: string[];
};

export type FoodLogRow = {
  id: string;
  user_id: string;
  daily_log_id: string;
  nama_makanan: string;
  foto_url: string | null;
  kalori: number;
  protein_g: number;
  lemak_g: number;
  karbo_g: number;
  sat_fat_g: number;
  sumber: SumberMakananDb;
  created_at: string;
};

/** Bentuk skema yang dipahami supabase-js untuk pengetikan query. */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { user_id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      day_types: {
        Row: DayTypeRow;
        Insert: Partial<DayTypeRow> & { user_id: string; nama: string };
        Update: Partial<DayTypeRow>;
        Relationships: [];
      };
      day_type_targets: {
        Row: DayTypeTargetRow;
        Insert: Omit<DayTypeTargetRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<DayTypeTargetRow>;
        Relationships: [];
      };
      daily_logs: {
        Row: DailyLogRow;
        Insert: Partial<DailyLogRow> & { user_id: string; tanggal: string };
        Update: Partial<DailyLogRow>;
        Relationships: [];
      };
      fase_periode: {
        Row: FasePeriodeRow;
        Insert: Partial<FasePeriodeRow> & {
          user_id: string;
          fase: FaseProgram;
          mulai_tanggal: string;
        };
        Update: Partial<FasePeriodeRow>;
        Relationships: [];
      };
      redistribusi_mingguan: {
        Row: RedistribusiMingguanRow;
        Insert: Omit<RedistribusiMingguanRow, 'id' | 'created_at'>;
        Update: Partial<RedistribusiMingguanRow>;
        Relationships: [];
      };
      redistribusi_hari: {
        Row: RedistribusiHariRow;
        Insert: Omit<RedistribusiHariRow, 'id'>;
        Update: Partial<RedistribusiHariRow>;
        Relationships: [];
      };
      ringkasan_mingguan: {
        Row: RingkasanMingguanRow;
        Insert: Omit<RingkasanMingguanRow, 'id' | 'created_at'>;
        Update: Partial<RingkasanMingguanRow>;
        Relationships: [];
      };
      evaluasi_periodik: {
        Row: EvaluasiPeriodikRow;
        Insert: Omit<EvaluasiPeriodikRow, 'id' | 'created_at'>;
        Update: Partial<EvaluasiPeriodikRow>;
        Relationships: [];
      };
      percakapan: {
        Row: PercakapanRow;
        Insert: Omit<PercakapanRow, 'id' | 'diperbarui_pada' | 'created_at'> & {
          diperbarui_pada?: string;
        };
        Update: Partial<PercakapanRow>;
        Relationships: [];
      };
      pesan_coach: {
        Row: PesanCoachRow;
        Insert: Omit<PesanCoachRow, 'id' | 'urutan' | 'waktu' | 'created_at'> & {
          waktu?: string;
        };
        Update: Partial<PesanCoachRow>;
        Relationships: [];
      };
      alert_pinggang: {
        Row: AlertPinggangRow;
        Insert: Omit<AlertPinggangRow, 'id' | 'urutan' | 'created_at'>;
        Update: Partial<AlertPinggangRow>;
        Relationships: [];
      };
      body_measurements: {
        Row: BodyMeasurementRow;
        Insert: Omit<BodyMeasurementRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<BodyMeasurementRow>;
        Relationships: [];
      };
      health_connections: {
        Row: HealthConnectionRow;
        /** Klien: hanya `sumber: 'apple_health'` (RLS menolak yang lain). */
        Insert: Pick<HealthConnectionRow, 'user_id' | 'sumber'> &
          Partial<Pick<HealthConnectionRow, 'status' | 'sinkron_terakhir' | 'galat_terakhir' | 'galat_pada'>>;
        Update: Partial<
          Pick<HealthConnectionRow, 'status' | 'sinkron_terakhir' | 'galat_terakhir' | 'galat_pada'>
        >;
        Relationships: [];
      };
      workout_sets: {
        Row: WorkoutSetRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      copy_notifikasi: {
        Row: CopyNotifikasiRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      daily_summaries: {
        Row: DailySummaryRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      settings_notifications: {
        Row: SettingsNotificationsRow;
        Insert: Pick<SettingsNotificationsRow, 'user_id'> &
          Partial<Omit<SettingsNotificationsRow, 'user_id' | 'created_at' | 'updated_at'>>;
        Update: Partial<Omit<SettingsNotificationsRow, 'user_id' | 'notif_netral' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      import_jobs: {
        Row: ImportJobRow;
        /** Lewat `mulai_impor`; ditulis langsung hanya untuk job milik sendiri. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      health_data: {
        Row: HealthDataRow;
        /** Klien: hanya `sumber: 'apple_health'`, selama koneksinya terhubung. */
        Insert: Omit<HealthDataRow, 'id' | 'satuan' | 'tanggal' | 'created_at' | 'updated_at'>;
        Update: Partial<Pick<HealthDataRow, 'nilai' | 'waktu_mulai' | 'waktu_selesai'>>;
        Relationships: [];
      };
      source_priority: {
        Row: SourcePriorityRow;
        Insert: Omit<SourcePriorityRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Pick<SourcePriorityRow, 'rank'>>;
        Relationships: [];
      };
      food_logs: {
        Row: FoodLogRow;
        Insert: Omit<FoodLogRow, 'id' | 'created_at'>;
        Update: Partial<FoodLogRow>;
        Relationships: [];
      };
      workouts: {
        Row: WorkoutRow;
        Insert: Omit<WorkoutRow, 'id' | 'created_at'>;
        Update: Partial<WorkoutRow>;
        Relationships: [];
      };
    };
    Views: {
      v_tipe_hari_aktif: {
        Row: TipeHariAktifRow;
        Relationships: [];
      };
    };
    Functions: {
      simpan_berat_pagi: {
        Args: {
          p_tanggal: string;
          p_berat_kg: number;
          p_sumber: SumberBeratDb;
        };
        Returns: DailyLogRow;
      };
      setel_tipe_hari: {
        Args: {
          p_tanggal: string;
          p_day_type_id: string;
          p_override: boolean;
        };
        Returns: DailyLogRow;
      };
      ambil_target_harian: {
        Args: { p_tanggal: string };
        Returns: TargetHarianRow[];
      };
      catat_makanan: {
        Args: {
          p_tanggal: string;
          p_nama_makanan: string;
          p_kalori: number;
          p_protein_g: number;
          p_lemak_g: number;
          p_karbo_g: number;
          p_sat_fat_g: number;
          p_sumber: SumberMakananDb;
          p_foto_url: string | null;
        };
        Returns: FoodLogRow;
      };
      simpan_catatan_harian: {
        Args: { p_tanggal: string; p_catatan: string | null };
        Returns: DailyLogRow;
      };
      ambil_catatan_harian: {
        Args: { p_tanggal: string };
        Returns: string | null;
      };
      ringkasan_harian: {
        Args: { p_tanggal: string };
        Returns: RingkasanHarianRow[];
      };
      ringkasan_sisa_harian: {
        Args: { p_tanggal: string };
        Returns: RingkasanSisaRow[];
      };
      rata_rata_berat_7_hari: {
        Args: { p_tanggal: string };
        Returns: RataRataBeratRow[];
      };
      deret_rata_rata_7_hari: {
        Args: { p_dari: string; p_sampai: string };
        Returns: DeretRataRataRow[];
      };
      tren_berat_7_hari: {
        Args: { p_sampai: string; p_hari: number };
        Returns: TrenSnapshotRow;
      };
      awal_minggu: {
        Args: { p_tanggal: string };
        Returns: string;
      };
      budget_mingguan: {
        Args: { p_tanggal: string | null; p_hari_ini: string | null; p_ambang_kcal: number };
        Returns: BudgetMingguanRow;
      };
      kelipatan_redistribusi_kcal: {
        Args: Record<string, never>;
        Returns: number;
      };
      hitung_redistribusi: {
        Args: {
          p_tanggal: string | null;
          p_opsi: OpsiRedistribusiDb;
          p_tanggal_tumpuk: string | null;
          p_hari_ini: string | null;
        };
        Returns: HasilRedistribusiRow;
      };
      endpoint_budget_mingguan: {
        Args: {
          p_tanggal: string | null;
          p_hari_ini: string | null;
          p_ambang_kcal: number;
          p_persen_lemak: number | null;
        };
        Returns: EndpointBudgetRow;
      };
      simpan_ukuran: {
        Args: {
          p_tanggal: string | null;
          p_pinggang_cm: number | null;
          p_dada_cm: number | null;
          p_leher_cm: number | null;
          p_lengan_kiri_cm: number | null;
          p_lengan_kanan_cm: number | null;
          p_paha_kiri_cm: number | null;
          p_paha_kanan_cm: number | null;
          p_catatan: string | null;
        };
        Returns: BodyMeasurementRow;
      };
      hapus_ukuran: {
        Args: { p_tanggal: string };
        Returns: boolean;
      };
      periksa_alert_pinggang: {
        Args: { p_tanggal: string | null; p_catat: boolean };
        Returns: AlertPinggangHasilRow;
      };
      status_batas_pinggang: {
        Args: {
          p_pinggang_cm: number;
          p_batas_cm: number | null;
          p_laju_per_pekan: number | null;
          p_ambang_pekan: number | null;
        };
        Returns: StatusBatasPinggangRow | null;
      };
      sumber_gabungan: {
        Args: { p_sumber: JenisSumberDb[] };
        Returns: JenisSumberDb;
      };
      sumber_berat_periode: {
        Args: { p_dari: string; p_sampai: string };
        Returns: {
          sumber: JenisSumberDb;
          rincian: { manual: number; sinkron: number };
        };
      };
      sumber_kalori_periode: {
        Args: { p_dari: string; p_sampai: string };
        Returns: {
          sumber: JenisSumberDb;
          rincian: { entri_manual: number; entri_estimasi: number; total_entri: number };
        };
      };
      konteks_coach: {
        Args: { p_tanggal: string | null; p_persen_lemak: number | null };
        Returns: KonteksCoachRow;
      };
      riwayat_ukuran: {
        Args: { p_sampai: string | null; p_batas: number; p_maks_titik_laju: number };
        Returns: RiwayatUkuranRow;
      };
      evaluasi_4_mingguan: {
        Args: { p_sampai: string | null };
        Returns: Evaluasi4MingguanRow;
      };
      kuota_coach: {
        Args: Record<string, never>;
        Returns: KuotaCoachRow;
      };
      agregat_kesehatan_harian: {
        Args: { p_dari: string; p_sampai: string; p_user_id?: string | null };
        Returns: AgregatKesehatanHarianRow[];
      };
      data_kesehatan_terhitung: {
        Args: { p_dari: string; p_sampai: string; p_user_id?: string | null };
        Returns: DataKesehatanTerhitungRow[];
      };
      latihan_terhitung: {
        Args: { p_dari: string; p_sampai: string; p_user_id?: string | null };
        Returns: LatihanTerhitungRow[];
      };
      urutan_prioritas: {
        Args: { p_olahraga: OlahragaPrioritas };
        Returns: SumberPrioritas[];
      };
      atur_prioritas_sumber: {
        /** Dari yang paling diutamakan; `[]` = kembali ke urutan bawaan. */
        Args: { p_olahraga: OlahragaPrioritas; p_urutan: SumberPrioritas[] };
        Returns: SumberPrioritas[];
      };
      poin_ringkasan_mingguan: {
        Args: { p_minggu_mulai: string | null; p_user_id: string | null };
        Returns: PoinRingkasanMingguanRow;
      };
      simpan_ringkasan_mingguan: {
        Args: {
          p_minggu_mulai: string;
          p_bacaan: string;
          p_lanjutan: string[] | null;
          p_judul: string | null;
          p_user_id: string | null;
        };
        Returns: SimpanRingkasanRow;
      };
      estimasi_body_fat: {
        Args: { p_tanggal: string | null };
        Returns: EstimasiBodyFatRow;
      };
      ketidakpastian_bf: {
        Args: Record<string, never>;
        Returns: number;
      };
      estimasi_tdee: {
        Args: { p_sampai: string | null; p_hari: number; p_persen_lemak: number | null };
        Returns: EstimasiTdeeRow;
      };
      pengali_aktivitas: {
        Args: { p_nama: string };
        Returns: number;
      };
      kcal_per_kg: {
        Args: Record<string, never>;
        Returns: number;
      };
      proteksi_protein: {
        Args: { p_tanggal: string | null; p_hari_ini: string | null };
        Returns: ProteksiProteinRow;
      };
      terapkan_redistribusi: {
        Args: {
          p_tanggal: string | null;
          p_opsi: OpsiRedistribusiDb;
          p_tanggal_tumpuk: string | null;
          p_hari_ini: string | null;
          p_alasan: string | null;
        };
        Returns: HasilRedistribusiRow;
      };
      fase_pada_tanggal: {
        Args: { p_tanggal: string };
        Returns: FaseProgram;
      };
      ganti_fase: {
        Args: { p_fase: FaseProgram; p_tanggal: string | null };
        Returns: FasePeriodeRow;
      };
      deteksi_tipe_hari: {
        Args: { p_tanggal: string; p_user_id: string | null };
        Returns: DeteksiTipeHariRow[];
      };
      ikuti_auto_deteksi: {
        Args: { p_tanggal: string };
        Returns: DailyLogRow;
      };
      mulai_impor: {
        Args: {
          p_sumber: SumberImporDb;
          p_total: number;
          p_ringkas: string;
          p_dilewati?: { baris: number; alasan: string }[];
        };
        Returns: ImportJobRow;
      };
      impor_batch: {
        /** `{ sesi }` untuk hevy_csv, `{ baris }` untuk ukuran_lama, KirimanHealthKit untuk apple_health. */
        Args: { p_job: string; p_isi: Record<string, unknown> };
        Returns: ImportJobRow;
      };
      selesaikan_impor: {
        Args: { p_job: string; p_galat?: string | null };
        Returns: ImportJobRow;
      };
      impor_terakhir: {
        Args: Record<string, never>;
        Returns: ImportJobRow[];
      };
      ringkasan_widget: {
        Args: Record<string, never>;
        Returns: RingkasanWidgetDb;
      };
      pengaturan_notifikasi: {
        Args: Record<string, never>;
        Returns: SettingsNotificationsRow;
      };
      simpan_pengaturan_notifikasi: {
        /** Sebagian saja; kunci tak dikenal & `notif_netral` ditolak (22023) dengan pesan terbaca. */
        Args: {
          p_perubahan: Partial<Omit<SettingsNotificationsRow, 'user_id' | 'notif_netral' | 'created_at' | 'updated_at'>>;
        };
        Returns: SettingsNotificationsRow;
      };
      snapshot_hari_ini: {
        Args: { p_tanggal?: string | null; p_user_id?: string | null };
        Returns: SnapshotHariIni;
      };
      sinkron_healthkit: {
        Args: { p_kiriman: KirimanHealthKit };
        Returns: HasilSinkronHealthKit;
      };
    };
    Enums: {
      fase_program: FaseProgram;
      jenis_sumber: JenisSumberDb;
      sumber_berat: SumberBeratDb;
      sumber_makanan: SumberMakananDb;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
