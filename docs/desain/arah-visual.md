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

### 2.5 Hierarki teks di komponen

Empat tingkat, dari yang paling menonjol. Satu kartu memakai paling banyak tiga.

| Tingkat | Gaya | Warna | Contoh |
|---|---|---|---|
| 1. Angka | `hero` (sekali per layar) atau `title` + `angkaTabular` | `aksen` / `teks` | `HeroNumber`, nilai di `MacroRow` |
| 2. Judul | `title` (layar/sheet), `bodySedang` (kartu/baris) | `teks` | judul layar, nama baris pengaturan |
| 3. Keterangan | `labelBiasa` | `teksRedup` | kalimat di bawah judul kartu, keterangan hero |
| 4. Label grup & unit | `caption` (kapital untuk grup) atau `label` | `teksSamar` | `SectionHeader`, unit "kcal", label di atas input |

Label tombol: `bodyTebal` untuk tombol utama, `bodySedang` untuk tombol bertepi.

Sudah diterapkan pada komponen inti: `HeroNumber` (keterangan `labelBiasa`,
angka tabular), `MacroRow` (angka tabular), `InputAngka` (angka tabular),
`TombolUtama`/`TombolBertepi` (varian bernama), `LayarMuatTarget` (keterangan
`labelBiasa`, tinggi baris `body` 24). `SectionHeader`, `Pill`, `Card`, dan
`KerangkaSheet` sudah sesuai hierarki tanpa perubahan.

---

## 3. Kepadatan tata letak

### 3.1 Karakter

**Lega di tingkat layar, rapat di dalam kartu.** Jarak antar-kartu besar
(`xl` 24) supaya satu angka hero dan kartu-kartu di bawahnya terbaca sebagai
blok terpisah; di dalam kartu, label dan nilai dirapatkan supaya satu kartu
terbaca sekali lirik. Kepadatan ini tidak berubah dari kondisi sekarang: audit
menunjukkan layar sudah memakainya secara konsisten, yang belum ada hanya
namanya.

### 3.2 Token jarak (skala 4pt + satu langkah 2pt)

| Token | Nilai | Pemakaian | Kejadian saat audit |
|---|---|---|---|
| `xxs` **(baru)** | 2 | Label ↔ nilai yang menempel (judul + subjudul header, nama + angka di baris makro) | 43 literal (`gap: 2` ×30, `marginTop: 2` ×13) |
| `xs` | 4 | Ikon ↔ teks, pill vertikal | 75 |
| `sm` | 8 | Antar-baris dalam satu grup | 164 |
| `md` | 12 | Antar-grup dalam kartu, padding field isian, jarak di bawah `SectionHeader` | 179 |
| `lg` | 16 | Padding kartu, margin sisi layar, padding atas layar | 137 |
| `xl` | 24 | **Antar-kartu di layar**, padding sheet | 48 |
| `xxl` | 32 | Padding bawah layar (di atas inset) | 15 |

Aturan:

- Tidak ada angka jarak mentah. Nilai 3 dan 5 (11 kejadian) dibulatkan ke
  `xxs`/`xs`; `spacing.xs + 1` (12 kejadian, padding vertikal pill) menjadi
  token `ukuran.pillVertikal` di Fase 2, bukan aritmetika di tempat.
- Layar: `paddingHorizontal: lg`, `paddingTop: insets.top + lg`,
  `paddingBottom: insets.bottom + xxl`, `gap: xl` antar-blok. Satu kerangka
  layar bersama (Fase 3) memegang aturan ini.
- Kartu: `padding: lg`, isi dengan `gap: sm` (dalam grup) atau `md` (antar-grup).
- Sheet: `padding: xl`, `gap: lg`.

### 3.3 Token radius

| Token | Nilai | Pemakaian |
|---|---|---|
| `sm` | 8 | Sudut "ekor" gelembung chat, sel matriks target |
| `md` | 12 | Tombol, field isian, chip pilihan |
| `lg` | 18 | Kartu, gelembung chat |
| `xl` | 24 | Sudut atas sheet |
| `pill` | 999 | Pill, tombol bulat, pegangan sheet, titik status |

Aturan: radius elemen di dalam kartu harus **lebih kecil** dari radius kartunya
(`md` di dalam `lg`) supaya sudut terlihat sejajar. Tidak ada radius mentah
(1 kejadian di `target-harian.tsx` dibereskan di Fase 5).

### 3.4 Tinggi baris & tinggi kontrol

- **Tinggi baris teks** dibawa gaya tipografi (bab 2.2): `body` 24, `label` 19,
  `caption` 16, `title` 26, `display` 40. Tidak ada `lineHeight` mentah.
- **Tinggi baris daftar** (baris pengaturan, baris riwayat) minimal `TAP_MIN`
  (44) bila bisa diketuk, dengan padding vertikal `md`.
- **Tinggi kontrol**: tombol, field isian, chip, dan stepper minimal 44×44 pt
  (`TAP_MIN`, 71 pemakaian). Tinggi mentah lain yang ditemukan (14, 24, 36, 72,
  96, 140) adalah area grafik/pratinjau, bukan kontrol, dan dijadikan token
  ukuran bernama di Fase 2.

---

## 4. Layar contoh

`app/arah-visual.tsx` menaruh seluruh keputusan di atas dalam satu layar:
komposisi hero + baris makro, palet status (isian, teks, pill), palet netral,
tangga tipografi dengan tinggi barisnya, token jarak dan radius, serta tiga
varian tombol. Dibuka dari **Pengaturan → Arah visual**, hanya pada build
pengembangan (`__DEV__`). Data dari `src/mocks/dailyLog.ts`.

Varian tipografi di layar ini masih didefinisikan lokal (`usulanTipografi`);
Fase 2 memindahkannya ke `src/theme/tokens.ts` dan layar contoh ikut memakai
token resmi.
