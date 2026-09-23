-- =============================================================================
-- RLS data kesehatan — dari "aktif" menjadi "tertutup rapat"
--
-- RLS sudah aktif di setiap tabel app sejak migrasinya masing-masing. Audit
-- atas skema lengkap menemukan tiga celah yang tidak terlihat dari "RLS: on":
--
-- 1. Rujukan lintas akun. FK tunggal (mis. food_logs.daily_log_id →
--    daily_logs.id) tidak memeriksa PEMILIK baris rujukannya, dan pemeriksaan
--    FK tidak tunduk pada RLS. Satu akun bisa menulis baris miliknya sendiri
--    yang menunjuk ke baris akun lain — dan lewat pemicu SECURITY DEFINER
--    `hitung_ulang_total_makro`, catatan makan "miliknya" itu ikut dijumlah
--    ke total kalori harian akun LAIN. Setiap rujukan antar-tabel milik
--    pengguna kini membawa user_id (FK komposit), jadi hanya bisa menunjuk
--    ke baris pemilik yang sama.
--
-- 2. Hak berlebih. Bawaan Supabase memberi `authenticated` semua hak tabel,
--    termasuk TRUNCATE — yang MELEWATI RLS sepenuhnya — serta REFERENCES dan
--    TRIGGER yang tidak pernah dipakai klien. Ketiganya dicabut.
--
-- 3. Kebijakan untuk peran `public`. Kebijakan dibuat tanpa `TO`, jadi
--    berlaku juga untuk `anon`. Hari ini `anon` tidak punya hak tabel, tetapi
--    satu GRANT keliru di masa depan akan langsung berhadapan dengan kebijakan
--    yang menerimanya. Kebijakan app kini hanya untuk `authenticated`.
--
-- Proyek Supabase-nya dipakai bersama web. Karena itu yang diubah HANYA
-- tabel dan kebijakan yang dibuat migrasi app ini, disebut satu per satu —
-- tabel atau kebijakan milik web tidak disentuh.
--
-- Yang sengaja TIDAK dilakukan: FORCE ROW LEVEL SECURITY. Pemicu pemeliharaan
-- (total makro, ringkasan harian, deteksi tipe hari) berjalan sebagai pemilik
-- tabel dan memang perlu menulis baris di luar sesi pemanggilnya — setiap
-- pemicu itu memfilter pemiliknya sendiri, dan celah (1) di atas yang
-- membuatnya bisa diarahkan ke akun lain kini tertutup di tingkat FK.
--
-- FK komposit memakai `ON DELETE SET NULL (kolom)` untuk rujukan yang boleh
-- kosong (Postgres 15+, versi proyek Supabase saat ini). Seperti aturan di
-- migrasi skema_target_preferensi, FK dipasang NOT VALID lalu dicoba
-- divalidasi: data lama yang belum memenuhi tidak menggagalkan migrasi.
-- Migrasi ini aman dijalankan ulang.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rujukan antar-tabel milik pengguna membawa pemiliknya
-- ---------------------------------------------------------------------------
create or replace function pg_temp.pasang_fk_pemilik(
  p_anak text, p_kolom text, p_induk text, p_nama text, p_saat_hapus text
)
returns void
language plpgsql
as $$
declare
  v_unik text := p_induk || '_id_pemilik_unik';
begin
  -- (id, user_id) unik di induk: dasar FK komposit.
  if not exists (
    select 1 from pg_constraint
     where conrelid = format('public.%I', p_induk)::regclass and contype = 'u'
       and conkey::int2[] @> array[
         (select attnum from pg_attribute where attrelid = format('public.%I', p_induk)::regclass and attname = 'id'),
         (select attnum from pg_attribute where attrelid = format('public.%I', p_induk)::regclass and attname = 'user_id')
       ]::int2[]
       and array_length(conkey, 1) = 2
  ) then
    execute format('alter table public.%I add constraint %I unique (id, user_id)', p_induk, v_unik);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = p_nama and conrelid = format('public.%I', p_anak)::regclass
  ) then
    execute format(
      'alter table public.%I add constraint %I foreign key (%I, user_id) references public.%I (id, user_id) on delete %s not valid',
      p_anak, p_nama, p_kolom, p_induk, p_saat_hapus);
  end if;

  begin
    execute format('alter table public.%I validate constraint %I', p_anak, p_nama);
  exception
    when foreign_key_violation then
      raise notice 'Aturan % dipasang untuk baris baru; sebagian baris lama di % menunjuk ke baris akun lain.', p_nama, p_anak;
  end;
end;
$$;

select pg_temp.pasang_fk_pemilik('daily_logs', 'day_type_id', 'day_types',
  'daily_logs_tipe_hari_milik_sendiri', 'set null (day_type_id)');
select pg_temp.pasang_fk_pemilik('food_logs', 'daily_log_id', 'daily_logs',
  'food_logs_log_harian_milik_sendiri', 'cascade');
select pg_temp.pasang_fk_pemilik('redistribusi_hari', 'redistribusi_id', 'redistribusi_mingguan',
  'redistribusi_hari_induk_milik_sendiri', 'cascade');
select pg_temp.pasang_fk_pemilik('pesan_coach', 'percakapan_id', 'percakapan',
  'pesan_coach_percakapan_milik_sendiri', 'cascade');
select pg_temp.pasang_fk_pemilik('ringkasan_mingguan', 'pesan_id', 'pesan_coach',
  'ringkasan_mingguan_pesan_milik_sendiri', 'set null (pesan_id)');
select pg_temp.pasang_fk_pemilik('evaluasi_periodik', 'pesan_id', 'pesan_coach',
  'evaluasi_periodik_pesan_milik_sendiri', 'set null (pesan_id)');
select pg_temp.pasang_fk_pemilik('workout_sets', 'workout_id', 'workouts',
  'workout_sets_workout_milik_sendiri', 'cascade');
-- day_type_targets sudah punya FK komposit sejak migrasi skema_target_preferensi.

drop function pg_temp.pasang_fk_pemilik(text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 2. Hak tabel: tanpa TRUNCATE (melewati RLS), REFERENCES, dan TRIGGER
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabel text;
begin
  foreach v_tabel in array array[
    'profiles', 'day_types', 'day_type_targets', 'daily_logs', 'food_logs', 'workouts', 'workout_sets',
    'fase_periode', 'redistribusi_mingguan', 'redistribusi_hari', 'body_measurements', 'alert_pinggang',
    'percakapan', 'pesan_coach', 'ringkasan_mingguan', 'evaluasi_periodik', 'pemakaian_coach_harian',
    'health_connections', 'health_connection_secrets', 'health_data', 'source_priority', 'import_jobs',
    'settings_notifications', 'daily_summaries', 'copy_notifikasi', 'v_tipe_hari_aktif'
  ]
  loop
    if to_regclass('public.' || v_tabel) is null then
      continue;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke truncate, references, trigger on public.%I from authenticated', v_tabel);
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke truncate, references, trigger on public.%I from anon', v_tabel);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Kebijakan app hanya untuk pengguna yang masuk
-- ---------------------------------------------------------------------------
do $$
declare
  v record;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;
  for v in
    select * from (values
      ('alert_pinggang', 'alert_pinggang_milik_sendiri'),
      ('body_measurements', 'ukuran_milik_sendiri'),
      ('daily_logs', 'daily_logs pemilik saja'),
      ('daily_summaries', 'ringkasan_harian_baca_sendiri'),
      ('day_type_targets', 'day_type_targets pemilik saja'),
      ('day_types', 'day_types pemilik saja'),
      ('evaluasi_periodik', 'evaluasi_milik_sendiri'),
      ('fase_periode', 'fase_periode_milik_sendiri'),
      ('food_logs', 'food_logs pemilik saja'),
      ('health_connections', 'koneksi_baca_milik_sendiri'),
      ('health_connections', 'koneksi_perangkat_tambah'),
      ('health_connections', 'koneksi_perangkat_ubah'),
      ('health_data', 'data_kesehatan_baca_milik_sendiri'),
      ('health_data', 'data_kesehatan_perangkat_hapus'),
      ('health_data', 'data_kesehatan_perangkat_tambah'),
      ('health_data', 'data_kesehatan_perangkat_ubah'),
      ('import_jobs', 'impor_milik_sendiri'),
      ('pemakaian_coach_harian', 'pemakaian_baca_sendiri'),
      ('percakapan', 'percakapan_milik_sendiri'),
      ('pesan_coach', 'pesan_coach_milik_sendiri'),
      ('profiles', 'profiles pemilik saja'),
      ('redistribusi_hari', 'redistribusi_hari_milik_sendiri'),
      ('redistribusi_mingguan', 'redistribusi_milik_sendiri'),
      ('ringkasan_mingguan', 'ringkasan_milik_sendiri'),
      ('settings_notifications', 'preferensi_milik_sendiri'),
      ('source_priority', 'prioritas_milik_sendiri'),
      ('workout_sets', 'set_baca_milik_sendiri'),
      ('workout_sets', 'set_impor_hapus'),
      ('workout_sets', 'set_impor_tulis'),
      ('workouts', 'workouts pemilik saja')
    ) as t(tabel, kebijakan)
  loop
    if exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v.tabel and policyname = v.kebijakan
    ) then
      execute format('alter policy %I on public.%I to authenticated', v.kebijakan, v.tabel);
    end if;
  end loop;
end $$;
