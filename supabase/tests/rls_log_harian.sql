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

-- Data awal ditulis sebagai superuser (RLS dilewati), meniru seed dari server.
insert into public.profiles (user_id, nama, fase_aktif, tinggi_cm, jenis_kelamin)
values
  ('11111111-1111-1111-1111-111111111111', 'Ani', 'Lean Gain', 165, 'wanita'),
  ('22222222-2222-2222-2222-222222222222', 'Budi', 'Cut', 176, 'pria');

insert into public.day_types (id, user_id, nama, urutan) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Angkat Beban', 1),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Angkat Beban', 1);

insert into public.day_type_targets
  (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Lean Gain', 2400, 150, 70, 20),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'Cut', 2100, 180, 60, 18);

insert into public.daily_logs
  (id, user_id, tanggal, berat_pagi_kg, sumber_berat, day_type_id, kalori, target_kalori)
values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   date '2026-09-22', 58.4, 'manual', 'aaaaaaaa-0000-0000-0000-000000000001', 1800, 2400),
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   date '2026-09-22', 74.6, 'healthkit', 'bbbbbbbb-0000-0000-0000-000000000001', 1600, 2100);

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

  select count(*) into n from public.day_type_targets;
  assert n = 1, format('Ani seharusnya melihat 1 target, bukan %s', n);

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
  select kalori into k from public.daily_logs
   where id = 'dddddddd-0000-0000-0000-000000000001';
  assert k = 1600, format('daily_log Budi berubah jadi %s — seharusnya tetap 1600', k);
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
