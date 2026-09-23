-- =============================================================================
-- Jadwal penarikan Hevy.
--
-- BUKAN migrasi — sama seperti `ringkasan_mingguan.sql`: dijalankan SEKALI per
-- proyek Supabase lewat SQL editor, setelah Edge Function `sinkron-hevy`
-- di-deploy. URL proyek dan rahasia berbeda per lingkungan dan tidak boleh
-- masuk repo.
--
-- Prasyarat:
--   1. Ekstensi `pg_cron` dan `pg_net` aktif.
--   2. supabase secrets set HEVY_JADWAL_RAHASIA=<string acak panjang>
--   3. Vault (sekali saja; `project_url` & `anon_key` mungkin sudah ada dari
--      jadwal ringkasan mingguan):
--        select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--        select vault.create_secret('<anon key proyek>', 'anon_key');
--        select vault.create_secret('<nilai HEVY_JADWAL_RAHASIA>', 'hevy_jadwal_rahasia');
--
-- Tiap jam pada menit ke-17 — bukan menit ke-0, tempat jadwal lain di dunia
-- menumpuk dan API pihak ketiga paling sering membatasi laju. Satu panggilan
-- menarik paling banyak 50 koneksi atau ~100 detik; koneksi yang paling lama
-- tidak ditarik selalu didahulukan, jadi antrean yang panjang tetap bergilir.
-- =============================================================================

create or replace function public.picu_sinkron_hevy()
returns bigint
language sql
-- SECURITY INVOKER: cron berjalan sebagai pemilik yang berhak membaca Vault.
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/sinkron-hevy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-jadwal-rahasia',
        (select decrypted_secret from vault.decrypted_secrets where name = 'hevy_jadwal_rahasia')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;

revoke all on function public.picu_sinkron_hevy() from public, anon, authenticated;

select cron.schedule('sinkron-hevy', '17 * * * *', 'select public.picu_sinkron_hevy()');
