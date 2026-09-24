# Peta Navigasi

Titik awal fitur **Navigasi & Tab Konsisten** (Fase 4). Memotret struktur tab,
rute, dan setiap jalan masuk antar-layar di app Expo seperti adanya sekarang,
sebelum ditinjau.

## 1. Struktur

```
app/_layout.tsx                     Stack akar (headerShown: false), dijaga sesi
├── masuk                           publik: hanya ada saat BELUM masuk (fade)
└── [dijaga: sudah masuk]
    ├── (tabs)/_layout.tsx          Tabs (headerShown: false)
    │   ├── index        "Hari Ini"   today-outline
    │   ├── tren         "Tren"       trending-up-outline
    │   ├── budget       "Budget"     wallet-outline
    │   ├── coach        "Coach"      sparkles-outline
    │   └── pengaturan   "Setelan"    options-outline
    ├── ukuran                      slide_from_right
    ├── sumber-data                 slide_from_right
    ├── latihan                     slide_from_right
    ├── impor-riwayat               slide_from_right
    ├── widget-pengingat            slide_from_right
    ├── target-harian               slide_from_right   param ?isi=<dayTypeId>
    ├── privasi                     slide_from_right
    ├── hasil-lab                   slide_from_right
    ├── tambah-hasil-lab            slide_from_bottom  param ?id=<hasilLabId>
    ├── arah-visual                 slide_from_right   (build pengembangan)
    └── peraga                      slide_from_right   (build pengembangan)
```

- Tab bar: 5 tab, label `caption`, warna aktif `aksen.teks`, tidak aktif
  `teksSamar`, latar `latar` dengan garis atas `garis`.
- Header bawaan navigator **dimatikan di semua tingkat**; setiap layar menggambar
  kepalanya sendiri (judul `title`, tombol kembali `TombolIkon` di layar tumpukan).
- Skema berganti → navigator dipasang ulang, `usePulihkanRute` membuka kembali
  rute terakhir (Fase 3).

## 2. Jalan masuk antar-layar

| Dari | Ke | Pemicu |
|---|---|---|
| Hari Ini | Target harian | "Target semua tipe hari ›"; "Isi target" (`?isi=`) saat target kosong |
| Hari Ini | Sumber data | ketuk `IndikatorSinkron` di kepala layar |
| Tren | Ukuran | baris "Ukuran tubuh" |
| Ukuran | **tab** Budget | "Fase & budget" di banner batas pinggang (`/(tabs)/budget`) |
| Pengaturan | Target harian, Sumber data, Impor riwayat, Hasil lab, Widget & pengingat, Privasi | baris daftar |
| Pengaturan (dev) | Arah visual, Peraga | baris daftar, hanya `__DEV__` |
| Sumber data | Latihan, Impor riwayat | tautan di kartu Hevy / kartu impor |
| Privasi | Sumber data, Widget & pengingat | baris daftar |
| Hasil lab | Tambah hasil lab (baru / `?id=` ubah) | tombol utama, "Ubah" |
| Semua layar tumpukan | layar sebelumnya | `TombolIkon` kembali → `router.back()` |
| Notifikasi | — | **tidak ada**: data notifikasi membawa `jenis`, tetapi ketukan tidak diarahkan; app selalu terbuka di Hari Ini |

Sheet (bukan rute): catat ukuran, batas pinggang, ganti fase, lengkapi profil,
catat foto, jam timbang, ekspor, hapus akun, keluar, hubungkan/putuskan
sumber, impor, sunting target, riwayat percakapan.

## 3. Temuan

| # | Temuan | Dampak |
|---|---|---|
| N1 | Header ditulis ulang di tiap layar: 11 layar tumpukan menyusun `TombolIkon` + judul + subjudul sendiri; 5 tab menyusun judul sendiri dengan susunan berbeda (sapaan + tanggal + pill, judul + tombol, judul saja). | Jarak, peran header aksesibilitas, dan posisi aksi kanan berbeda-beda. |
| N2 | 5 dari 11 layar tumpukan tidak memberi `accessibilityRole="header"` pada judulnya (audit token §3 L2). | VoiceOver tidak bisa melompat ke judul. |
| N3 | Label tab "Setelan" sedangkan judul layarnya "Pengaturan". | Dua nama untuk satu tempat. |
| N4 | Ikon tab memakai varian `-outline` untuk aktif maupun tidak. | Tab aktif hanya dibedakan warna; HIG menyarankan ikon terisi untuk tab terpilih. |
| N5 | Ukuran → Budget melompat ke **tab** dari layar tumpukan (`router.push('/(tabs)/budget')`), sehingga tombol kembali tidak membawa ke Ukuran. | Alur kembali tidak bisa ditebak. |
| N6 | Ketukan notifikasi tidak diarahkan ke layar yang relevan (timbang pagi, ukur pekanan, ringkasan, evaluasi, sumber terputus). | Pengguna harus mencari sendiri layar yang dimaksud notifikasi. |
| N7 | Transisi: semua tumpukan `slide_from_right`, `tambah-hasil-lab` `slide_from_bottom` (modal), masuk `fade`. Konsisten, tetapi `tambah-hasil-lab` bukan `presentation: 'modal'`, jadi gestur tutupnya tetap geser-kanan. | Animasi dan gestur tidak sepakat. |
| N8 | Tidak ada tab yang bisa diketuk ulang untuk kembali ke atas/awal tumpukan secara eksplisit (perilaku bawaan navigator). | — (dicatat, bukan masalah) |

Temuan N1–N7 menjadi bahan task berikutnya di fitur ini.

## 4. Keputusan: tab final

**Lima tab, urutan tetap:** Hari Ini · Tren · Budget · Coach · Setelan.

- **Jumlah.** Lima adalah batas tab iPhone menurut HIG; semua lima tempat
  dipakai harian atau berkala, dan tidak ada kandidat yang cukup sering dibuka
  untuk menggeser salah satunya. Ukuran, Sumber data, Latihan, dan Hasil lab
  tetap layar tumpukan yang dibuka dari layar asalnya (Tren, Setelan).
- **Urutan** mengikuti seberapa sering dibuka dalam sehari: mencatat hari ini,
  melihat arah berat, memeriksa jatah minggu, bertanya ke coach, lalu setelan
  yang jarang disentuh di ujung kanan.
- **Nama: "Setelan"** untuk tab maupun judul layarnya (N3). Dua alasan:
  "Pengaturan" terpotong menjadi "Penga…" di tab bar pada lebar 320–390 pt, dan
  iOS berbahasa Indonesia memakai "Pengaturan" untuk app Settings-nya sendiri,
  yang ditautkan app ini ("Buka Pengaturan ›" untuk izin notifikasi, "Pengaturan
  › Kesehatan" untuk izin Apple Health). Satu nama untuk tempat app, satu nama
  untuk tempat sistem. Pesan galat "Atur dulu di Pengaturan" ikut diganti.
- **Label tab** memakai `caption` tanpa tracking (tracking 0,6 hanya untuk huruf
  kapital).

Diwujudkan sebagai data di `app/(tabs)/_layout.tsx` (`TAB`). `cek:desain`
menjaga jumlah tab 1–5 dan bahwa judul setiap layar tab diawali label tabnya
(sehingga "Setelan" vs "Pengaturan" tidak bisa terulang tanpa ketahuan).

## 5. Tab bar

- **Ikon terisi untuk tab terpilih, garis untuk yang lain** (N4): tab terpilih
  terbaca dari bentuk, bukan dari warna saja. `TAB[].ikon` menyimpan nama dasar
  Ionicons; tab bar menambah `-outline` untuk tab yang tidak terpilih.
- **Set ikon:** Hari Ini `today` (kalender), Tren `analytics` (garis tren
  bertitik; `trending-up` diganti karena versi terisi dan garisnya identik),
  Budget `wallet`, Coach `sparkles`, Setelan `settings` (roda gigi, glyph
  setelan yang dikenali; `options` diganti).
- Warna: terpilih `aksen.teks`, lainnya `teksSamar`; latar `latar`, garis atas
  `garis`. Ukuran ikon dari tab bar (ukuran sistem), label `caption` tanpa
  tracking.
- **Penanda tab terpilih** — tiga penanda yang saling menguatkan: warna aksen,
  glyph terisi, dan garis aksen 20×3 pt yang menempel di tepi atas tab bar
  (`ukuran.penandaTab`). Pembaca layar mendapat keadaan terpilih dari tab bar
  (`aria-selected`), dan label tab tetap terbaca oleh VoiceOver.

## 6. Header layar

`HeaderLayar` (`src/components/HeaderLayar.tsx`) menggantikan header yang
disusun ulang di tiap layar (N1, N2):

| Bagian | Aturan |
|---|---|
| Kembali | `TombolIkon` bulat `chevron-back`, hanya di layar tumpukan; `kembali={fungsi}` bila perlu konfirmasi dulu |
| Judul | `title`, **selalu** `accessibilityRole="header"`; layar tab diawali label tabnya |
| Subjudul | satu baris `label` `teksSamar`: tanggal, sumber, atau jumlah |
| Aksi | paling banyak satu di kanan: `Pill` fase, `Tombol ukuran="kecil"`, atau `TombolIkon` |
| Bawah | slot opsional di bawah subjudul (mis. `IndikatorSinkron` di Hari Ini) |

Jarak ke isi di bawahnya dipegang kerangka layar (`gap: xl`), bukan header.

Diterapkan ke semua 17 layar app (5 tab, 10 layar tumpukan, 2 layar
pengembangan); hanya layar masuk (publik, judul `display`) yang tidak memakainya.
Coach kini memindahkan fase ke subjudul ("Lean Gain · judul utas") supaya aksi
kanan tetap satu (Riwayat). Subjudul selalu satu baris. `cek:desain` menolak
layar tanpa `HeaderLayar`.

## 7. Kembali & aksi atas

- **Satu tombol kembali**: `TombolIkon` bulat di `HeaderLayar`, di kiri, di
  semua layar tumpukan. Aksi atas paling banyak satu, di kanan.
- **Semua jalan keluar sama**: layar dengan isian belum disimpan
  (`target-harian`, `tambah-hasil-lab`) memakai `useJagaKeluar`
  (`src/lib/jagaKeluar.ts`): selama isian kotor, geser-kembali iOS dimatikan dan
  tombol kembali Android membuka konfirmasi yang sama dengan tombol di header.
  Dulu keduanya langsung menutup layar dan membuang isian.
- **Pindah ke tab dari layar tumpukan memakai `router.navigate`**, bukan `push`
  (N5): Ukuran → "Fase & budget" kini kembali ke tab yang sudah ada lalu pindah
  ke Budget, bukan menumpuk salinan tab di atas Ukuran. Diuji di web: berakhir
  di `/budget` tanpa tombol kembali.

## 8. Pola transisi

Satu tabel di `app/_layout.tsx` (`RUTE_TUMPUKAN` + `OPSI_TRANSISI`), dua pola:

| Pola | Untuk | Animasi | Gestur | Tombol header |
|---|---|---|---|---|
| `dorong` | masuk lebih dalam ke satu topik (Ukuran, Sumber data, Hasil lab, …) | geser dari kanan | geser-kembali aktif (kecuali isian kotor, §7) | `‹` Kembali |
| `modal` | membuat/mengubah satu hal lalu kembali (Tambah/Ubah hasil lab) | naik dari bawah, layar penuh | tidak ada | `✕` Tutup |
| (akar) | masuk ↔ app | `fade` | — | — |

Menyelesaikan N7: dulu `tambah-hasil-lab` naik dari bawah tetapi tetap
memakai `‹` dan geser-kanan, jadi animasi, gestur, dan tombolnya tidak sepakat.
`HeaderLayar jenisKembali="tutup"` memberi `✕`. `cek:desain` menolak rute
tumpukan yang tidak ada di tabel.

## 9. Kembali satu langkah

`useKembali()` (`src/lib/kembali.ts`) adalah satu-satunya cara kembali:
ke layar sebelumnya bila ada riwayat, atau naik ke **induk logis** layar itu
bila tidak ada (tautan langsung, URL di web, rute yang dipulihkan setelah skema
berganti). Dulu `router.back()` tanpa riwayat tidak melakukan apa-apa.

| Layar | Induk |
|---|---|
| Ukuran | Tren |
| Latihan | Sumber data |
| Tambah/Ubah hasil lab | Hasil lab |
| Sumber data, Impor riwayat, Widget & pengingat, Target harian, Privasi, Hasil lab, Arah visual, Peraga | Setelan |

Dipakai `HeaderLayar` dan setiap aksi "selesai lalu kembali" (simpan, hapus,
batal). Diuji di web: `/ukuran`, `/tambah-hasil-lab`, `/latihan` dibuka
langsung lalu kembali → `/tren`, `/hasil-lab`, `/sumber-data`; dengan riwayat,
Tren → Ukuran → kembali → Tren. Tombol kembali Android di tab mengikuti
perilaku bawaan tab (ke tab pertama, lalu keluar). `cek:desain` menolak
`router.back()` langsung dan rute tumpukan tanpa induk.
