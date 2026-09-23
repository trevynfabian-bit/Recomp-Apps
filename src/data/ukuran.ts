import { supabase } from '@/lib/supabase';
import { lajuTerkini, ringkasPerubahan, statusBatasPinggang } from '@recomp/logika';
import type { RingkasanPerubahan, StatusBatasPinggang, TitikUkuran } from '@recomp/logika';
import type {
  AlertPinggangHasilRow,
  AlertPinggangRow,
  BodyMeasurementRow,
  EstimasiBodyFatRow,
  RiwayatUkuranRow,
} from '@/types/database';

/**
 * Akses data ukuran tubuh mingguan.
 *
 * Satu aturan memegang seluruh berkas ini: `undefined` berarti "jangan ubah",
 * dan itu diteruskan apa adanya ke RPC `simpan_ukuran` sebagai NULL. Pengguna
 * yang pekan ini hanya mengukur pinggang tidak boleh menghapus dada, leher,
 * lengan, dan paha yang ia catat sebelumnya di tanggal yang sama — dan
 * kehilangan seperti itu tidak menimbulkan satu pun pesan kesalahan, jadi ia
 * harus dicegah, bukan dideteksi.
 *
 * Konsekuensinya: satu bagian tubuh tidak bisa DIKOSONGKAN lewat `simpanUkuran`.
 * Memperbaiki salah ketik berarti mengetik angka yang benar; pencatatan yang
 * seluruhnya salah dibatalkan lewat `hapusUkuran`.
 */

export class KesalahanUkuran extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanUkuran';
  }
}

/** Satu pencatatan ukuran tubuh; bagian yang tidak diukur bernilai `null`. */
export type PencatatanUkuran = {
  id: string;
  tanggal: string;
  pinggangCm: number | null;
  dadaCm: number | null;
  leherCm: number | null;
  lenganKiriCm: number | null;
  lenganKananCm: number | null;
  pahaKiriCm: number | null;
  pahaKananCm: number | null;
  catatan: string | null;
};

/**
 * Estimasi body fat beserta masukannya.
 *
 * `alasanKosong` sengaja TIDAK ada: server mengirim kode `kurang`, dan
 * kalimatnya disusun `estimasiBodyFatNavy` di @recomp/logika supaya hanya ada
 * satu penyusun kalimat.
 */
export type BuktiBodyFat = {
  metode: 'Navy';
  persen: number | null;
  rentang: { bawah: number; atas: number } | null;
  ketidakpastian: number;
  sensitivitasPinggang: number | null;
  kurang: EstimasiBodyFatRow['kurang'];
  komposisi: { lemakKg: number; bebasLemakKg: number } | null;
  beratKg: number | null;
  /** Tanggal pencatatan yang dipakai; `null` bila belum ada yang bisa dipakai. */
  tanggalUkuran: string | null;
  masukan: {
    jenisKelamin: 'pria' | 'wanita' | null;
    tinggiCm: number | null;
    pinggangCm: number | null;
    leherCm: number | null;
    pinggulCm: number | null;
  };
};

/** Bagian tubuh yang bisa dicatat; kuncinya dipakai grafik & riwayat. */
export type BagianTubuh =
  | 'pinggangCm'
  | 'dadaCm'
  | 'leherCm'
  | 'lenganKiriCm'
  | 'lenganKananCm'
  | 'pahaKiriCm'
  | 'pahaKananCm';

/** Nilai yang DIKETIK pengguna, dalam sentimeter. */
export type UkuranBaru = Partial<Record<BagianTubuh, number>> & {
  /** `null` berarti hari ini menurut Asia/Jakarta, dihitung SERVER. */
  tanggal?: string | null;
  /** `''` mengosongkan catatan; `undefined` membiarkannya. */
  catatan?: string;
};

/**
 * Simpan pencatatan ukuran untuk satu tanggal.
 *
 * Bagian yang tidak disebut TIDAK berubah. Tanggal masa depan ditolak server —
 * jam perangkat bisa salah, dan titik bertanggal depan tidak pernah bisa
 * dikoreksi oleh pencatatan berikutnya.
 */
export async function simpanUkuran(ukuran: UkuranBaru): Promise<PencatatanUkuran> {
  const { data, error } = await supabase.rpc('simpan_ukuran', {
    p_tanggal: ukuran.tanggal ?? null,
    p_pinggang_cm: ukuran.pinggangCm ?? null,
    p_dada_cm: ukuran.dadaCm ?? null,
    p_leher_cm: ukuran.leherCm ?? null,
    p_lengan_kiri_cm: ukuran.lenganKiriCm ?? null,
    p_lengan_kanan_cm: ukuran.lenganKananCm ?? null,
    p_paha_kiri_cm: ukuran.pahaKiriCm ?? null,
    p_paha_kanan_cm: ukuran.pahaKananCm ?? null,
    p_catatan: ukuran.catatan ?? null,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanUkuran('Server tidak mengembalikan pencatatan.', true);
  return kePencatatanTs(data as BodyMeasurementRow);
}

/** Hapus seluruh pencatatan di satu tanggal; false bila tidak ada. */
export async function hapusUkuran(tanggal: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('hapus_ukuran', { p_tanggal: tanggal });

  if (error) throw terjemahkan(error);
  return data === true;
}

/**
 * Estimasi persen lemak tubuh dari pencatatan ukuran terakhir.
 *
 * SELALU dikembalikan sebagai rentang, tidak pernah satu angka telanjang: galat
 * baku metode Navy terhadap DXA sekitar ±4 poin pada individu, jadi 18% bisa
 * saja 14% atau 22% pada tubuh yang sama. Yang jauh lebih bisa dipercaya adalah
 * ARAHNYA dari pekan ke pekan, karena galat yang sama ikut terbawa di setiap
 * pengukuran dan sebagian besar saling meniadakan saat dibandingkan dengan diri
 * sendiri.
 *
 * `kurang` membedakan EMPAT sebab kegagalan yang berbeda, dan bedanya penting:
 * "lengkapi profil" dan "periksa lagi meteranmu" menuntut tindakan yang tidak
 * sama, dan menyamakan keduanya jadi "tidak bisa dihitung" membuat orang
 * memperbaiki hal yang salah.
 */
export async function estimasiBodyFat(
  tanggal: string | null = null,
): Promise<BuktiBodyFat> {
  const { data, error } = await supabase.rpc('estimasi_body_fat', { p_tanggal: tanggal });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanUkuran('Server tidak mengembalikan estimasi.', true);

  const j = data as EstimasiBodyFatRow;
  const angka = (n: number | null) => (n === null ? null : Number(n));

  return {
    metode: j.metode,
    persen: angka(j.persen),
    rentang: j.rentang
      ? { bawah: Number(j.rentang.bawah), atas: Number(j.rentang.atas) }
      : null,
    ketidakpastian: j.ketidakpastian,
    sensitivitasPinggang: angka(j.sensitivitas_pinggang),
    kurang: j.kurang,
    komposisi: j.komposisi
      ? {
          lemakKg: Number(j.komposisi.lemak_kg),
          bebasLemakKg: Number(j.komposisi.bebas_lemak_kg),
        }
      : null,
    beratKg: angka(j.berat_kg),
    tanggalUkuran: j.masukan.tanggal_ukuran,
    masukan: {
      jenisKelamin: j.masukan.jenis_kelamin,
      tinggiCm: angka(j.masukan.tinggi_cm),
      pinggangCm: angka(j.masukan.pinggang_cm),
      leherCm: angka(j.masukan.leher_cm),
      pinggulCm: angka(j.masukan.pinggul_cm),
    },
  };
}

/** Riwayat pencatatan, lama → baru (urutan yang dipakai grafik & selisih). */
export async function riwayatUkuran(batas = 52): Promise<PencatatanUkuran[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .order('tanggal', { ascending: false })
    .limit(batas);

  if (error) throw terjemahkan(error);
  return ((data ?? []) as BodyMeasurementRow[])
    .map(kePencatatanTs)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

/**
 * Riwayat lengkap beserta DELTA per bagian tubuh, dihitung server.
 *
 * Nilai mentahnya hampir tidak berguna dibaca berderet: "85,4 — 85,2 — 84,8"
 * memaksa orang mengurangi di kepala tiap kali. Yang dicari selalu
 * perubahannya, dan perubahan itu baru bermakna kalau jaraknya ikut disebut —
 * +0,3 cm dalam 3 hari dan +0,3 cm dalam 12 hari adalah dua hal yang sangat
 * berbeda.
 *
 * Kenapa dari server padahal `perubahanBagian` di bawah bisa menghitungnya dari
 * `riwayatUkuran`: angka yang sama dibaca AI coach lewat function calling, dan
 * ia tidak bisa menjalankan TypeScript. `npm run cek:paritas` membuktikan
 * keduanya identik.
 */
export async function riwayatDanDelta(
  sampai: string | null = null,
  batas = 12,
  maksTitikLaju = 4,
): Promise<RiwayatUkuranRow> {
  const { data, error } = await supabase.rpc('riwayat_ukuran', {
    p_sampai: sampai,
    p_batas: batas,
    p_maks_titik_laju: maksTitikLaju,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanUkuran('Server tidak mengembalikan riwayat.', true);
  return data as RiwayatUkuranRow;
}

/**
 * Periksa keadaan batas pinggang dan apakah peringatan perlu dikirim.
 *
 * Aturan pengirimannya ada di SERVER, bukan di layar, dan itu disengaja: layar
 * hanya bisa memperingatkan saat dibuka, padahal justru pengguna yang berhenti
 * membuka layar ukuran yang paling perlu diingatkan. Notifikasi dan AI coach
 * juga membaca angka yang sama tanpa bisa menjalankan TypeScript.
 *
 * `perluKirim` true HANYA saat keadaannya MEMBURUK dibanding yang terakhir
 * tercatat. Mengirim "pinggangmu masih di atas batas" setiap pekan adalah cara
 * tercepat membuat orang mematikan notifikasi — dan setelah itu peringatan yang
 * benar-benar penting pun tidak akan sampai.
 *
 * @param catat `false` menjadikannya PRATINJAU: melaporkan keadaan tanpa
 *   menulis jejak, jadi layar bisa menampilkannya tanpa menghabiskan
 *   kesempatan pengiriman notifikasinya.
 */
export async function periksaAlertPinggang(
  tanggal: string | null = null,
  catat = false,
): Promise<AlertPinggangHasilRow> {
  const { data, error } = await supabase.rpc('periksa_alert_pinggang', {
    p_tanggal: tanggal,
    p_catat: catat,
  });

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanUkuran('Server tidak mengembalikan keadaan batas.', true);
  return data as AlertPinggangHasilRow;
}

/** Jejak keadaan batas pinggang, terbaru lebih dulu. */
export async function riwayatAlertPinggang(batas = 20): Promise<AlertPinggangRow[]> {
  const { data, error } = await supabase
    .from('alert_pinggang')
    .select('*')
    .order('urutan', { ascending: false })
    .limit(batas);

  if (error) throw terjemahkan(error);
  return data ?? [];
}

/**
 * Deret satu bagian tubuh, melewati tanggal yang bagian itu tidak diukur.
 *
 * Dilewati, BUKAN diisi nol: satu titik nol di tengah deret akan membuat
 * seluruh grafik dan seluruh laju per pekan salah, dan salahnya terlihat
 * dramatis justru karena datanya tidak ada.
 */
export function deretBagian(
  catatan: PencatatanUkuran[],
  bagian: BagianTubuh,
): TitikUkuran[] {
  return catatan
    .filter((c) => c[bagian] !== null)
    .map((c) => ({ tanggal: c.tanggal, nilai: c[bagian] as number }));
}

/** Riwayat perubahan satu bagian tubuh, memakai aturan @recomp/logika. */
export function perubahanBagian(
  catatan: PencatatanUkuran[],
  bagian: BagianTubuh,
): RingkasanPerubahan {
  return ringkasPerubahan(deretBagian(catatan, bagian));
}

/**
 * Keadaan pinggang terhadap batas yang ditetapkan pengguna.
 *
 * Lajunya diambil dari beberapa pencatatan terakhir sekaligus lewat
 * `lajuTerkini`, bukan dari satu selang terakhir: satu pekan yang aneh
 * (dehidrasi, meteran bergeser sesentimeter) akan mengubah kesimpulannya
 * seluruhnya.
 */
export function statusPinggang(
  catatan: PencatatanUkuran[],
  batasCm: number | null,
): StatusBatasPinggang | null {
  const deret = deretBagian(catatan, 'pinggangCm');
  const terakhir = deret[deret.length - 1];
  if (!terakhir) return null;
  return statusBatasPinggang(terakhir.nilai, batasCm, lajuTerkini(deret));
}

function kePencatatanTs(r: BodyMeasurementRow): PencatatanUkuran {
  const angka = (n: number | null) => (n === null ? null : Number(n));
  return {
    id: r.id,
    tanggal: r.tanggal,
    pinggangCm: angka(r.pinggang_cm),
    dadaCm: angka(r.dada_cm),
    leherCm: angka(r.leher_cm),
    lenganKiriCm: angka(r.lengan_kiri_cm),
    lenganKananCm: angka(r.lengan_kanan_cm),
    pahaKiriCm: angka(r.paha_kiri_cm),
    pahaKananCm: angka(r.paha_kanan_cm),
    catatan: r.catatan,
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan yang di-`raise` oleh RPC.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanUkuran {
  switch (error.code) {
    case '22003':
      // Dua sebab memakai kode ini: satu bagian di luar rentang, dan batas
      // jumlah pencatatan di luar 1–260. Pesan RPC-nya sudah menyebut mana yang
      // terjadi beserta angkanya, jadi ia lebih menolong daripada kalimat umum
      // apa pun yang bisa ditulis di sini.
      return new KesalahanUkuran(error.message, false);
    case '22004': // null_value_not_allowed — pencatatan baru tanpa ukuran
      return new KesalahanUkuran('Isi setidaknya satu ukuran sebelum menyimpan.', false);
    case '22007': // invalid_datetime_format — tanggal masa depan
      return new KesalahanUkuran('Tanggal itu masih di masa depan.', false);
    case '23505': // unique_violation — dua pencatatan di tanggal sama
      return new KesalahanUkuran(
        'Tanggal itu sudah punya pencatatan. Muat ulang lalu coba lagi.',
        true,
      );
    case '23514': // check_violation — catatan kepanjangan
      return new KesalahanUkuran('Catatan maksimal 500 karakter.', false);
    case '28000':
    case 'PGRST301':
      return new KesalahanUkuran('Sesi Anda berakhir. Masuk lagi untuk mencatat ukuran.', false);
    default:
      return new KesalahanUkuran('Gagal menyimpan ukuran. Periksa koneksi lalu coba lagi.', true);
  }
}
