# Audit Token Tema & Konsistensi Layar

Titik awal siklus **Rombak Sistem Desain App**. Dokumen ini memotret kondisi
`src/theme/*`, `src/components/*`, dan layar di `app/` **sebelum** arah visual
baru diterapkan, supaya setiap keputusan berikutnya bisa diukur dari angka yang
sama. Lingkup: hanya aplikasi Expo. Angka, formula, dan perilaku data tidak
disentuh.

Cara mengulang pengukuran: hitung pola di bawah dengan `grep -rhoE` atas
`app/` dan `src/components/` (lihat bagian "Metode").

## 1. Kondisi token saat ini

| Berkas | Isi | Catatan |
|---|---|---|
| `src/theme/colors.ts` | `bg`, `surface`, `surfaceSunken`, `border`, `borderKuat`, `amber`, `coral`, `jade`, `aksenTeks.*`, `text`, `textMuted`, `textFaint`, `macro.*`, `macroTeks.*` | Penamaan campuran: sebagian bermakna (`surface`, `textMuted`), sebagian nama warna mentah (`amber`, `coral`, `jade`). Layar harus tahu bahwa "amber = aksen utama". Tidak ada token status (`sukses`, `peringatan`, `bahaya`). Hanya satu mode (gelap). |
| `src/theme/tokens.ts` | `spacing` (xs–xxl, skala 4pt), `radius` (sm–xl, pill), `typography` (hero, display, title, body, label, caption) | Tipografi tidak punya `lineHeight` dan hanya satu ketebalan per gaya. Tidak ada token jarak di bawah 4pt, padahal layar memakai 2 dan 3. |
| `src/theme/hig.ts` | `TAP_MIN` 44, `MAKS_SKALA_HERO` 1,3, `BAYANGAN_KARTU` | Sudah rapi. Warna bayangan heks mentah (`#000000`). |

Pemeriksa yang ada: `cek:desain` (satu angka hero, heks mentah, app.json gelap)
dan `cek:kontras` (47 pasangan WCAG AA). **Keduanya lulus** pada titik awal ini,
begitu juga `typecheck`.

## 2. Temuan pemakaian token

Angka di bawah dihitung dari 17 berkas `app/**` dan 61 berkas `src/components/*`.

| # | Temuan | Jumlah | Dampak | Arah perbaikan |
|---|---|---|---|---|
| T1 | `fontWeight` ditimpa manual setelah `...typography.x` | 152 (`'500'`×100, `'700'`×38, `'600'`×13, `'300'`×1) | Ketebalan teks tidak punya satu sumber; `label` + `'500'` dipakai 100 kali sebagai gaya de facto "teks keterangan" tanpa nama. | Tambah varian tipografi bernama (mis. `labelRegular`, `bodyStrong`) di `tokens.ts`. |
| T2 | `lineHeight` angka mentah | 139 (16, 19, 20, 23, 24, 36) | Tinggi baris ditebak per layar; nilai 19 dan 23 muncul karena `label`/`body` tidak membawa `lineHeight`. | Masukkan `lineHeight` ke setiap gaya tipografi. |
| T3 | Jarak mentah di luar skala `spacing` | 67 (`gap: 2`×30, `marginTop: 2`×13, `gap: 3`×9, `padding: 3`, `paddingTop: 5`, dst.) | Jarak rapat antar label dan nilai tidak punya token, jadi tiap komponen memilih 2, 3, atau 5. | Tambah `spacing.xxs = 2` dan ganti 3/5 ke skala. |
| T4 | Warna tint dibentuk dengan menempel alpha heks (`warna + '14'`) | 41 (`'55'`×18, `'1A'`×9, `'14'`×6, lainnya 8) | Opasitas tint tersebar; `cek:kontras` harus menebak campuran mana yang dipakai. Tidak akan berfungsi di mode terang tanpa diubah satu per satu. | Token `tint` bernama (mis. `alpha.lembut`, `alpha.tepi`) atau helper `tint(warna, tingkat)` di `src/theme`. |
| T5 | Dimensi mentah untuk elemen dekoratif | pegangan sheet `40×4` (7), titik `8×8`/`6×6`, garis `1` | Kecil, tetapi terduplikasi di tiap sheet. | Token `ukuran.pegangan`, `ukuran.titik`. |
| T6 | Ikon ukuran mentah | `size={18}`×6, `{20}`×6, `{22}`×6, `{14}`×1 | Tiga ukuran ikon tanpa aturan. | Token `ikon.kecil/sedang/besar`. |
| T7 | Warna aksen dipanggil lewat nama warna, bukan makna | `colors.amber` dipakai sebagai aksen, CTA, angka, dan tab aktif | Mengganti warna merek berarti mencari arti tiap pemakaian `amber`. | Lapisan semantik (`aksen`, `status.*`) di atas palet dasar. |

Hal yang **sudah baik** dan harus dipertahankan:

- Tidak ada `fontSize` mentah di layar; hanya 4 di komponen (`KartuTimbangPagi`,
  `SheetBatasPinggang`, `SheetHubungkanSumber`, `SheetImporRiwayat`) plus 2 di
  `PratinjauWidget` (pengecualian resmi).
- Tidak ada `borderRadius` mentah di layar kecuali 1 di `target-harian.tsx`.
- Tidak ada heks mentah di luar pengecualian `cek:desain`.
- Semua kontrol yang ditemukan memakai `TAP_MIN`.

## 3. Temuan konsistensi layar

Rute yang ada: 15 layar + 2 berkas tata letak. Angka "19 layar" di PRD
menghitung layar tab dan tumpukan ditambah layar pemuatan/galat yang dirender
di dalam rute (`LayarMuatTarget`, layar belum-dikonfigurasi di `tambah-hasil-lab`)
serta layar masuk dan tata letak tab. Daftar kerja lengkap disusun di task
"Inventaris & Audit Layar" (Fase 5).

| Layar | Jenis | Header | Judul | Hero | Kartu | Tombol bersama | Catatan |
|---|---|---|---|---|---|---|---|
| `(tabs)/index` | tab | sapaan + tanggal + Pill | `title` | 1 | 3 | 0 | – |
| `(tabs)/tren` | tab | judul + tanggal + Pill | `title` | 1 | 6 | 0 | – |
| `(tabs)/budget` | tab | judul + tanggal | `title` | 1 | 3 | 0 | 1 tint mentah |
| `(tabs)/coach` | tab | judul + tombol riwayat | `title` | 0 | 0 | 0 | Hero tidak relevan (layar chat) |
| `(tabs)/pengaturan` | tab | judul besar | **`display`** | 0 | 7 | 0 | Satu-satunya tab dengan judul `display`; 12 ketebalan manual |
| `ukuran` | tumpukan | ‹ + judul | `title` | 1 | 3 | 0 | Judul tanpa `accessibilityRole="header"` |
| `sumber-data` | tumpukan | ‹ + judul | `title` | 1 | 2 | 0 | Judul tanpa peran header |
| `latihan` | tumpukan | ‹ + judul | `title` | 1 | 2 | 0 | Judul tanpa peran header |
| `impor-riwayat` | tumpukan | ‹ + judul | `title` | 0 | 1 | 0 | Judul tanpa peran header |
| `widget-pengingat` | tumpukan | ‹ + judul | `title` | 0 | 5 | 0 | Judul tanpa peran header |
| `target-harian` | tumpukan | ‹ + judul | `title` | 1 | 5 | 0 | Berkas terbesar (750 baris); 21 ketebalan manual; 1 radius mentah |
| `privasi` | tumpukan | ‹ + judul | `title` | 0 | 3 | 0 | – |
| `hasil-lab` | tumpukan | ‹ + judul | `title` | 0 | 3 | 0 | 13 ketebalan manual |
| `tambah-hasil-lab` | modal (dari bawah) | ‹ + judul | `title` | 0 | 1 | 1 | Padding atas `xl` di keadaan kosong, `lg` di keadaan isi |
| `masuk` | publik | judul besar | **`display`** | 0 | 0 | 0 | Tombol dibuat manual |

| # | Temuan | Dampak | Arah perbaikan |
|---|---|---|---|
| L1 | Tombol kembali (Pressable bulat + glyph teks `‹`) disalin di **9 layar** | Satu perubahan gaya berarti 9 suntingan; glyph teks tidak menskala seperti ikon. | Komponen `HeaderLayar` dengan ikon `chevron-back`. |
| L2 | Judul layar tumpukan tidak seragam soal peran aksesibilitas: 4 dari 9 punya `accessibilityRole="header"` | VoiceOver tidak bisa melompat ke judul di 5 layar. | Peran header dibawa oleh `HeaderLayar`. |
| L3 | Skala judul tab tidak seragam (`display` di Pengaturan, `title` di tab lain) | Tab terasa dari keluarga berbeda. | Tetapkan satu gaya judul tab di bab Desain. |
| L4 | Padding bawah tidak seragam: tab memakai `spacing.xxl`, sebagian layar tumpukan `insets.bottom + spacing.xxl` | Isi terakhir bisa tertutup indikator beranda pada layar tanpa inset. | Kerangka layar bersama (`KerangkaLayar`). |
| L5 | Layar membuat tombol sendiri: `TombolUtama`/`TombolBertepi` hanya dipakai 5 komponen dan 1 layar, sementara layar punya 1–6 `Pressable` masing-masing | Keadaan nonaktif, tekan, dan memproses berbeda per layar. | Varian tombol diperluas (Fase 3) lalu dipakai di layar (Fase 5). |
| L6 | Keadaan memuat/kosong/gagal dibuat per layar (`ActivityIndicator` di 8 komponen, kartu "Belum ada …" ditulis ulang) | Pengalaman kosong/gagal tidak seragam. | Komponen umpan balik status (Fase 3). |
| L7 | Mode gelap dikunci (`app.json` `userInterfaceStyle: "dark"`, `StatusBar style="light"`, dan `cek:desain` mewajibkannya) | Mode terang tidak mungkin tanpa melonggarkan penjaga. | Fase 3 (mode terang) + Fase 4 (penjaga diperbarui). |

## 4. Prioritas untuk fase berikutnya

1. **Fase 1 (arah visual):** putuskan palet semantik, skala tipografi dengan
   `lineHeight` dan varian ketebalan, serta aturan kepadatan (T1, T2, T3, T7, L3).
2. **Fase 2 (token terpusat):** wujudkan keputusan itu di `src/theme/*`, tambah
   token tint/ikon/ukuran (T4, T5, T6), tandai token lama sebagai usang.
3. **Fase 3 (mode terang & komponen inti):** `HeaderLayar`, kerangka layar,
   tombol, input, umpan balik status (L1, L2, L4, L5, L6, L7).
4. **Fase 4–5:** penjaga desain diperbarui lalu diterapkan ke seluruh layar.

## Metode

```bash
grep -rhoE "fontWeight: '[0-9]+'" app src/components | sort | uniq -c
grep -rhoE "lineHeight: [0-9]+" app src/components | sort | uniq -c
grep -rhoE "(margin\w*|padding\w*|gap): [0-9]+" app src/components | sort | uniq -c
grep -rhoE "\+ '[0-9A-Fa-f]{2}'" app src/components | sort | uniq -c
grep -rhoE "size=\{[0-9]+\}" app src/components | sort | uniq -c
grep -rn "accessibilityLabel=\"Kembali\"" app
```

## 5. Setelah penerapan arah visual (Fase 1)

Diukur ulang setelah task "Terapkan arah visual ke seluruh layar":

| Temuan | Sebelum | Sesudah | Keterangan |
|---|---|---|---|
| T1 `fontWeight` manual | 152 | 8 (di luar `PratinjauWidget`) | Kini `labelBiasa` ×94, `bodyTebal` ×35, `bodySedang` ×12. Sisa: 3 span sisipan " · bawaan/aktif" di `target-harian` (sengaja lebih ringan dari baris induknya) dan 5 sel padat `MatriksTarget` (dibahas Fase 5). |
| T2 `lineHeight` mentah | 139 | 88 | Semua yang ikut varian bernama hilang; `body` 23 → 24. Sisanya (`caption` 16, `body` 24) hilang saat gaya dasar membawa `lineHeight` (Fase 2). |
| T3 jarak mentah | 67 | 11 | `spacing.xxs` (2) ditambahkan; `gap`/`marginTop` 2–3 memakai token. Sisa: inset kontrol segmen (`padding: 3`), offset optis garis dasar (3, 5), dan `padding: 0` pada input. |
| L3 judul tab | `display` di Pengaturan | `title` di semua tab | Pengaturan kini juga membawa `accessibilityRole="header"`. |
