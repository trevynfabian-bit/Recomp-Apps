# @recomp/logika

Logika hitungan bersama Recomp Coach. Dipakai **app iOS (Expo)** dan **web
dashboard (Next.js)** supaya angka yang dilihat pengguna sama di kedua tempat —
itu syarat eksplisit di PRD, dan juga yang membuat AI coach bisa mengambil angka
lewat function calling alih-alih menghitung sendiri.

## Isi

| Modul | Isi |
| --- | --- |
| `makro` | `hitungMakro`, `keteranganMakro` — sisa vs terpakai, sat fat sebagai BATAS |
| `deteksiTipeHari` | `deteksiTipeHari`, `alasanDeteksi` — tebakan tipe hari dari workout |
| `format` | format angka & tanggal Indonesia, helper Asia/Jakarta |
| `tipe` | tipe domain yang dipakai bersama |

## Dipakai tanpa langkah build

Paket ini mengekspor **TypeScript sumber** (`main` menunjuk ke `src/index.ts`).
Kedua konsumennya adalah bundler yang memang mem-bundle TypeScript (Metro dan
Next.js), jadi tidak ada langkah build, tidak ada artefak yang bisa basi, dan
"pergi ke definisi" mendarat di kode sungguhan.

Next.js perlu diberi tahu agar ikut mentranspile paket ini:

```js
// next.config.js di repo web
module.exports = { transpilePackages: ['@recomp/logika'] };
```

## Kenapa ada `npm run cek:paritas`

Sebagian aturan di sini juga hidup sebagai fungsi SQL, karena widget lock screen
membaca angka yang dihitung server (WidgetKit tidak bisa menjalankan paket TS).
Dua tempat berarti dua aturan yang bisa menyimpang diam-diam, jadi pemeriksaan
paritas menjalankan daftar kasus yang sama lewat keduanya dan membandingkan
hasilnya. Kalau salah satu sisi diubah tanpa yang lain, pemeriksaan itu gagal.

## Edge Function (Deno)

Edge Function tidak mengimpor `src/` langsung: Deno menolak impor relatif tanpa
akhiran, dan bundler-nya bekerja dari `supabase/functions`. Salinan turunan ada
di `supabase/functions/_shared/logika/` — satu-satunya perbedaan adalah akhiran
`.ts` pada impor relatif. Setelah mengubah berkas di `src/`, jalankan
`npm run salin:logika` lalu commit hasilnya; `npm run cek:edge` gagal bila
salinannya tertinggal.
