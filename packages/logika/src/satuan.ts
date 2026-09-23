/**
 * Satuan tampilan: metrik ⇄ imperial.
 *
 * Aturan pokoknya satu, dan seluruh berkas ini ada untuk menjaganya: yang
 * DISIMPAN selalu metrik (cm, kg). Satuan hanyalah cara menampilkannya.
 * Menyimpan angka dalam satuan yang berbeda-beda per pengguna berarti setiap
 * rumus harus tahu satuan pemiliknya, dan satu rumus yang lupa akan salah 2,54
 * kali tanpa hasilnya terlihat aneh.
 *
 * Konsekuensinya yang harus dinyatakan terang-terangan: konversi ini TIDAK
 * bolak-balik tanpa kehilangan. 85,4 cm tampil sebagai 33,6 inci, dan 33,6 inci
 * kembali menjadi 85,3 cm — bukan 85,4. Karena itu nilai TAMPILAN tidak boleh
 * pernah ditulis kembali ke penyimpanan. Yang ditulis adalah angka yang
 * DIKETIK pengguna, dikonversi sekali.
 */

/** Definisi resmi inci: tepat 2,54 cm. */
export const CM_PER_INCI = 2.54;

/** Definisi resmi pon avoirdupois: tepat 0,45359237 kg. */
export const KG_PER_LB = 0.45359237;

export type Satuan = 'metrik' | 'imperial';

/** Label satuan panjang untuk dirangkai ke angka di layar. */
export function labelPanjang(satuan: Satuan): string {
  return satuan === 'imperial' ? 'in' : 'cm';
}

/** Label satuan berat untuk dirangkai ke angka di layar. */
export function labelBerat(satuan: Satuan): string {
  return satuan === 'imperial' ? 'lb' : 'kg';
}

/**
 * Panjang tersimpan (cm) → angka untuk DITAMPILKAN.
 * Dibulatkan ke 0,1 karena itu ketelitian yang masuk akal dibaca; jangan
 * dipakai sebagai masukan penyimpanan.
 */
export function tampilkanPanjang(cm: number, satuan: Satuan): number {
  return satuan === 'imperial' ? bulat(cm / CM_PER_INCI, 1) : bulat(cm, 1);
}

/** Panjang yang DIKETIK pengguna → nilai untuk disimpan (cm). */
export function simpanPanjang(nilai: number, satuan: Satuan): number {
  return satuan === 'imperial' ? bulat(nilai * CM_PER_INCI, 1) : bulat(nilai, 1);
}

/** Berat tersimpan (kg) → angka untuk DITAMPILKAN. */
export function tampilkanBerat(kg: number, satuan: Satuan): number {
  return satuan === 'imperial' ? bulat(kg / KG_PER_LB, 1) : bulat(kg, 2);
}

/** Berat yang DIKETIK pengguna → nilai untuk disimpan (kg). */
export function simpanBerat(nilai: number, satuan: Satuan): number {
  return satuan === 'imperial' ? bulat(nilai * KG_PER_LB, 2) : bulat(nilai, 2);
}

/**
 * Rentang masuk akal tinggi badan, dalam cm. Sama dengan CHECK
 * `profiles_tinggi_masuk_akal` di database: batas yang hanya ada di satu sisi
 * akan menolak di sisi lain dengan pesan yang tidak bisa dibaca pengguna.
 */
export const RENTANG_TINGGI_CM = { min: 100, maks: 250 };

/** Rentang masuk akal batas pinggang, dalam cm. Sama dengan CHECK di database. */
export const RENTANG_BATAS_PINGGANG_CM = { min: 50, maks: 160 };

/**
 * Periksa tinggi yang diketik pengguna, DALAM SATUANNYA SENDIRI.
 *
 * Mengembalikan pesan dalam bahasa Indonesia bila di luar rentang, `null` bila
 * wajar. Batasnya diterjemahkan ke satuan tampilan supaya pesannya menyebut
 * angka yang sama dengan yang dilihat pengguna di layar — "antara 39,4 dan
 * 98,4 in", bukan "antara 100 dan 250 cm" pada layar berisi inci.
 */
export function periksaTinggi(nilai: number, satuan: Satuan): string | null {
  const cm = simpanPanjang(nilai, satuan);
  if (cm >= RENTANG_TINGGI_CM.min && cm <= RENTANG_TINGGI_CM.maks) return null;
  const bawah = tampilkanPanjang(RENTANG_TINGGI_CM.min, satuan);
  const atas = tampilkanPanjang(RENTANG_TINGGI_CM.maks, satuan);
  return `Tinggi badan sebaiknya antara ${angka(bawah)} dan ${angka(atas)} ${labelPanjang(satuan)}.`;
}

/** Periksa batas pinggang yang diketik pengguna, dalam satuannya sendiri. */
export function periksaBatasPinggang(nilai: number, satuan: Satuan): string | null {
  const cm = simpanPanjang(nilai, satuan);
  if (cm >= RENTANG_BATAS_PINGGANG_CM.min && cm <= RENTANG_BATAS_PINGGANG_CM.maks) return null;
  const bawah = tampilkanPanjang(RENTANG_BATAS_PINGGANG_CM.min, satuan);
  const atas = tampilkanPanjang(RENTANG_BATAS_PINGGANG_CM.maks, satuan);
  return `Batas pinggang sebaiknya antara ${angka(bawah)} dan ${angka(atas)} ${labelPanjang(satuan)}.`;
}

function bulat(nilai: number, desimal: number): number {
  const f = 10 ** desimal;
  return Math.round(nilai * f) / f;
}

/** Desimal ditulis dengan koma, seperti angka lain di app ini. */
function angka(nilai: number): string {
  return String(nilai).replace('.', ',');
}
