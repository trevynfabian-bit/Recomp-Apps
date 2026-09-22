-- =============================================================================
-- Uji penyiapan pengguna baru + pengerasan anon.
-- =============================================================================
\set ON_ERROR_STOP on

-- Mendaftarkan pengguna memicu penyiapan data awal.
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'citra@contoh.test');

do $$
declare n integer;
begin
  select count(*) into n from public.profiles
   where user_id = '33333333-3333-3333-3333-333333333333';
  assert n = 1, format('Pengguna baru seharusnya punya 1 profil, bukan %s', n);

  select count(*) into n from public.day_types
   where user_id = '33333333-3333-3333-3333-333333333333';
  assert n = 4, format('Pengguna baru seharusnya punya 4 tipe hari, bukan %s', n);

  -- 4 tipe hari x 3 fase.
  select count(*) into n from public.day_type_targets
   where user_id = '33333333-3333-3333-3333-333333333333';
  assert n = 12, format('Pengguna baru seharusnya punya 12 target, bukan %s', n);

  -- Tepat satu tipe hari bawaan.
  select count(*) into n from public.day_types
   where user_id = '33333333-3333-3333-3333-333333333333' and is_default;
  assert n = 1, format('Seharusnya tepat 1 tipe hari bawaan, bukan %s', n);
end $$;

-- Memanggil ulang tidak boleh menggandakan apa pun.
do $$
begin
  perform public.siapkan_data_awal_pengguna('33333333-3333-3333-3333-333333333333');
end $$;

do $$
declare n integer;
begin
  select count(*) into n from public.day_type_targets
   where user_id = '33333333-3333-3333-3333-333333333333';
  assert n = 12, format('Pemanggilan ulang menggandakan target jadi %s', n);
end $$;

-- Target tiap fase benar-benar berbeda (bukan satu angka disalin tiga kali).
do $$
declare n integer;
begin
  select count(distinct target_kalori) into n
    from public.day_type_targets t
    join public.day_types d on d.id = t.day_type_id
   where t.user_id = '33333333-3333-3333-3333-333333333333'
     and d.nama = 'Angkat Beban';
  assert n = 3, format('Angkat Beban seharusnya punya 3 target kalori berbeda, bukan %s', n);
end $$;

-- ---------------------------------------------------------------------------
-- anon tidak boleh membaca apa pun, meski GRANT select sempat diberikan
-- ---------------------------------------------------------------------------
set role anon;

do $$
begin
  begin
    perform 1 from public.daily_logs limit 1;
    raise exception 'GAGAL: anon masih bisa membaca daily_logs';
  exception
    when insufficient_privilege then null; -- hak sudah dicabut, sesuai harapan
  end;

  begin
    perform 1 from public.profiles limit 1;
    raise exception 'GAGAL: anon masih bisa membaca profiles';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

\echo 'Penyiapan pengguna baru OK — profil + 4 tipe hari + 12 target, idempoten, anon terkunci'
