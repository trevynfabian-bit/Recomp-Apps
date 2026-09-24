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
`teksDiAtasIsian` (`#14151A` di atas coral = **4,64:1**). Diterapkan pada task
Tombol & Aksi (Fase 3) dan dipasangkan di `cek:kontras`.

### 1.5 Mode terang (arah, difinalkan di Fase 3)

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
