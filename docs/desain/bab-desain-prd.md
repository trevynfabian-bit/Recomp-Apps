# Bab Desain untuk PRD

| | |
|---|---|
| **Status** | **Resmi: acuan yang mengikat** untuk `app/`, `src/theme/`, `src/components/` |
| **Versi** | 1.2 (24 September 2026) |
| **Penjaga** | `npm run cek:desain`, `npm run cek:kontras` |
| **Rincian & alasan** | [`arah-visual.md`](./arah-visual.md), titik awal di [`audit-token-layar.md`](./audit-token-layar.md) |

> Bab ini adalah bab 8 PRD plan **Rombak Sistem Desain App**, setelah
> "7. Tech Stack". Bila isi bab ini dan kode berbeda, bab ini yang benar dan
> kodenya yang diperbaiki. Bila bab ini perlu berubah, ubah lewat proses di
> bagian "Riwayat & perubahan" di bawah, bukan langsung di layar.

## 8. Desain

### 8.1 Karakter visual

Recomp Coach adalah *athlete dashboard* yang tenang: **gelap sebagai mode
utama**, mode terang mengikuti setelan sistem, **satu angka menonjol per
layar**, dan aksen hangat amber/coral/jade. Biru standar tidak dipakai. Desain
mengatur bagaimana angka tampil; angka, formula, dan perilaku data tidak pernah
berubah karena keputusan desain.

### 8.2 Palet & tema warna (mengikat)

- Dua lapis: palet dasar (nilai heks) hanya dibaca `src/theme`; layar memakai
  peran bermakna.
- **Peran merek:** `aksen` = amber (CTA, angka hero, tab aktif, pilihan
  terpilih); `aksenKedua` = jade (fase aktif, protein, positif); `aksenKetiga` =
  coral (batas terlampaui, tindakan merusak).
- **Peran status:** `sukses` jade, `peringatan` amber, `bahaya` coral, `info`
  ungu karbo. Status tidak pernah disampaikan dengan warna saja; selalu ada
  label atau ikon.
- **Isian vs teks:** di mode gelap aksen punya varian isian (bar, tombol, pill)
  dan varian teks kecil yang lebih terang. Di mode terang satu nilai aksen yang
  digelapkan melayani keduanya.
- Label di atas isian memakai peran `teksDiAtasIsian`, bukan warna latar.
- `info` hanya dipakai sebagai teks, bar, atau mark; tidak pernah sebagai isian
  tombol/chip berlabel (label di atasnya 4,41:1 di mode gelap).
- Pill di atas kartu/sheet tanpa isian (`diKartu`); pill bertint hanya di atas
  latar layar.

| Peran | Gelap | Terang |
|---|---|---|
| latar / permukaan / permukaan cekung | `#14151A` / `#2A2D36` / `#1C1E25` | `#F4F5F7` / `#FFFFFF` / `#E9EBEF` |
| teks / redup / samar | `#F5F6F8` / `#9BA1AF` / `#8E94A3` | `#14151A` / `#4A4F5C` / `#5C6170` |
| aksen (amber) | `#F0A202` | `#8A5A00` |
| sukses (jade) | `#1B998B` isian, `#1DA697` teks | `#0E7166` |
| bahaya (coral) | `#E24E1B` isian, `#E97147` teks | `#B23A10` |
| info (karbo) | `#7C6AE8` isian, `#9587EC` teks | `#5B4BC4` |
| teks di atas isian | `#14151A` | `#FFFFFF` |

### 8.3 Aksesibilitas warna

- WCAG 2.1 AA di **kedua mode**: 4,5:1 teks kecil; 3:1 teks besar, mark grafik,
  bar terhadap track, dan tepi kontrol (`garisKontrol`).
- Pemisah dekoratif (`garis`) sengaja resesif, di bawah 2:1.
- Teks di atas latar bertint dihitung terhadap warna campurannya.
- Setiap pasangan warna baru di layar wajib didaftarkan di `cek:kontras`.

### 8.4 Tipografi

- Huruf sistem (SF Pro di iOS); tidak ada font kustom. Angka yang berubah di
  tempat memakai digit tabular (`angkaTabular`).
- Enam ukuran, masing-masing dengan tinggi baris sendiri:

| Gaya | Ukuran / tinggi baris | Ketebalan | Untuk |
|---|---|---|---|
| hero | 64 / 68 | 800 | satu angka utama per layar |
| display | 34 / 40 | 700 | judul layar publik |
| title | 20 / 26 | 700 | judul layar tab & tumpukan, judul sheet |
| body | 16 / 24 | 500 | teks isi |
| label | 13 / 19 | 600 | label kontrol, nama baris |
| caption | 11 / 16 | 600, kapital untuk grup | label grup, unit |

- Varian bernama menggantikan penimpaan manual: `labelBiasa` (13, 500) untuk
  keterangan, `bodySedang` (16, 600) untuk judul kartu, `bodyTebal` (16, 700)
  untuk label tombol utama dan penekanan.
- Ketebalan hanya 500, 600, 700, 800. Tidak ada ukuran huruf mentah di layar.
- Hierarki dalam satu kartu paling banyak tiga tingkat: angka → judul →
  keterangan → label grup/unit.
- Dynamic Type: teks isi menskala penuh; hanya hero dibatasi 1,3×.

### 8.5 Kepadatan tata letak

- **Lega antar-blok, rapat di dalam kartu.**
- Skala jarak 4pt ditambah satu langkah 2pt: `xxs` 2, `xs` 4, `sm` 8, `md` 12,
  `lg` 16, `xl` 24, `xxl` 32.
- Layar: sisi `lg`, atas `inset + lg`, bawah `inset + xxl`, antar-blok `xl`.
  Kartu: padding `lg`, isi `sm`/`md`. Sheet: padding `xl`, isi `lg`.
- Radius: `sm` 8 (sel/ekor gelembung), `md` 12 (tombol, field, chip), `lg` 18
  (kartu), `xl` 24 (sudut atas sheet), `pill`. Radius elemen di dalam kartu
  lebih kecil dari radius kartunya.
- Area sentuh minimal 44×44 pt (`TAP_MIN`) untuk setiap kontrol.

### 8.6 Komposisi layar

- Satu angka hero per layar data (Hari Ini, Tren, Budget, Ukuran, Latihan,
  Sumber data, Target harian); komponen tidak membawa angka hero sendiri.
- Judul layar tab dan tumpukan memakai `title` dengan peran header aksesibilitas.
- Satu set tombol: utama (isian aksen, label tebal), bertepi (aksi kedua),
  merusak (isian coral, label menyebut tindakannya).

### 8.7 Mode terang & gelap

- Mengikuti setelan sistem; sistem tanpa pilihan jatuh ke gelap. Splash dan
  latar asli app tetap gelap.
- Seluruh layar membaca palet yang berlaku saat render; warna tidak boleh
  dibekukan di konstanta tingkat modul.
- Status bar terang di atas gelap, gelap di atas terang.

### 8.8 Penjaga otomatis

- `npm run cek:kontras`: semua pasangan warna yang dipakai layar, kedua mode.
- `npm run cek:desain`: prinsip (satu angka hero per layar, mode mengikuti
  sistem, warna tidak dibekukan di modul, varian tipografi, area sentuh 44 pt).
- `npm run cek:hardcode`: tidak ada warna, jarak, radius, ukuran huruf, tinggi
  baris, atau ukuran ikon yang ditulis langsung di layar; setiap temuan disertai
  saran token terdekat.
- Pengecualian dicatat di dalam skrip beserta alasannya.

### 8.9 Di luar lingkup desain

Dashboard web Next.js, backend, dan paket `@recomp/logika`. Tidak ada angka,
formula, atau perilaku data yang berubah.

---

## Riwayat & perubahan

Bab ini berubah hanya lewat satu PR yang memperbarui bab ini, token di
`src/theme`, dan penjaganya sekaligus, lalu menambah baris di tabel ini.
`cek:desain` dan `cek:kontras` harus lulus.

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 24 September 2026 | Bab pertama: palet semantik dua mode, tipografi dengan tinggi baris dan varian bernama, kepadatan & radius, komposisi layar, penjaga otomatis. |
| 1.1 | 24 September 2026 | Lapis semantik diwujudkan di `src/theme/colors.ts` (`latar`, `permukaan`, `teks*`, `aksen`, `status.*`); `info` dibatasi ke teks/bar/mark. |
| 1.2 | 24 September 2026 | Token Fase 2 terpusat: lapis semantik satu-satunya nama warna di luar `src/theme` (nama lama dihapus); tipografi membawa tinggi baris; token `ukuran`, `ukuranIkon`, `bobot`, `radius.xs`; kontrol rapat 36/40 pt dengan area sentuh 44 pt. |
