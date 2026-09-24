-- =============================================================================
-- Target harian: tanggal wajib diisi
--
-- `ambil_target_harian(tanggal)` (app, web) dan kembarannya untuk jalur server
-- `target_harian_pengguna(user, tanggal)` (widget, Edge Function) dulu tetap
-- menjawab saat tanggalnya NULL: tipe hari bawaan × fase sekarang. Pemanggil
-- yang kehilangan tanggalnya karena bug menerima target yang tampak sah
-- untuk hari yang tidak pernah ia minta, dan tidak ada yang tahu.
--
-- STRICT: masukan NULL → tidak ada baris. Pemanggil melihat "tidak ada
-- target" (sama dengan hari yang belum diisi), bukan angka karangan.
-- Aman dijalankan ulang.
-- =============================================================================

alter function public.ambil_target_harian(date) strict;
alter function public.target_harian_pengguna(uuid, date) strict;
