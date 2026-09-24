# Panduan Singkat Token Tema

Untuk siapa pun yang ingin mengubah **tampilan** Recomp Coach (warna, ukuran
huruf, jarak) tanpa harus memahami kodenya. Butuh sekitar 5 menit dibaca.

## Apa itu token?

Token adalah **nama untuk sebuah pilihan desain**. Alih-alih menulis "warna
oranye #F0A202" di 19 layar, setiap layar menulis "warna aksen". Nilai
sebenarnya disimpan di **satu tempat**.

Analoginya seperti kontak di ponsel: Anda menelepon "Ibu", bukan nomornya. Kalau
nomornya ganti, Anda cukup memperbarui satu kontak, dan semua panggilan
berikutnya otomatis ke nomor baru.

Artinya: **mengubah satu token = mengubah seluruh aplikasi**, dengan konsisten.

## Di mana tokennya?

Semua ada di folder `src/theme/`:

| Berkas | Isinya | Contoh |
|---|---|---|
| `colors.ts` | Warna, untuk mode gelap **dan** mode terang | warna latar, warna teks, warna aksen |
| `tokens.ts` | Ukuran huruf, jarak, sudut membulat, ukuran ikon | jarak antar-kartu, ukuran judul |
| `hig.ts` | Aturan kenyamanan dari Apple | tombol minimal 44×44 titik |

## Warna: pakai "peran", bukan nama warna

Setiap warna diberi nama menurut **tugasnya**, bukan rupanya. Dengan begitu,
warna bisa diganti tanpa membuat namanya jadi salah.

| Peran | Tugasnya | Gelap | Terang |
|---|---|---|---|
| `latar` | Latar belakang layar | hitam kebiruan | abu sangat muda |
| `permukaan` | Kartu dan panel | abu gelap | putih |
| `teks` | Tulisan utama | putih | hampir hitam |
| `teksRedup` / `teksSamar` | Keterangan dan label kecil | abu | abu tua |
| `aksen` | Tombol utama, angka terpenting | amber | amber tua |
| `status.sukses` | Semuanya baik, tersambung | hijau jade | jade tua |
| `status.peringatan` | Hampir lewat batas, perkiraan | amber | amber tua |
| `status.bahaya` | Lewat batas, hapus data | coral | coral tua |
| `status.info` | Keterangan netral | ungu | ungu tua |

Dua aturan yang tidak boleh dilanggar:

1. **Warna tidak pernah bekerja sendirian.** Setiap status juga ditulis atau
   diberi ikon ("mendekati batas", "lewat batas"), karena tidak semua orang
   bisa membedakan warna.
2. **Tulisan harus mudah dibaca** di kedua mode. Ini diperiksa otomatis
   (lihat "Memeriksa hasilnya" di bawah).

## Ukuran huruf: enam tingkat saja

| Nama | Ukuran | Dipakai untuk |
|---|---|---|
| `hero` | sangat besar | **satu** angka terpenting per layar |
| `display` | besar | judul layar masuk |
| `title` | sedang besar | judul layar |
| `body` | normal | tulisan biasa |
| `label` | kecil | nama baris, label tombol kecil |
| `caption` | paling kecil | label grup berhuruf kapital, satuan |

Tidak ada ukuran lain. Kalau terasa butuh ukuran baru, itu tanda tingkatannya
perlu dibahas dulu, bukan ditambah diam-diam.

## Jarak: tujuh langkah

`xxs` (2) · `xs` (4) · `sm` (8) · `md` (12) · `lg` (16) · `xl` (24) · `xxl` (32)

Aturan mudahnya: **lega di antara kartu (`xl`), rapat di dalam kartu (`sm`/`md`)**.

## Contoh: mengganti warna aksen

Misalnya amber ingin diganti menjadi oranye yang lebih merah.

1. Buka `src/theme/colors.ts`.
2. Cari baris `amber: '#F0A202'` di bagian mode gelap dan ubah nilainya. Lakukan
   juga di bagian mode terang (`amber: '#8A5A00'`) dengan versi yang lebih gelap.
3. Jalankan pemeriksaan (di bawah). Kalau ada yang merah, warnanya kurang
   kontras: gelapkan/terangkan sedikit, lalu periksa lagi.
4. Catat perubahan di tabel "Riwayat & perubahan" pada
   [`bab-desain-prd.md`](./bab-desain-prd.md).

Semua tombol, angka hero, tab aktif, dan grafik kalori ikut berubah sekaligus.

## Memeriksa hasilnya

Jalankan di terminal, dari folder proyek:

```bash
npm run cek:kontras   # apakah tulisan tetap terbaca di mode gelap & terang
npm run cek:desain    # apakah prinsip desain tetap terjaga
npm run cek:hardcode  # apakah ada layar yang menulis warna/ukuran sendiri

npm run cek:desain-semua  # ketiganya sekaligus, dengan satu ringkasan gabungan
```

Hasilnya berupa daftar centang (✓) atau silang (✗). Setiap silang menyebut
**berkas dan barisnya** beserta saran perbaikannya, misalnya:

```
✗ jarak tertanam (1)
    src/components/Pill.tsx:31  marginTop: 10  → pakai spacing.sm (8)
```

Di akhir setiap pemeriksaan selalu ada blok **Ringkasan**: berapa yang lulus
per bagian, totalnya, dan satu baris **HASIL: LULUS** atau **HASIL: GAGAL**
beserta daftar yang perlu diperbaiki. Cukup lihat blok terakhir itu, tidak
perlu menggulir seluruh daftar.

```
Ringkasan cek:hardcode
  ✗ Nilai tertanam  7/8 lulus
  Total: 7 lulus, 1 gagal dari 8 pemeriksaan

HASIL: GAGAL (1 pemeriksaan perlu diperbaiki)
  ✗ Nilai tertanam › jarak tertanam
```

## Yang sebaiknya TIDAK dilakukan

- Menulis kode warna (`#…`) langsung di layar. Selalu lewat `colors`.
- Menambah ukuran huruf atau jarak "sekali pakai".
- Membuat tombol lebih kecil dari 44×44 titik tanpa memperluas area
  sentuhnya.
- Menaruh dua angka hero di satu layar.

## Mau tahu lebih jauh?

- Aturan resmi: [`bab-desain-prd.md`](./bab-desain-prd.md)
- Alasan di balik setiap keputusan: [`arah-visual.md`](./arah-visual.md)
- Kondisi sebelum rombak: [`audit-token-layar.md`](./audit-token-layar.md)
- Di aplikasi (build pengembangan): **Setelan → Arah visual** menampilkan
  semua token ini di satu layar.
