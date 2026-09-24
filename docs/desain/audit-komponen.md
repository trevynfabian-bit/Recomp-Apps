# Audit Komponen Inti

Titik awal fitur **Komponen Inti Terpadu** (Fase 3). Memotret 61 komponen di
`src/components/` dan 16 layar di `app/` untuk menjawab: bagian UI mana yang
sama tugasnya tetapi dibuat ulang di banyak tempat? Setiap temuan di bawah
menjadi task berikutnya di fitur ini. Halaman peraga (`app/peraga.tsx`)
menampilkan komponen inti dalam semua keadaannya, dan tumbuh bersama task-task
itu.

Diukur dengan menghitung `<Pressable`, `<TextInput`, `<ActivityIndicator`,
`<TombolUtama|TombolBertepi`, `<Card`, dan `<Modal|<KerangkaSheet` per berkas.

## 1. Tombol & aksi

| Temuan | Jumlah | Keterangan |
|---|---|---|
| `TombolUtama` / `TombolBertepi` dipakai | 16 berkas | Sebagian besar sheet dan layar `hasil-lab`, `target-harian`, `tambah-hasil-lab`. |
| **Tombol simpan buatan sendiri** dengan keadaan *menyimpan → tersimpan ✓* | 5 (`KartuTimbangPagi`, `SheetBatasPinggang`, `SheetCatatUkuran`, `SheetLengkapiProfil`, `target-harian`) | Pola yang sama (spinner, centang, label berganti, warna jade saat tersimpan) ditulis lima kali. `TombolUtama` hanya punya `memproses`, tidak punya *tersimpan*. |
| `Pressable` di layar & komponen | 101 | Campuran: baris yang bisa diketuk, chip, tautan teks, tombol bulat −/+, tombol ikon (tutup, kembali). Tombol kembali (`‹`) disalin di 10 layar. |
| Varian yang belum ada | – | Tombol **ukuran kecil** (chip aksi di kartu), **tombol teks/tautan** ("Ubah", "Lihat 4 nilai"), **tombol ikon** (tutup, kembali), keadaan **nonaktif** yang seragam. |

## 2. Kartu & kontainer

| Temuan | Jumlah | Keterangan |
|---|---|---|
| `Card` dipakai | 70 kejadian di 28 berkas | Sudah menjadi kontainer standar. |
| `Card flat` + `Pemisah` untuk daftar baris | Pengaturan, Privasi, Target harian | `Pemisah` didefinisikan lokal di `pengaturan.tsx`; daftar baris lain memakai `borderTopWidth` sendiri. |
| Kartu bertanda (tepi aksen/status) | `KartuRingkasanMingguan`, `DaftarRujukan`, `KartuPenolakanMedis`, `BannerBatasPinggang`, Strava "Terputus" | Tepi `tint(warna, 'tepi')` ditulis manual; tidak ada varian `Card` untuk "kartu yang perlu perhatian". |
| Sheet memakai `KerangkaSheet` | 10 | Kerangka standar (selubung, pegangan, label, isi bergulir). |
| **Sheet membuat `Modal` sendiri** | 6 (`KartuTimbangPagi`, `SheetBatasPinggang`, `SheetCatatFoto`, `SheetCatatUkuran`, `SheetLengkapiProfil`, `SheetRiwayatPercakapan`) | Selubung, pegangan, radius atas, dan animasi disalin; alasannya masing-masing butuh isi yang tidak bergulir atau tinggi tetap. |

## 3. Formulir & input

| Temuan | Jumlah | Keterangan |
|---|---|---|
| Komponen input bersama | 3 (`InputAngka`, `InputTarget`, `InputChat`) | Ketiganya berbeda tepi, tinggi, dan cara menampilkan unit. |
| **`TextInput` langsung di layar/sheet** | 14 di 11 berkas | `masuk` (3, lewat `gayaIsian` lokal), `KartuCatatan` (2), dan satu-satu di 9 sheet. Tinggi, padding, tepi fokus, dan pesan galat berbeda. |
| Pesan galat di bawah field | `masuk`, `SheetLengkapiProfil`, `SheetCatatUkuran`, `tambah-hasil-lab` | Warna `status.bahaya.teks`, tetapi posisi dan ikon berbeda. |
| Pemilih tanggal | `SheetCatatUkuran` (tombol geser hari) dan `tambah-hasil-lab` (ketik + "Hari ini") | Dua cara berbeda untuk tugas yang sama. |
| Kontrol segmen | `PilihSegmen` (Pengaturan), segmen tampilan di `target-harian`, pemilih fase, jenis kelamin | Tiga implementasi. |

## 4. Umpan balik status

| Temuan | Jumlah | Keterangan |
|---|---|---|
| Spinner `ActivityIndicator` | 9 komponen | Warna, ukuran, dan teks pendampingnya berbeda. |
| Keadaan **memuat / kosong / gagal** ditulis per layar | ±25 kalimat di 20 berkas (`hasil-lab` 15, `SheetHubungkanSumber` 9, `SheetSuntingTarget` 9, `coach` 8, …) | Kartu "Belum ada …" ditulis ulang dengan susunan berbeda; gagal kadang dengan tombol Coba lagi, kadang tanpa. `LayarMuatTarget` satu-satunya layar penuh yang rapi. |
| Banner | `BannerBatasPinggang`, `BannerDataMasuk`, `BannerEksporSiap` | Tiga banner, tiga susunan. |

## 5. Angka hero

| Temuan | Keterangan |
|---|---|
| `HeroNumber` di 7 layar data | Satu komponen, sudah dijaga `cek:desain`. |
| Angka "hampir hero" dibuat sendiri | `KartuTimbangPagi` (74,6), `KartuBodyFat` (16,5 %), `KartuTdee` (rentang), baris `StatKecil` di Tren/Hari Ini. Ukuran dan susunan unitnya berbeda dari `HeroNumber`, dan tidak ada varian "angka sekunder". |

## 6. Rencana (task berikutnya di fitur ini)

1. **Tombol & aksi** ✓ `Tombol` (varian utama/bertepi/merusak/teks, ukuran
   normal/kecil, keadaan nonaktif/memproses/berhasil) dan `TombolIkon`;
   `TombolUtama`/`TombolBertepi` kini pembungkus `Tombol`. Diterapkan: 4 tombol
   simpan buatan sendiri → `Tombol` dengan `memproses`/`berhasil`; tombol
   kembali di 11 layar → `TombolIkon`; 18 tautan/tombol teks → `Tombol
   varian="teks"` (nada aksen/netral/bahaya) atau `bertepi` kecil; 2 tombol
   isian buatan sendiri → `Tombol`.
2. **Kartu & kontainer** ✓ `Card nada` (aksen/sukses/peringatan/bahaya: tepi
   bertint), `Pemisah` (horizontal/penuh/vertikal; 3 salinan lokal dihapus),
   `DaftarBaris` (pemisah otomatis; dipakai 6 daftar di Pengaturan, Privasi,
   Widget & pengingat), `Panel` (area cekung di dalam kartu). Diterapkan: 4 kartu
   chat buatan sendiri → `Card bayangan={false}` (2 dengan `nada="aksen"`), 14
   panel → `Panel` (4 dengan `nada="bahaya"/"aksen"`, 3 dengan tepi bersyarat),
   7 pemisah vertikal → `Pemisah arah="vertikal"`.
3. **Formulir & input** ✓ `Isian`: label, kolom cekung, satuan, elemen ekor
   (mis. tampilkan sandi), keterangan, galat (ikon + kalimat, diumumkan ke
   pembaca layar), `ditandai` untuk galat bersama, nonaktif, dan tepi fokus
   (aksen, 2 px) / galat (bahaya, 2 px). Tepi keduanya dijaga `cek:kontras`.
   `PemilihAngka` (− angka 52 pt yang bisa diketik +, langkah/rentang/
   pembulatan di satu tempat) menggantikan stepper di `KartuTimbangPagi` dan
   `SheetBatasPinggang`; `PemilihTanggal` (‹ tanggal ›, tombol di batas rentang
   nonaktif) menggantikan penggeser tanggal di `SheetCatatUkuran`. Pengecualian
   ukuran huruf 52 pt kini hanya di `Pemilih.tsx`. Diterapkan: `InputAngka` dan
   `InputTarget` kini pembungkus `Isian`; kolom di `masuk` (email, sandi dengan
   tombol tampilkan sebagai `ekor`), `tambah-hasil-lab`, `SheetCatatFoto`,
   `SheetHapusAkun`, `SheetHubungkanSumber` (kunci API), `SheetLengkapiProfil`
   (tinggi), dan `KartuCatatan` (multibaris) memakai `Isian`; `gayaIsian` dan
   `Isian` lokal di `masuk` dihapus. Sengaja tetap khusus (3): `InputChat`
   (penyusun pesan dengan tombol kirim), `SheetImporRiwayat` (tempel CSV dalam
   Menlo), dan baris ukuran ringkas di `SheetCatatUkuran` (tabel 7 ukuran
   rata kanan dengan selisih).
4. **Umpan balik status** ✓ `KeadaanMemuat` (spinner + apa yang dimuat),
   `KeadaanKosong` (netral: apa yang akan tampil + cara mengisinya),
   `KeadaanGagal` (ikon + apa yang gagal + sebab + Coba lagi); masing-masing
   dalam tampilan `kartu`, `polos`, atau `layar`. `LayarMuatTarget` kini
   tersusun dari keduanya.
5. **Kartu angka hero**: varian sekunder untuk angka pendukung.

Halaman peraga: **Pengaturan → Peraga komponen** (build pengembangan).
