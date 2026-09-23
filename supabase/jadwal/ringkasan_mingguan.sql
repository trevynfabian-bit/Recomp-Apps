-- =============================================================================
-- Jadwal ringkasan mingguan.
--
-- BUKAN migrasi. Berkas ini dijalankan SEKALI per proyek Supabase, manual
-- (SQL editor), setelah Edge Function `ringkasan-mingguan` di-deploy. Ia tidak
-- ikut `supabase/migrations/` karena bergantung pada URL proyek dan rahasia
-- yang berbeda di tiap lingkungan — dan rahasia tidak boleh masuk repo.
--
-- Prasyarat:
--   1. Ekstensi `pg_cron` dan `pg_net` aktif (Dashboard → Database → Extensions).
--   2. Rahasia Edge Function sudah diset:
--        supabase secrets set RINGKASAN_JADWAL_RAHASIA=<string acak panjang>
--   3. Tiga nilai disimpan di Vault (sekali saja, lewat SQL editor):
--        select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--        select vault.create_secret('<anon key proyek>', 'anon_key');
--        select vault.create_secret('<nilai RINGKASAN_JADWAL_RAHASIA>', 'ringkasan_jadwal_rahasia');
--
-- Kenapa anon key + rahasia terpisah, bukan kunci service role: yang disimpan
-- di database hanya hak untuk MEMICU ringkasan. Kunci service role tetap
-- tinggal di env Edge Function dan tidak pernah disalin ke mana pun.
--
-- Waktu: Senin 06:00 WIB = Minggu 23:00 UTC. Satu panggilan meringkas paling
-- banyak 25 pengguna atau ~100 detik, jadi panggilan susulan tiap jam sampai
-- 10:00 WIB menghabiskan sisa antrean. Antreannya bisa dilanjutkan: pengguna
-- yang sudah punya ringkasan tidak diproses ulang, dan kegagalan sementara
-- (jaringan, API) otomatis dicoba lagi di putaran berikutnya.
-- =============================================================================

create or replace function public.picu_ringkasan_mingguan()
returns bigint
language sql
-- SECURITY INVOKER (bawaan): cron berjalan sebagai pemilik yang menjadwalkannya
-- dan memang berhak membaca Vault. Pemanggil lain tidak berhak membaca Vault,
-- jadi fungsi ini tidak membuka pintu apa pun bagi mereka.
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/ringkasan-mingguan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-jadwal-rahasia',
        (select decrypted_secret from vault.decrypted_secrets where name = 'ringkasan_jadwal_rahasia')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$;

-- Hanya cron yang memicu; pengguna tidak punya alasan menjalankannya.
revoke all on function public.picu_ringkasan_mingguan() from public, anon, authenticated;

select cron.schedule('ringkasan-mingguan', '0 23 * * 0', 'select public.picu_ringkasan_mingguan()');
select cron.schedule('ringkasan-mingguan-susulan', '0 0-3 * * 1', 'select public.picu_ringkasan_mingguan()');
