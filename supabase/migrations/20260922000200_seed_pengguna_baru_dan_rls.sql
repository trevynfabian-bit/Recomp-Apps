-- =============================================================================
-- Recomp Coach — penyiapan pengguna baru + pengerasan RLS
--
-- Melengkapi migrasi skema sebelumnya dengan tiga hal:
--   1. Pengguna baru langsung punya profil, empat tipe hari, dan 12 target
--      absolut (4 tipe hari x 3 fase) sehingga app tidak pernah menemui
--      keadaan "belum ada target".
--   2. Fungsi diberi `search_path` tetap — tanpa itu Postgres/Supabase menandai
--      fungsi sebagai bisa dibajak lewat search_path.
--   3. Peran `anon` dicabut haknya secara eksplisit: data kesehatan tidak
--      pernah boleh dibaca tanpa login, bahkan bila kelak ada kebijakan yang
--      keliru ditambahkan.
--
-- Aman dijalankan ulang.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pengerasan fungsi yang sudah ada
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
-- search_path dikunci supaya fungsi tidak bisa dibelokkan lewat skema bayangan.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nilai bawaan tipe hari & target
--
-- Angkanya hanya TITIK AWAL yang masuk akal untuk dewasa aktif; pengguna
-- mengeditnya lewat layar Pengaturan. Disimpan sebagai nilai ABSOLUT, bukan
-- faktor pengali — itu keputusan PRD dan tetap dipegang di sini.
-- ---------------------------------------------------------------------------
create or replace function public.siapkan_data_awal_pengguna(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_type_id uuid;
  v_tipe record;
  v_target record;
begin
  -- Profil: dibuat bila belum ada, tidak menimpa yang sudah ada.
  insert into public.profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- Empat tipe hari bawaan sesuai PRD.
  for v_tipe in
    select * from (values
      ('Rest',         true,  true,  1),
      ('Angkat Beban', true,  false, 2),
      ('Beban+Lari',   true,  false, 3),
      ('Padel',        true,  false, 4)
    ) as t(nama, auto_detect, is_default, urutan)
  loop
    insert into public.day_types (user_id, nama, auto_detect, is_default, urutan)
    values (p_user_id, v_tipe.nama, v_tipe.auto_detect, v_tipe.is_default, v_tipe.urutan)
    on conflict (user_id, nama) do nothing;

    select id into v_day_type_id
      from public.day_types
     where user_id = p_user_id and nama = v_tipe.nama;

    -- Target absolut untuk tiap fase.
    for v_target in
      select * from (values
        ('Rest',         'Maintenance', 2300, 150, 72, 21),
        ('Rest',         'Lean Gain',   2450, 165, 75, 22),
        ('Rest',         'Cut',         2000, 175, 60, 18),
        ('Angkat Beban', 'Maintenance', 2650, 165, 78, 23),
        ('Angkat Beban', 'Lean Gain',   2850, 180, 82, 25),
        ('Angkat Beban', 'Cut',         2350, 190, 65, 19),
        ('Beban+Lari',   'Maintenance', 2900, 170, 84, 25),
        ('Beban+Lari',   'Lean Gain',   3100, 185, 88, 26),
        ('Beban+Lari',   'Cut',         2600, 195, 70, 20),
        ('Padel',        'Maintenance', 2750, 160, 80, 24),
        ('Padel',        'Lean Gain',   2950, 175, 85, 25),
        ('Padel',        'Cut',         2450, 185, 68, 19)
      ) as t(tipe, fase, kalori, protein, lemak, sat_fat)
      where t.tipe = v_tipe.nama
    loop
      insert into public.day_type_targets (
        user_id, day_type_id, fase,
        target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g
      )
      values (
        p_user_id, v_day_type_id, v_target.fase::public.fase_program,
        v_target.kalori, v_target.protein, v_target.lemak, v_target.sat_fat
      )
      on conflict (day_type_id, fase) do nothing;
    end loop;
  end loop;
end;
$$;

comment on function public.siapkan_data_awal_pengguna(uuid) is
  'Membuat profil, 4 tipe hari bawaan, dan 12 target absolut (4 tipe x 3 fase) '
  'untuk satu pengguna. Idempoten: aman dipanggil berulang.';

-- ---------------------------------------------------------------------------
-- 3. Pemicu saat pengguna baru mendaftar
--
-- SECURITY DEFINER karena berjalan saat pendaftaran, sebelum ada sesi yang
-- bisa lolos RLS. Pemicunya dipasang di auth.users, tabel milik Supabase.
-- ---------------------------------------------------------------------------
create or replace function public.tangani_pengguna_baru()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.siapkan_data_awal_pengguna(new.id);
  return new;
end;
$$;

drop trigger if exists pengguna_baru_disiapkan on auth.users;
create trigger pengguna_baru_disiapkan
  after insert on auth.users
  for each row execute function public.tangani_pengguna_baru();

-- ---------------------------------------------------------------------------
-- 4. Cabut hak peran anon
--
-- Kebijakan RLS sudah membatasi per pemilik, tapi pencabutan GRANT ini membuat
-- akses tanpa login mustahil bahkan bila kelak ada kebijakan yang salah tulis.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.profiles         from anon';
    execute 'revoke all on public.day_types        from anon';
    execute 'revoke all on public.day_type_targets from anon';
    execute 'revoke all on public.daily_logs       from anon';
    execute 'revoke all on public.food_logs        from anon';
  end if;
end $$;

-- Fungsi penyiapan hanya boleh dipanggil server/pemicu, bukan klien.
revoke all on function public.siapkan_data_awal_pengguna(uuid) from public;
