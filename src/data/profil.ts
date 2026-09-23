import { supabase } from '@/lib/supabase';
import { periksaBatasPinggang, periksaTinggi, simpanPanjang } from '@recomp/logika';
import type { Fase, Satuan } from '@recomp/logika';
import type { ProfileRow } from '@/types/database';

/**
 * Akses data profil tubuh: tinggi, jenis kelamin, satuan tampilan.
 *
 * Satu aturan memegang seluruh berkas ini: yang DITULIS selalu metrik (cm, kg),
 * apa pun satuan tampilan pengguna. `satuan` cuma memilih cara menampilkan.
 * Menyimpan angka dalam satuan berbeda-beda per pengguna berarti setiap rumus
 * — Mifflin-St Jeor, Navy, batas pinggang — harus tahu satuan pemiliknya, dan
 * satu rumus yang lupa akan salah 2,54 kali tanpa hasilnya terlihat aneh.
 *
 * Karena itu fungsi simpan di bawah menerima angka DALAM SATUAN PENGGUNA
 * beserta satuannya, lalu mengonversinya SEKALI. Yang tidak boleh terjadi:
 * mengambil angka yang sedang tampil di layar (sudah dibulatkan untuk dibaca)
 * lalu menuliskannya kembali — 85,4 cm tampil 33,6 in dan kembali jadi 85,3 cm.
 */

export class KesalahanProfil extends Error {
  constructor(
    pesan: string,
    /** true bila mencoba lagi masuk akal (mis. jaringan putus). */
    readonly bisaDiulang: boolean,
  ) {
    super(pesan);
    this.name = 'KesalahanProfil';
  }
}

/** Profil tubuh dalam bentuk TS; panjang SELALU dalam cm. */
export type ProfilTubuh = {
  nama: string | null;
  satuan: Satuan;
  faseAktif: Fase;
  tinggiCm: number | null;
  jenisKelamin: 'pria' | 'wanita' | null;
  tanggalLahir: string | null;
  batasPinggangCm: number | null;
  batasBawahKalori: number;
};

export async function ambilProfil(): Promise<ProfilTubuh> {
  const { data, error } = await supabase.from('profiles').select('*').single();

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanProfil('Profil tidak ditemukan.', false);
  return keProfilTs(data as ProfileRow);
}

/**
 * Simpan sebagian isi profil tubuh.
 *
 * @param ubahan angka DALAM SATUAN PENGGUNA — yang ia ketik, bukan yang sedang
 *   tampil di layar. Konversi ke cm dilakukan di sini, sekali.
 * @param satuan satuan yang dipakai angka di `ubahan`.
 *
 * Field yang tidak disebut tidak disentuh. `null` yang DISEBUTKAN berarti
 * mengosongkan — itu perlu dibedakan dari "tidak disebut", karena mengosongkan
 * tinggi badan adalah tindakan yang sah (salah isi lalu ingin dibersihkan).
 */
export async function simpanProfilTubuh(
  ubahan: {
    nama?: string | null;
    satuan?: Satuan;
    tinggi?: number | null;
    jenisKelamin?: 'pria' | 'wanita' | null;
    tanggalLahir?: string | null;
    batasPinggang?: number | null;
    batasBawahKalori?: number;
  },
  satuan: Satuan,
): Promise<ProfilTubuh> {
  const perubahan: Partial<ProfileRow> = {};

  if ('nama' in ubahan) perubahan.nama = ubahan.nama ?? null;
  if (ubahan.satuan !== undefined) perubahan.satuan = ubahan.satuan;
  if ('jenisKelamin' in ubahan) perubahan.jenis_kelamin = ubahan.jenisKelamin ?? null;
  if ('tanggalLahir' in ubahan) perubahan.tanggal_lahir = ubahan.tanggalLahir ?? null;
  if (ubahan.batasBawahKalori !== undefined) {
    perubahan.batas_bawah_kalori = ubahan.batasBawahKalori;
  }

  // Diperiksa di klien LEBIH DULU supaya pesannya menyebut angka & satuan yang
  // sama dengan yang dilihat pengguna. CHECK di database tetap jadi jaring
  // terakhir — ia menolak apa pun yang lolos dari sini, termasuk tulisan dari
  // klien lain.
  if ('tinggi' in ubahan) {
    const tinggi = ubahan.tinggi;
    if (tinggi === null || tinggi === undefined) {
      perubahan.tinggi_cm = null;
    } else {
      const keluhan = periksaTinggi(tinggi, satuan);
      if (keluhan) throw new KesalahanProfil(keluhan, false);
      perubahan.tinggi_cm = simpanPanjang(tinggi, satuan);
    }
  }

  if ('batasPinggang' in ubahan) {
    const batas = ubahan.batasPinggang;
    if (batas === null || batas === undefined) {
      perubahan.batas_pinggang_cm = null;
    } else {
      const keluhan = periksaBatasPinggang(batas, satuan);
      if (keluhan) throw new KesalahanProfil(keluhan, false);
      perubahan.batas_pinggang_cm = simpanPanjang(batas, satuan);
    }
  }

  if (Object.keys(perubahan).length === 0) return ambilProfil();

  const { data, error } = await supabase
    .from('profiles')
    .update(perubahan)
    .select()
    .single();

  if (error) throw terjemahkan(error);
  if (!data) throw new KesalahanProfil('Profil tidak ditemukan.', false);
  return keProfilTs(data as ProfileRow);
}

function keProfilTs(r: ProfileRow): ProfilTubuh {
  return {
    nama: r.nama,
    satuan: r.satuan,
    faseAktif: r.fase_aktif,
    tinggiCm: r.tinggi_cm === null ? null : Number(r.tinggi_cm),
    jenisKelamin: r.jenis_kelamin,
    tanggalLahir: r.tanggal_lahir,
    batasPinggangCm: r.batas_pinggang_cm === null ? null : Number(r.batas_pinggang_cm),
    batasBawahKalori: r.batas_bawah_kalori,
  };
}

/**
 * Ubah kesalahan Postgres/PostgREST menjadi pesan berbahasa Indonesia.
 * Kode SQLSTATE-nya sengaja dicocokkan dengan CHECK di migrasi profil.
 */
function terjemahkan(error: { code?: string; message: string }): KesalahanProfil {
  if (error.code === '23514') {
    // Pesannya menyebut nama constraint, jadi bisa dipetakan ke kalimat yang
    // menyebut FIELD-nya — bukan "nilai ditolak database" yang tidak menolong.
    if (error.message.includes('tinggi')) {
      return new KesalahanProfil('Tinggi badan di luar rentang yang masuk akal.', false);
    }
    if (error.message.includes('batas_pinggang')) {
      return new KesalahanProfil('Batas pinggang di luar rentang yang masuk akal.', false);
    }
    if (error.message.includes('batas_bawah')) {
      return new KesalahanProfil('Batas bawah kalori harus antara 1.000 dan 5.000 kkal.', false);
    }
    if (error.message.includes('jenis_kelamin')) {
      return new KesalahanProfil('Jenis kelamin hanya boleh pria atau wanita.', false);
    }
    if (error.message.includes('satuan')) {
      return new KesalahanProfil('Satuan hanya boleh metrik atau imperial.', false);
    }
    if (error.message.includes('tanggal_lahir')) {
      return new KesalahanProfil('Tanggal lahir tidak masuk akal.', false);
    }
    return new KesalahanProfil('Nilai profil ditolak database.', false);
  }

  switch (error.code) {
    case '28000':
    case 'PGRST301':
      return new KesalahanProfil('Sesi Anda berakhir. Masuk lagi untuk mengubah profil.', false);
    default:
      return new KesalahanProfil('Gagal memuat profil. Periksa koneksi lalu coba lagi.', true);
  }
}
