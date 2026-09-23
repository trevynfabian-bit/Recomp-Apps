/**
 * Halaman Privasi: status dalam bahasa sehari-hari.
 *
 * Setiap butir adalah PERNYATAAN yang bisa diperiksa terhadap cara app
 * bekerja — bukan janji umum ("kami menjaga privasi Anda"). Karena itu
 * butir yang bergantung pada keadaan (akun yang masuk, sumber yang
 * tersambung, widget, foto) disusun dari keadaan itu, dan yang tidak
 * bergantung pada keadaan menyebut mekanismenya (database menolak, server
 * menyimpan kunci) supaya orang tahu APA yang menjaga, bukan hanya bahwa
 * sesuatu dijaga.
 *
 * Setiap status berupa kata, tidak pernah warna atau ikon saja; `nada` hanya
 * memilih ikon pendamping.
 */

export type MasukanStatusPrivasi = {
  /** Email akun yang masuk di perangkat ini; null bila tidak masuk. */
  email: string | null;
  /** Nama sumber yang sedang tersambung, mis. ["Apple Health", "Strava"]. */
  sumberTerhubung: string[];
  /** Widget layar kunci menampilkan sisa kalori & protein. */
  widgetTampilkanAngka: boolean;
  /** Foto makanan disimpan bersama entrinya (Supabase Storage). */
  fotoMakananDisimpan: boolean;
};

export type KunciStatusPrivasi = 'database' | 'sesi' | 'sumber' | 'kunci-sumber' | 'coach' | 'ringkasan' | 'foto' | 'layar-kunci';

export type ButirStatusPrivasi = {
  kunci: KunciStatusPrivasi;
  judul: string;
  /** Keadaan dalam beberapa kata, selalu tampil sebagai teks. */
  status: string;
  /** Hanya memilih ikon: terkunci, informasi, atau hal yang terlihat orang lain. */
  nada: 'terjaga' | 'info' | 'terlihat';
  penjelasan: string;
};

function daftarKata(nama: string[]): string {
  if (nama.length <= 1) return nama.join('');
  return `${nama.slice(0, -1).join(', ')} dan ${nama[nama.length - 1]}`;
}

export function susunStatusPrivasi(m: MasukanStatusPrivasi): ButirStatusPrivasi[] {
  const n = m.sumberTerhubung.length;
  return [
    {
      kunci: 'database',
      judul: 'Data terkunci ke akun Anda',
      status: 'Aktif',
      nada: 'terjaga',
      penjelasan:
        'Database hanya menyerahkan baris milik akun yang masuk. Akun lain ditolak oleh database itu sendiri, bukan sekadar disembunyikan di layar.',
    },
    {
      kunci: 'sesi',
      judul: 'Masuk di perangkat ini',
      status: m.email ?? 'Tidak masuk',
      nada: 'info',
      penjelasan:
        'Perangkat ini menyimpan salinan target harian supaya app tetap terbuka tanpa sinyal. Keluar menghapus sesi, pengingat, dan salinan itu dari perangkat ini; data tetap tersimpan di akun Anda.',
    },
    {
      kunci: 'sumber',
      judul: 'Sumber data',
      status: n === 0 ? 'Belum ada yang tersambung' : `${n} tersambung, hanya membaca`,
      nada: 'terjaga',
      penjelasan:
        n === 0
          ? 'Saat disambungkan, app hanya membaca dari sumber data dan tidak menulis apa pun ke sana.'
          : `${daftarKata(m.sumberTerhubung)}. App hanya membaca dari ${n === 1 ? 'sumber ini' : 'sumber-sumber ini'} dan tidak menulis apa pun ke sana.`,
    },
    {
      kunci: 'kunci-sumber',
      judul: 'Kunci akses sumber data',
      status: 'Tidak terbaca app',
      nada: 'terjaga',
      penjelasan:
        'Token Strava dan WHOOP serta kunci API Hevy disimpan di server dan hanya dipakai server untuk mengambil data. App di ponsel tidak pernah menerimanya.',
    },
    {
      kunci: 'coach',
      judul: 'AI coach',
      status: 'Hanya saat Anda bertanya',
      nada: 'info',
      penjelasan:
        'Pertanyaan Anda dan ringkasan data yang relevan dikirim ke penyedia model AI (Anthropic) untuk menyusun jawaban. Pertanyaan soal obat atau dosis dijawab langsung di perangkat, tanpa dikirim.',
    },
    {
      kunci: 'ringkasan',
      judul: 'Ringkasan mingguan',
      status: 'Sekali sepekan',
      nada: 'info',
      penjelasan:
        'Angka pekan lalu dihitung di server, lalu model AI yang sama menuliskan narasinya. Angkanya sendiri tidak berasal dari model.',
    },
    {
      kunci: 'foto',
      judul: 'Foto makanan',
      status: m.fotoMakananDisimpan ? 'Disimpan di akun Anda' : 'Tidak disimpan',
      nada: 'info',
      penjelasan: m.fotoMakananDisimpan
        ? 'Foto dikirim ke model AI untuk menaksir makro, lalu disimpan bersama entri makanannya dan hanya terbaca akun Anda.'
        : 'Foto dikirim ke model AI untuk menaksir makro. Yang disimpan hanya nama makanan dan angkanya, bukan fotonya.',
    },
    {
      kunci: 'layar-kunci',
      judul: 'Layar kunci',
      status: m.widgetTampilkanAngka ? 'Widget menampilkan angka' : 'Tanpa angka',
      nada: m.widgetTampilkanAngka ? 'terlihat' : 'terjaga',
      penjelasan: m.widgetTampilkanAngka
        ? 'Notifikasi tidak pernah memuat berat, kalori, atau ukuran. Widget menampilkan sisa kalori dan protein, yang terbaca tanpa membuka kunci; bisa dimatikan di Widget & pengingat.'
        : 'Notifikasi tidak pernah memuat berat, kalori, atau ukuran, dan widget juga disetel tanpa angka.',
    },
  ];
}

/** Apa saja yang disimpan di akun, dalam kata-kata pengguna. */
export const DATA_TERSIMPAN: { judul: string; isi: string }[] = [
  { judul: 'Profil & program', isi: 'Tinggi, jenis kelamin, tanggal lahir, fase, dan target tiap tipe hari.' },
  { judul: 'Catatan harian', isi: 'Berat pagi, makanan, kalori dan makro, tipe hari, serta catatan Anda.' },
  { judul: 'Ukuran tubuh', isi: 'Pinggang, dada, lengan, paha, dan leher, beserta estimasi body fat.' },
  { judul: 'Dari sumber data', isi: 'Latihan, langkah, tidur, recovery, dan energi aktif dari sumber yang Anda sambungkan.' },
  { judul: 'Coach', isi: 'Percakapan dengan coach, ringkasan mingguan, dan evaluasi empat pekan.' },
  { judul: 'Hasil lab', isi: 'Yang Anda tambahkan sendiri; dibaca coach sebagai konteks, bukan dasar saran dosis.' },
];
