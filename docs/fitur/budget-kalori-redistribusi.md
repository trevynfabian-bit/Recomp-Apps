# Budget Kalori & Redistribusi: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun halaman budget kalori mingguan | Jatah minggu (mulai Senin) = jumlah target harian; sisa, laju, rincian 7 hari dengan sisa berjalan dan proyeksi, fase, redistribusi, TDEE, proteksi protein | `app/(tabs)/budget.tsx` (KartuHero sisa jatah + `MeterBudget`, `PemilihFase`, daftar Minggu ini, `PanelRedistribusi`, `KartuTdee`, proteksi protein), `hitungBudget`/`lajuBudget`/`rincianKumulatif` di `@recomp/logika` | `cek:paritas` (budget TS = SQL), `cek:desain` | **Diperbaiki:** hari proyeksi diredupkan dengan `opacity: 0.55` sehingga teksnya di bawah AA; kini lewat warna `teksRedup` + kata "proyeksi", dan `cek:desain` menolak opacity pada isi. Daftar lewat `DaftarBaris`; catatan "redistribusi menyusul" yang sudah basi diganti "Data tiruan". |
| Buat komponen ringkasan anggaran terpakai dan sisa | Sisa jatah sebagai angka utama, terpakai dari total, meter pemakaian dengan penanda laju, kalimat laju, dan angka pendukung (hari tersisa, dibagi rata, rencana) | `KartuHero` Budget (nada aksen/bahaya), `MeterBudget`, `DeretStat` | `cek:paritas` (`lajuBudget`), `cek:desain`, `cek:hardcode` | **Diperbaiki:** meter kini `progressbar` dengan nilai dan kalimat untuk pembaca layar (sebelumnya tidak terbaca sama sekali); ukuran track/penanda jadi token `ukuran.meter`; glyph "│" di legenda diganti penanda yang sama bentuknya dengan garis di meter. `cek:hardcode` kini juga menolak lebar/tinggi/posisi tertanam; 19 nilai di 10 komponen dipindah ke token. |
