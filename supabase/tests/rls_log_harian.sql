-- =============================================================================
-- Uji RLS: satu baris hanya boleh diakses pemiliknya.
-- Dijalankan dengan ON_ERROR_STOP=1 — `assert` yang gagal menghentikan skrip.
-- =============================================================================
\set ON_ERROR_STOP on

-- Dua pengguna: Ani dan Budi.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ani@contoh.test'),
  ('22222222-2222-2222-2222-222222222222', 'budi@contoh.test')
on conflict do nothing;

-- Profil, tipe hari, dan target sudah dibuat otomatis oleh pemicu
-- `pengguna_baru_disiapkan`, jadi di sini tinggal melengkapi datanya.
update public.profiles
   set nama = 'Ani', fase_aktif = 'Lean Gain', tinggi_cm = 165, jenis_kelamin = 'wanita'
 where user_id = '11111111-1111-1111-1111-111111111111';

update public.profiles
   set nama = 'Budi', fase_aktif = 'Cut', tinggi_cm = 176, jenis_kelamin = 'pria'
 where user_id = '22222222-2222-2222-2222-222222222222';

-- Pakai tipe hari hasil seed, bukan membuat sendiri.
insert into public.daily_logs
  (id, user_id, tanggal, berat_pagi_kg, sumber_berat, day_type_id, kalori, target_kalori)
select
  'cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  date '2026-09-22', 58.4, 'manual', id, 1800, 2400
  from public.day_types
 where user_id = '11111111-1111-1111-1111-111111111111' and nama = 'Angkat Beban';

insert into public.daily_logs
  (id, user_id, tanggal, berat_pagi_kg, sumber_berat, day_type_id, kalori, target_kalori)
select
  'dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
  date '2026-09-22', 74.6, 'healthkit', id, 1600, 2100
  from public.day_types
 where user_id = '22222222-2222-2222-2222-222222222222' and nama = 'Angkat Beban';

insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, sumber) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'Oat + whey', 520, 'manual'),
  ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001', 'Nasi + ayam', 760, 'foto_ai');

-- ---------------------------------------------------------------------------
-- Masuk sebagai Ani
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
declare n integer;
begin
  select count(*) into n from public.daily_logs;
  assert n = 1, format('Ani seharusnya melihat 1 daily_log, bukan %s', n);

  select count(*) into n from public.food_logs;
  assert n = 1, format('Ani seharusnya melihat 1 food_log, bukan %s', n);

  -- Seed memberi 4 tipe hari x 3 fase = 12 target, dan HANYA miliknya.
  select count(*) into n from public.day_type_targets;
  assert n = 12, format('Ani seharusnya melihat 12 target miliknya, bukan %s', n);

  select count(*) into n from public.day_types;
  assert n = 4, format('Ani seharusnya melihat 4 tipe hari, bukan %s', n);

  select count(*) into n from public.profiles;
  assert n = 1, format('Ani seharusnya melihat 1 profil, bukan %s', n);

  -- Baris Budi harus tidak terlihat sama sekali, bahkan saat dicari langsung.
  select count(*) into n from public.daily_logs
   where user_id = '22222222-2222-2222-2222-222222222222';
  assert n = 0, 'Ani tidak boleh melihat daily_log Budi';
end $$;

-- Menulis atas nama orang lain harus ditolak WITH CHECK.
do $$
begin
  begin
    insert into public.daily_logs (user_id, tanggal, kalori)
    values ('22222222-2222-2222-2222-222222222222', date '2026-09-23', 100);
    raise exception 'GAGAL: Ani berhasil menulis daily_log milik Budi';
  exception
    when insufficient_privilege then null; -- ditolak RLS, sesuai harapan
  end;
end $$;

-- UPDATE terhadap baris orang lain harus mengenai 0 baris.
do $$
declare n integer;
begin
  update public.daily_logs set kalori = 9999
   where id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Ani tidak boleh mengubah daily_log Budi';

  delete from public.daily_logs where id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'Ani tidak boleh menghapus daily_log Budi';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Masuk sebagai Budi — harus melihat datanya sendiri, utuh
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;

do $$
declare k integer;
begin
  -- Sejak migrasi total makro, kolom `kalori` dijaga trigger sebagai jumlah
  -- food_logs hari itu. Entri Budi bernilai 760, jadi itulah angka yang benar —
  -- yang diuji di sini adalah percobaan Ani mengubahnya TIDAK berpengaruh.
  select kalori into k from public.daily_logs
   where id = 'dddddddd-0000-0000-0000-000000000001';
  assert k = 760, format('daily_log Budi berubah jadi %s — seharusnya tetap 760', k);
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Tanpa sesi (anon): tidak boleh melihat apa pun
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '';
set role authenticated;

do $$
declare n integer;
begin
  select count(*) into n from public.daily_logs;
  assert n = 0, format('Tanpa sesi seharusnya 0 baris, bukan %s', n);
end $$;

reset role;

\echo 'RLS OK — isolasi per pemilik terbukti di kelima tabel'
