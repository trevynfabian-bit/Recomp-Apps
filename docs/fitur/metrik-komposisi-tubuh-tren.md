# Metrik Komposisi Tubuh & Tren: verifikasi

Fitur yang sudah berjalan (PRD §3). Seperti halaman Target Nutrisi, task di sini
adalah verifikasi terhadap kode dan penjaganya; kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar metrik komposisi tubuh dengan data tiruan | Satu layar untuk pinggang (angka utama), estimasi body fat, massa lemak/bebas lemak, semua lingkar dengan selisih, dan riwayat per bagian tubuh; data tiruan tanpa Supabase | `app/ukuran.tsx` (hero pinggang netral, batas pinggang, `BannerBatasPinggang`, `KartuBodyFat`, daftar Ukuran terbaru, `RiwayatPerubahan`, `SheetCatatUkuran`), data `src/mocks` | `cek:ukuran`, `cek:bf` (rumus Navy & galat), `cek:desain` | Tidak ada celah fungsional. Diselaraskan: daftar ukuran lewat `DaftarBaris`, tombol batas pinggang jadi `Chip` (baru: `sejajar`), catatan data tiruan jadi `Pill`. |
