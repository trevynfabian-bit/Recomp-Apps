-- =============================================================================
-- evaluasi_periodik: kode & keyakinan harus turunan dari sumbunya
--
-- Tabel ini menyimpan verdict evaluasi 4 mingguan supaya tidak hilang saat
-- percakapan dihapus, dan coach serta notifikasi membacanya TANPA menghitung
-- ulang. Klien menulisnya langsung (upsert dari `simpanEvaluasi`), dan tabel
-- baru memeriksa bahwa kode, arah, dan keyakinan adalah nilai yang dikenal —
-- bukan bahwa kodenya memang keluar dari sumbu di baris yang sama. Klien lama
-- atau klien yang keliru bisa menyimpan "Cut berjalan" untuk berat & pinggang
-- yang naik, dan coach akan mengulangnya sebagai fakta.
--
-- CHECK di sini memanggil pohon keputusan yang sama (`kode_evaluasi`,
-- immutable; kembar dengan `evaluasi4Mingguan` di TS, dijaga cek:paritas).
-- Dipasang NOT VALID lalu dicoba divalidasi: baris baru SELALU diperiksa,
-- baris lama yang belum memenuhi dilaporkan lewat NOTICE. Aman dijalankan ulang.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'evaluasi_verdict_dari_sumbu' and conrelid = 'public.evaluasi_periodik'::regclass
  ) then
    alter table public.evaluasi_periodik
      add constraint evaluasi_verdict_dari_sumbu check (
        kode = (public.kode_evaluasi(fase, arah_berat, arah_pinggang, arah_kekuatan, pekan_data) ->> 'kode')
        and keyakinan = (public.kode_evaluasi(fase, arah_berat, arah_pinggang, arah_kekuatan, pekan_data) ->> 'keyakinan')
      ) not valid;
  end if;
  begin
    alter table public.evaluasi_periodik validate constraint evaluasi_verdict_dari_sumbu;
  exception when check_violation then
    raise notice 'evaluasi_verdict_dari_sumbu dipasang untuk baris baru; sebagian verdict lama tidak sesuai sumbunya.';
  end;
end $$;
