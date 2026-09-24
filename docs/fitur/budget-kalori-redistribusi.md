# Budget Kalori & Redistribusi: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun halaman budget kalori mingguan | Jatah minggu (mulai Senin) = jumlah target harian; sisa, laju, rincian 7 hari dengan sisa berjalan dan proyeksi, fase, redistribusi, TDEE, proteksi protein | `app/(tabs)/budget.tsx` (KartuHero sisa jatah + `MeterBudget`, `PemilihFase`, daftar Minggu ini, `PanelRedistribusi`, `KartuTdee`, proteksi protein), `hitungBudget`/`lajuBudget`/`rincianKumulatif` di `@recomp/logika` | `cek:paritas` (budget TS = SQL), `cek:desain` | **Diperbaiki:** hari proyeksi diredupkan dengan `opacity: 0.55` sehingga teksnya di bawah AA; kini lewat warna `teksRedup` + kata "proyeksi", dan `cek:desain` menolak opacity pada isi. Daftar lewat `DaftarBaris`; catatan "redistribusi menyusul" yang sudah basi diganti "Data tiruan". |
