# Arah Visual Recomp Coach

Keputusan visual yang mengikat untuk aplikasi Expo (`app/`, `src/theme/`,
`src/components/`). Dokumen ini adalah sumber untuk bab **Desain** di PRD.
Berangkat dari [audit token & layar](./audit-token-layar.md).

Batas yang tidak berubah: angka, formula, dan perilaku data. Arah visual hanya
mengatur bagaimana angka itu tampil.

**Karakter:** athlete dashboard yang tenang. Gelap sebagai mode utama, satu
angka menonjol per layar, aksen hangat (amber/coral/jade), biru standar tetap
dihindari.

---

## 1. Palet & tema warna

### 1.1 Prinsip

1. **Dua lapis.** Palet *dasar* menyimpan nilai heks (nama warna). Palet
   *semantik* memberi makna (latar, teks, aksen, status). Layar dan komponen
   hanya memakai lapis semantik; lapis dasar hanya dibaca oleh `src/theme`.
2. **Isian vs teks.** Warna aksen punya dua varian: *isian* untuk bar, tombol,
   pill, dan mark grafik (ambang 3:1), dan *teks* untuk huruf kecil (ambang
   4,5:1). Aturan ini sudah berjalan (`aksenTeks`, `macroTeks`) dan dijadikan
   aturan resmi untuk semua peran.
3. **Warna tidak pernah sendirian.** Setiap status disertai label atau ikon
   (sudah dipakai di `BannerBatasPinggang`: "mendekati" vs "lewat" ditulis,
   bukan hanya diwarnai).
4. **Tidak ada biru standar.** Peran "informasi" memakai ungu karbo, bukan
   biru sistem.

### 1.2 Warna merek

| Peran | Isian | Teks kecil | Pemakaian |
|---|---|---|---|
| `aksen` (merek utama) | amber `#F0A202` | amber `#F0A202` | CTA utama, angka hero default, tab aktif, pilihan terpilih |
| `aksenKedua` | jade `#1B998B` | `#1DA697` | Fase aktif, protein, hal positif |
| `aksenKetiga` | coral `#E24E1B` | `#E97147` | Batas terlampaui, tindakan merusak |

Amber dipertahankan sebagai satu-satunya warna yang boleh menarik mata tanpa
alasan status: ia adalah "suara" merek. Jade dan coral hanya muncul bila ada
makna.

### 1.3 Warna status

| Status | Isian | Teks kecil | Arti | Contoh saat ini |
|---|---|---|---|---|
| `sukses` | jade `#1B998B` | `#1DA697` | on-track, tersambung, tersimpan | `IndikatorSinkron` segar, fase aktif |
| `peringatan` | amber `#F0A202` | `#F0A202` | mendekati batas, perlu perhatian | `BannerBatasPinggang` "mendekati" |
| `bahaya` | coral `#E24E1B` | `#E97147` | batas terlampaui, galat, hapus | `BannerBatasPinggang` "lewat", `TombolUtama merusak` |
| `info` | karbo `#7C6AE8` | `#9587EC` | keterangan netral yang perlu dibedakan dari teks biasa | penanda estimasi, catatan sumber |

`peringatan` sengaja berbagi hue dengan `aksen`. Membedakannya dengan warna
keempat (kuning) akan menambah suara di layar gelap yang sudah punya tiga
aksen hangat; pembedanya adalah ikon dan label, sesuai prinsip 1.1.3.

### 1.4 Nuansa latar & teks (mode gelap, mode utama)

| Peran | Nilai | Keterangan |
|---|---|---|
| `latar` | `#14151A` | Latar layar, splash, tab bar |
| `permukaan` | `#2A2D36` | Kartu, sheet |
| `permukaanCekung` | `#1C1E25` | Track progress, field isian |
| `garis` | `#343845` | Pemisah dekoratif (sengaja resesif, <2:1) |
| `garisKontrol` | `#727888` | Tepi kontrol (≥3:1, WCAG 1.4.11) |
| `teks` | `#F5F6F8` | Teks utama |
| `teksRedup` | `#9BA1AF` | Teks pendukung |
| `teksSamar` | `#8E94A3` | Label, unit, keterangan |
| `teksDiAtasIsian` | `#14151A` | Label di atas tombol/pill berisi warna aksen **atau status** |

Nilai heks mode gelap **tidak berubah** dari `src/theme/colors.ts` saat ini:
lapis semantik hanya menamai ulang. Dengan begitu pemeriksaan kontras yang
sudah lulus tetap berlaku.

**Koreksi yang ditemukan saat menyusun palet:** `TombolUtama merusak` menaruh
`text` (`#F5F6F8`) di atas coral, rasionya **3,64:1**, di bawah 4,5:1 untuk
label 16px tebal. Aturan resmi: label di atas isian apa pun memakai
`teksDiAtasIsian` (`#14151A` di atas coral = **4,64:1**). Sudah diperbaiki di
`src/components/Tombol.tsx` saat verifikasi (1.6).

### 1.5 Verifikasi kontras (WCAG 2.1 AA)

Dijalankan dengan `npm run cek:kontras`. Ambang: 4,5:1 teks kecil, 3:1 teks
besar, mark grafik, dan tepi kontrol. Semua pasangan mode gelap **lulus**.

| Peran | Pasangan terlemah | Rasio | Margin |
|---|---|---|---|
| `teks` | di `permukaan` | 12,7 | lebar |
| `teksSamar` | di `permukaan` | 4,53 | **paling tipis** bersama `aksenKetiga`: jangan digelapkan lagi |
| `aksen` teks | di `permukaan` | 6,5 | lebar |
| `aksenKedua` teks | di `permukaan` | 4,55 | tipis |
| `aksenKetiga` teks (`bahaya`) | di `permukaan` | 4,53 | **paling tipis**: setiap penggelapan `permukaan` harus diikuti penerangan varian ini |
| `info` teks | di `permukaan` | 4,55 | tipis |
| `teksDiAtasIsian` | di atas coral | 4,64 | tipis |
| `garisKontrol` | di `permukaan` | 3,12 | pas di ambang |
| bar makro | vs track `permukaanCekung` | ≥3,0 | lulus |
| `garis` (dekoratif) | vs `permukaan` | 1,18 | sengaja <2,0 |

Pasangan yang ditambahkan ke `cek:kontras` pada verifikasi ini: `info` di `latar`
dan `permukaanCekung`, `aksenKedua`/`aksenKetiga` teks di `latar`. Pasangan
`teks` di atas coral **tidak** didaftarkan karena gagal (3,64:1), dan aturan
`teksDiAtasIsian` membuatnya tidak dipakai lagi.

Aturan pakai yang lahir dari verifikasi:

- Teks status di dalam banner bertint dihitung terhadap **warna campuran**, bukan
  latar dasarnya (sudah dilakukan `cek:kontras`).
- Sub-label di atas latar pilihan terpilih memakai `teksRedup`, bukan
  `teksSamar` (3,94:1, gagal).
- Pasangan baru di layar wajib ditambahkan ke `cek:kontras` bersamaan dengan
  kodenya.

### 1.6 Mode terang (arah, difinalkan di Fase 3)

Mode terang memakai peran yang sama dengan nilai berbeda. Titik awal yang sudah
dihitung rasionya:

| Peran | Nilai awal | Rasio di permukaan `#FFFFFF` |
|---|---|---|
| `latar` / `permukaan` / `permukaanCekung` | `#F4F5F7` / `#FFFFFF` / `#E9EBEF` | – |
| `teks` / `teksRedup` / `teksSamar` | `#14151A` / `#4A4F5C` / `#5C6170` | 18,2 / 8,2 / 6,2 |
| `aksen` teks | `#8F5E00` | 5,6 |
| `aksenKedua` teks | `#0E7166` | 5,9 |
| `aksenKetiga` teks | `#B23A10` | 6,0 |
| `info` teks | `#5B4BC4` | 6,5 |

Catatan untuk Fase 3: amber isian `#F0A202` hanya 1,8:1 terhadap track terang,
sehingga bar kalori di mode terang butuh varian isian yang lebih gelap; `garisKontrol`
terang harus di bawah `#8A909E` agar lolos 3:1 di atas `permukaanCekung`.

---

## 2. Tipografi & skala teks

### 2.1 Rupa huruf

**Huruf sistem** (SF Pro di iOS, Roboto di Android, font sistem di web). Tidak
ada font kustom: Dynamic Type, angka tabular, dan rendering tajam didapat
gratis, dan tidak ada berkas font yang perlu dimuat sebelum layar pertama.
`expo-font` tetap terpasang hanya untuk ikon. Satu pengecualian yang sah:
`Menlo` untuk pratinjau isi CSV di `SheetImporRiwayat` (teks mesin, bukan UI).

**Angka:** angka yang berubah di tempat (hero, stepper, tabel makro) memakai
`fontVariant: ['tabular-nums']` supaya lebar digit tetap dan angka tidak
"menari" saat nilainya berganti. Diwujudkan sebagai token di Fase 2.

### 2.2 Tangga ukuran

Enam ukuran, tidak ditambah. Setiap gaya **membawa `lineHeight` sendiri**
sehingga layar tidak perlu lagi menulis 16/19/20/23/24 secara manual (139
kejadian di audit).

| Gaya | Ukuran | Tinggi baris | Ketebalan | Tracking | Pemakaian |
|---|---|---|---|---|---|
| `hero` | 64 | 68 | 800 | −2 | **Satu** angka utama per layar (`HeroNumber`) |
| `display` | 34 | 40 | 700 | −0,8 | Judul layar publik (masuk) dan angka sekunder besar |
| `title` | 20 | 26 | 700 | −0,3 | Judul layar (tab & tumpukan), judul sheet |
| `body` | 16 | 24 | 500 | 0 | Teks isi dan nilai di baris |
| `label` | 13 | 19 | 600 | 0 | Label kontrol, nama baris, judul kecil di kartu |
| `caption` | 11 | 16 | 600 | +0,6 | Label huruf kapital di atas grup, unit kecil, keterangan grafik |

Tinggi baris dipilih dari nilai yang **sudah paling sering** ditulis manual
(`label` 19 ×47, `caption` 16 ×46, `body` 24 ×15) supaya penerapannya tidak
menggeser tata letak. `body` 23 (×12) dibulatkan ke 24.

### 2.3 Aturan ketebalan

Hanya empat ketebalan yang boleh ada: **500, 600, 700, 800**.

| Ketebalan | Nama | Boleh untuk |
|---|---|---|
| 500 | biasa | Teks isi (`body`) dan teks keterangan (`labelBiasa`) |
| 600 | sedang | `label`, `caption`, judul kartu (`bodySedang`), label tombol bertepi |
| 700 | tebal | `title`, `display`, label tombol utama & nilai yang ditekankan (`bodyTebal`) |
| 800 | hero | Hanya `hero` |

Varian bernama menggantikan penimpaan manual `fontWeight` (152 kejadian di
audit):

| Varian | Dasar | Menggantikan | Kejadian |
|---|---|---|---|
| `labelBiasa` | `label` + 500 | `label, fontWeight: '500'` (± `lineHeight`) | 92 |
| `bodyTebal` | `body` + 700 | `body, fontWeight: '700'` | 30 |
| `bodySedang` | `body` + 600 | `body, fontWeight: '600'` | 12 |

Kombinasi lain (`label` 700, `caption` 500/700: 6 kejadian) dilebur ke varian
terdekat saat layarnya diseragamkan di Fase 5. Ketebalan 300 dilarang di UI
aplikasi; satu-satunya pemakaiannya ada di `PratinjauWidget`, yang meniru jam
layar kunci iOS dan memang dikecualikan dari palet.

### 2.4 Aturan pakai

- Tidak ada `fontSize` mentah di layar atau komponen (pengecualian:
  `PratinjauWidget`). Ukuran di luar tangga berarti tangganya perlu dibahas,
  bukan ditambal di tempat.
- Tidak menimpa `fontWeight` atau `lineHeight` setelah `...typography.x`; pakai
  varian bernama.
- Huruf kapital hanya untuk `caption` (label grup), selalu lewat
  `textTransform: 'uppercase'`, bukan huruf kapital yang diketik.
- Dynamic Type: teks isi menskala penuh; hanya `hero` yang dibatasi
  `MAKS_SKALA_HERO` (1,3).
