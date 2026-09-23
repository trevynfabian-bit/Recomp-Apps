-- =============================================================================
-- ambil_target_harian ↔ targetBerlaku (@recomp/logika): satu aturan
--
-- Web dan app menyelesaikan "target yang berlaku hari ini" lewat helper
-- bersama `targetBerlaku`; server (widget, Edge Function) lewat fungsi ini.
-- Keduanya dijaga sama oleh `npm run cek:paritas` untuk hari lewat bersnapshot,
-- tipe hari yang terhapus, pilihan manual, hari belum tercatat, dan target yang
-- belum diisi. Komentar ini supaya siapa pun yang membuka skema tahu kembarannya.
-- =============================================================================

comment on function public.ambil_target_harian(date) is
  'Target absolut yang berlaku pada satu tanggal: snapshot catatan hari itu, lalu target (tipe hari x fase), '
  'tanpa cadangan dari tipe hari atau fase lain. Kembaran TS: targetBerlaku di @recomp/logika (dijaga cek:paritas).';
