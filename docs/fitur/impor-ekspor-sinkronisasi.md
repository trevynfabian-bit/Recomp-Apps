# Impor/Ekspor & Sinkronisasi Luar: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar Impor & Ekspor dengan data tiruan | Satu layar untuk data masuk (impor riwayat Hevy CSV, Apple Health, ukuran lama) dan data keluar (ekspor CSV & JSON), dengan data tiruan tanpa Supabase | `app/impor-riwayat.tsx` kini "Impor & ekspor" (bagian Impor riwayat + Ekspor data dengan status berkas dari `useEkspor`), `SheetImporRiwayat`, `SheetEksporData`, `src/mocks/impor.ts`, `@/data/ekspor` tiruan | `cek:impor` (parser CSV RFC 4180), `cek:ekspor` (injeksi rumus), `cek:desain` | **Celah diperbaiki:** ekspor hanya bisa dicapai dari sheet di Setelan/Privasi, tidak ada layar yang menyatukan data masuk & keluar. Layar impor kini "Impor & ekspor"; Setelan memakai satu baris "Impor & ekspor" (ekspor tetap juga di Privasi sebagai kendali privasi). |
