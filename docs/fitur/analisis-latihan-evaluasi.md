# Analisis Latihan & Evaluasi: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar analisis latihan dengan data tiruan | Layar latihan dari Hevy: jumlah sesi & volume pekan ini, sesi per hari, rincian per latihan dengan e1RM (Epley, ≤ 12 repetisi) yang ditandai estimasi | `app/latihan.tsx` (KartuHero "Pekan ini" netral, `KartuSesiLatihan` terlipat kecuali terbaru, keadaan kosong dengan jalan ke Sumber data, kartu "Tentang e1RM"), `ringkasSesi`/`ringkasPekan` di `@recomp/logika`, `src/mocks/latihan.ts` | `cek:latihan` (e1RM hanya ≤ 12 repetisi, pembulatan sama dengan SQL, pekan menurut Jakarta), `cek:desain` | Tidak ada celah fungsional. Diselaraskan di Fase 5 (chevron Ionicons, `Pemisah`, aksi "Buka Sumber data"). |
