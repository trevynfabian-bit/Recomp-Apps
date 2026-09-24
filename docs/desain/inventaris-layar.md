# Inventaris 19 Layar & Penyimpangan

| | |
|---|---|
| **Fase** | 5 — Konsistensi 19 Layar |
| **Acuan** | [`bab-desain-prd.md`](./bab-desain-prd.md) v1.5 |
| **Dasar** | Pemindaian kode pada 24 September 2026, setelah Fase 1–4 |

Daftar kerja Fase 5. Setiap layar dicatat bersama komponen yang ia tampilkan,
lalu setiap penyimpangan dari bab Desain diberi kode (`K1`…) supaya task
berikutnya bisa merujuknya dan menutupnya satu per satu.

## 1. Apa yang dihitung sebagai "19 layar"

15 rute produk, ditambah 4 tampilan layar penuh yang dirender di dalam rute
atau tata letak. Dua layar pengembang (`arah-visual`, `peraga`) hanya muncul di
build pengembangan dan dicatat terpisah.

| # | Layar | Berkas | Jenis | Hero | Sheet yang dibuka |
|---|---|---|---|---|---|
| 1 | Hari Ini | `app/(tabs)/index.tsx` | tab | 1 | SheetCatatFoto; KartuTimbangPagi (sheet sendiri) |
| 2 | Tren | `app/(tabs)/tren.tsx` | tab | 1 | – |
| 3 | Budget | `app/(tabs)/budget.tsx` | tab | 1 | SheetGantiFase |
| 4 | Coach | `app/(tabs)/coach.tsx` | tab | 0 (chat) | SheetRiwayatPercakapan |
| 5 | Setelan | `app/(tabs)/pengaturan.tsx` | tab | 0 | SheetLengkapiProfil, SheetGantiFase, SheetBatasPinggang, SheetEksporData, SheetKeluarAkun, SheetHapusAkun |
| 6 | Ukuran tubuh | `app/ukuran.tsx` | dorong | 1 | SheetCatatUkuran, SheetBatasPinggang, SheetLengkapiProfil |
| 7 | Target harian | `app/target-harian.tsx` | dorong | 1 | SheetGantiFase, SheetSuntingTarget |
| 8 | Sumber data | `app/sumber-data.tsx` | dorong | 1 | SheetHubungkanSumber, SheetPutuskanSumber |
| 9 | Impor riwayat | `app/impor-riwayat.tsx` | dorong | 0 | SheetImporRiwayat |
| 10 | Latihan | `app/latihan.tsx` | dorong | 1 | – |
| 11 | Widget & pengingat | `app/widget-pengingat.tsx` | dorong | 0 | SheetJamTimbang |
| 12 | Privasi | `app/privasi.tsx` | dorong | 0 | SheetEksporData, SheetHapusAkun |
| 13 | Hasil lab | `app/hasil-lab.tsx` | dorong | 0 | sheet hapus (KerangkaSheet) |
| 14 | Tambah hasil lab | `app/tambah-hasil-lab.tsx` | modal | 0 | sheet buang draf (KerangkaSheet) |
| 15 | Masuk | `app/masuk.tsx` | layar masuk | 0 | – |
| 16 | Memuat target | `src/components/LayarMuatTarget.tsx` | layar penuh | 0 | – |
| 17 | Gagal memuat target | `src/components/LayarMuatTarget.tsx` | layar penuh | 0 | – |
| 18 | Hasil lab belum dikonfigurasi | `app/tambah-hasil-lab.tsx` | keadaan layar | 0 | – |
| 19 | Bilah tab | `app/(tabs)/_layout.tsx` | tata letak | – | – |
| dev | Arah visual, Peraga | `app/arah-visual.tsx`, `app/peraga.tsx` | dorong (`__DEV__`) | 1 / 1 | – |

## 2. Yang sudah seragam (tidak perlu disentuh lagi)

Hasil Fase 1–4, dijaga oleh `npm run cek:desain-semua`:

- **Header:** semua layar kecuali Masuk memakai `HeaderLayar` (judul `title`,
  peran header, tombol kembali/tutup yang seragam).
- **Wadah gulir:** 16 dari 17 rute memakai pola yang sama
  (`paddingTop: insets.top + lg`, `paddingHorizontal: lg`, `gap: xl`; bawah
  `xxl`, ditambah inset bawah pada layar tumpukan). Pengecualian yang disengaja:
  Coach (lihat K8).
- **Angka hero:** paling banyak satu per layar, selalu lewat `KartuHero`.
- **Nilai tertanam:** nol warna, jarak, radius, ukuran huruf, atau ukuran ikon
  mentah. Warna diperiksa di seluruh `src` (bukan hanya layar), dan pratinjau
  widget layar kunci tidak lagi dibebaskan: warnanya dari `layarKunci`.
- **Kontras:** 264 pasangan lolos AA di kedua mode.
- **Sentuh:** setiap `Pressable` terbukti ≥ 44 pt.

## 3. Penyimpangan

Diurutkan dari yang paling terasa bagi pengguna.

### K1. Sheet yang merakit `Modal` sendiri (6)

Bab Desain 8.7: semua bottom sheet memakai `KerangkaSheet` (selubung, pegangan,
label, sudut `xl`, tinggi maks 88%, ketuk latar untuk menutup). Enam sheet
merakitnya sendiri, sehingga pegangan, label, radius, dan perilaku tutupnya
berbeda-beda.

| Komponen | Tampil di layar |
|---|---|
| `SheetBatasPinggang` | Ukuran, Setelan |
| `SheetCatatFoto` | Hari Ini |
| `SheetCatatUkuran` | Ukuran |
| `SheetLengkapiProfil` | Ukuran, Setelan |
| `SheetRiwayatPercakapan` | Coach |
| `KartuTimbangPagi` (sheet di dalam kartu) | Hari Ini |

### K2. Tombol yang digambar sendiri (6 tempat)

Bab Desain 8.6: aksi memakai `Tombol` / `TombolIkon`, supaya tinggi, radius,
keadaan tekan, keadaan memproses, dan haptik sama di mana-mana.

| Tempat | Yang dirakit sendiri | Padanan |
|---|---|---|
| `BannerBatasPinggang` | `TombolBanner` (utama/bertepi, warna status) | `Tombol` varian utama/bertepi + `nada` |
| `BannerEksporSiap` | tombol Bagikan/Unduh + tombol tutup | `Tombol` kecil (`memproses`) + `TombolIkon` |
| `PanelRedistribusi` | tombol "Terapkan redistribusi" | `Tombol` varian utama |
| `SheetJamTimbang` | `TombolGeser` −/+ | `TombolIkon` (seperti `PemilihAngka`) |
| `masuk.tsx` | tautan "Lupa kata sandi?" | `Tombol` varian teks (`memproses`) |
| `widget-pengingat.tsx` | tautan "Buka Pengaturan ›" | `Tombol` varian teks |

### K3. Kolom isian yang dirakit sendiri (4)

Bab Desain 8.6: kolom isian memakai `Isian` (label, tepi `garisKontrol`, fokus
aksen, galat ikon + kalimat).

| Tempat | Catatan |
|---|---|
| `SheetCatatUkuran` | baris lingkar (pinggang, perut, dst.): kolom + satuan sendiri |
| `SheetImporRiwayat` | kolom tempel CSV multi-baris |
| `KartuCatatan` | sunting catatan harian di tempat |
| `InputChat` | kolom pesan Coach. **Pengecualian wajar**: komposer chat punya bentuk sendiri (tombol kirim di dalam, tumbuh ke atas). Cukup diselaraskan tepi dan fokusnya dengan `Isian`. |

`PemilihAngka` (di `Pemilih.tsx`) memakai `TextInput` langsung dengan sengaja:
ia adalah kontrol angka dengan −/+ dan sudah mengikuti token yang sama.

### K4. Pilihan segmen/chip yang dirakit per layar (4)

Pola "pilih satu dari beberapa" muncul dalam empat bentuk berbeda:

| Tempat | Bentuk |
|---|---|
| `pengaturan.tsx` (Tampilan: Sistem/Gelap/Terang) | segmen 40 pt, isian `permukaan` |
| `target-harian.tsx` (tampilan matriks) | chip 36 pt, tepi aksen + tint |
| `PemilihFase` | kartu pilihan |
| `PemilihTipeHari` | chip dengan tombol tambah |

Minimal segmen dan chip dijadikan satu komponen bersama; `PemilihFase` boleh
tetap kartu karena setiap pilihan membawa keterangan panjang.

### K5. Keadaan kosong/memuat/gagal yang ditulis sendiri (5)

Bab Desain 8.10: `KeadaanMemuat` / `KeadaanKosong` / `KeadaanGagal`.

| Tempat | Sekarang |
|---|---|
| `coach.tsx` | "Belum ada percakapan" + saran, teks di tengah |
| `SheetRiwayatPercakapan` | "Belum ada percakapan tersimpan." teks polos |
| `SheetCatatFoto` | emoji 📷 + "Belum ada foto" |
| `KartuTimbangPagi` | "Belum ada catatan berat sebelumnya" |
| `GrafikTren` | "Belum ada timbangan untuk digambar." di dalam grafik |

Sudah memakai komponen keadaan: Hasil lab, Tambah hasil lab, Latihan,
`LayarMuatTarget`, `SheetHubungkanSumber`, `SheetCatatFoto` (gagal).
`GrafikTren` dan `KartuTimbangPagi` boleh tetap sebaris bila kalimatnya
mengikuti gaya `KeadaanKosong` (netral, menyebut apa yang akan tampil).

### K6. Ketebalan huruf ditimpa di dalam teks (3, `target-harian.tsx`)

Sisipan " · bawaan" / " · aktif" menimpa `fontWeight: bobot.biasa` di dalam
judul tebal. Bukan pelanggaran penjaga (memakai token), tapi lebih rapi sebagai
satu gaya bernama atau `Pill` kecil.

### K7. Layar Masuk tanpa kerangka layar bersama

Masuk sengaja tanpa `HeaderLayar` (tidak ada tempat untuk kembali). Yang perlu
diselaraskan hanya K2 (tautan "Lupa kata sandi?").

### K8. Coach memakai wadah sendiri (disengaja)

Layar chat: pesan menempel ke bawah, `padding: lg`, `gap: lg`, tanpa hero.
Dicatat sebagai pengecualian, bukan untuk diubah.

## 4. Ringkasan per layar

| Layar | K1 | K2 | K3 | K4 | K5 | K6 |
|---|---|---|---|---|---|---|
| Hari Ini | SheetCatatFoto, KartuTimbangPagi | – | KartuCatatan | – | SheetCatatFoto, KartuTimbangPagi | – |
| Tren | – | – | – | – | GrafikTren | – |
| Budget | – | PanelRedistribusi | – | – | – | – |
| Coach | SheetRiwayatPercakapan | – | InputChat (wajar) | – | layar + sheet | – |
| Setelan | SheetBatasPinggang, SheetLengkapiProfil | – | – | segmen Tampilan | – | – |
| Ukuran tubuh | SheetCatatUkuran, SheetBatasPinggang, SheetLengkapiProfil | BannerBatasPinggang | SheetCatatUkuran | – | – | – |
| Target harian | – | – | – | chip, PemilihFase, PemilihTipeHari | – | 3 |
| Impor riwayat | – | – | SheetImporRiwayat | – | – | – |
| Widget & pengingat | – | SheetJamTimbang, "Buka Pengaturan" | – | – | – | – |
| Privasi | – | BannerEksporSiap | – | – | – | – |
| Masuk | – | "Lupa kata sandi?" | – | – | – | – |
| Sumber data, Latihan, Hasil lab, Tambah hasil lab, layar penuh 16–19 | – | – | – | – | – | – |

Total: 6 sheet, 6 tombol, 4 kolom (1 wajar), 4 pemilih, 5 keadaan, 3 sisipan
ketebalan. Setelah semuanya ditutup, penjaga `cek:desain` diperluas supaya
penyimpangan K1–K3 tidak bisa kembali (sheet harus lewat `KerangkaSheet`,
`TextInput` hanya di komponen isian bersama).
