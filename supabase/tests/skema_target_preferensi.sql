-- =============================================================================
-- Uji skema target & preferensi: aturan isian target sama dengan form,
-- target hanya menempel pada tipe hari milik sendiri, satu tipe hari bawaan.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('abab0001-0000-4000-8000-000000000001', 'target-ani@contoh.test'),
  ('abab0002-0000-4000-8000-000000000002', 'target-budi@contoh.test')
on conflict do nothing;

-- 0. Semua aturan baru tervalidasi di basis data bersih, dan target hasil
--    seed pengguna baru memenuhi semuanya.
do $$
declare v_belum text;
begin
  select string_agg(conname, ', ') into v_belum
    from pg_constraint
   where conname in (
     'day_types_nama_terisi', 'day_type_targets_protein_rentang', 'day_type_targets_lemak_rentang',
     'day_type_targets_sat_fat_rentang', 'day_type_targets_sat_fat_dalam_lemak',
     'day_type_targets_makro_dalam_kalori', 'day_type_targets_tipe_hari_milik_sendiri')
     and not convalidated;
  assert v_belum is null, format('aturan belum tervalidasi: %s', v_belum);
  assert (select count(*) from pg_constraint where conname like 'day_type_targets_%rentang' or conname in (
            'day_type_targets_sat_fat_dalam_lemak', 'day_type_targets_makro_dalam_kalori',
            'day_type_targets_tipe_hari_milik_sendiri', 'day_types_nama_terisi')) = 7,
    'ketujuh aturan seharusnya terpasang';
  assert (select count(*) from public.day_type_targets
           where user_id = 'abab0001-0000-4000-8000-000000000001') = 12,
    'seed pengguna baru seharusnya 12 target (4 tipe hari x 3 fase)';
end $$;

set request.jwt.claim.sub = 'abab0001-0000-4000-8000-000000000001';
set role authenticated;

-- 1. Target di dalam aturan diterima, termasuk tepat di batas.
do $$
declare v_dt uuid;
begin
  insert into public.day_types (user_id, nama, auto_detect, urutan)
  values ((select auth.uid()), 'Yoga', false, 5)
  returning id into v_dt;

  -- Tipe hari tanpa target tetap sah: tidak ada cadangan dari tipe lain.
  assert not exists (select 1 from public.day_type_targets where day_type_id = v_dt),
    'tipe hari baru seharusnya belum punya target';

  -- Protein 150 g + lemak 100 g = 1.500 kcal = kalorinya: tepat di batas.
  insert into public.day_type_targets (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
  values ((select auth.uid()), v_dt, 'Cut', 1500, 150, 100, 100);
  -- Batas atas tiap kolom sekaligus (500*4 + 400*9 = 5.600 ≤ 8.000).
  insert into public.day_type_targets (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
  values ((select auth.uid()), v_dt, 'Lean Gain', 8000, 500, 400, 200);
  -- Batas bawah: semua makro nol.
  insert into public.day_type_targets (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
  values ((select auth.uid()), v_dt, 'Maintenance', 800, 0, 0, 0);
end $$;

-- 2. Target di luar aturan ditolak, apa pun jalannya (bukan hanya form).
do $$
declare
  v_dt uuid := (select id from public.day_types where nama = 'Rest' and user_id = (select auth.uid()));
  v_kasus record;
  v_gagal boolean;
  v_aturan text;
begin
  for v_kasus in
    select * from (values
      ('protein 501 g',               8000, 501,   70,  20, 'day_type_targets_protein_rentang'),
      ('lemak 401 g',                 8000, 100,  401,  20, 'day_type_targets_lemak_rentang'),
      ('sat fat 201 g',               8000, 100,  300, 201, 'day_type_targets_sat_fat_rentang'),
      ('protein negatif',             2500,  -1,   70,  20, 'day_type_targets_protein_rentang'),
      ('sat fat melebihi lemak',      2500, 150,   60,  61, 'day_type_targets_sat_fat_dalam_lemak'),
      ('protein+lemak > kalori',      1500, 150,  101,  20, 'day_type_targets_makro_dalam_kalori'),
      ('kalori 799',                   799,   0,    0,   0, 'day_type_targets_kalori_masuk_akal')
    ) as t(nama, kalori, protein, lemak, sat_fat, aturan)
  loop
    v_gagal := false;
    v_aturan := null;
    begin
      update public.day_type_targets
         set target_kalori = v_kasus.kalori, target_protein_g = v_kasus.protein,
             target_lemak_g = v_kasus.lemak, batas_sat_fat_g = v_kasus.sat_fat
       where day_type_id = v_dt and fase = 'Cut';
    exception when check_violation then
      v_gagal := true;
      get stacked diagnostics v_aturan = constraint_name;
    end;
    assert v_gagal, format('%s seharusnya ditolak', v_kasus.nama);
    assert v_aturan = v_kasus.aturan, format('%s ditolak oleh %s, seharusnya %s', v_kasus.nama, v_aturan, v_kasus.aturan);
  end loop;

  -- Target lama tetap utuh setelah semua penolakan.
  assert (select target_kalori from public.day_type_targets where day_type_id = v_dt and fase = 'Cut') = 2000,
    'target yang ditolak tidak boleh mengubah baris';
end $$;

-- 3. Target tidak bisa ditempel ke tipe hari akun lain, meski user_id-nya
--    milik sendiri (RLS lolos, FK tunggal lolos — FK komposit yang menahan).
reset role;
-- Tipe hari Budi yang belum bertarget, supaya yang menolak pasti FK-nya,
-- bukan keunikan (tipe hari x fase).
insert into public.day_types (user_id, nama, auto_detect, urutan)
values ('abab0002-0000-4000-8000-000000000002', 'Renang', true, 5);
create temp table dt_budi as
  select id from public.day_types
   where user_id = 'abab0002-0000-4000-8000-000000000002' and nama = 'Renang';
grant select on dt_budi to authenticated;
set role authenticated;

do $$
declare v_gagal boolean := false; v_aturan text;
begin
  begin
    insert into public.day_type_targets (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
    values ((select auth.uid()), (select id from dt_budi), 'Cut', 2400, 150, 70, 20);
  exception when foreign_key_violation then
    v_gagal := true;
    get stacked diagnostics v_aturan = constraint_name;
  end;
  assert v_gagal, 'target untuk tipe hari akun lain seharusnya ditolak';
  assert v_aturan = 'day_type_targets_tipe_hari_milik_sendiri', format('ditolak oleh %s', v_aturan);

  -- Memindahkan target sendiri ke tipe hari akun lain juga ditolak.
  v_gagal := false;
  begin
    update public.day_type_targets set day_type_id = (select id from dt_budi)
     where user_id = (select auth.uid()) and fase = 'Maintenance'
       and day_type_id = (select id from public.day_types where nama = 'Rest' and user_id = (select auth.uid()));
  exception when foreign_key_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'memindahkan target ke tipe hari akun lain seharusnya ditolak';
end $$;

-- 4. Satu tipe hari bawaan per pengguna; nama tidak boleh kosong.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.day_types (user_id, nama, is_default) values ((select auth.uid()), 'Istirahat total', true);
  exception when unique_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'tipe hari bawaan kedua seharusnya ditolak';

  -- Memindahkan status bawaan tetap bisa: lepas dulu, lalu pasang di tipe lain.
  update public.day_types set is_default = false where user_id = (select auth.uid()) and nama = 'Rest';
  update public.day_types set is_default = true where user_id = (select auth.uid()) and nama = 'Yoga';
  assert (select count(*) from public.day_types where user_id = (select auth.uid()) and is_default) = 1,
    'setelah dipindah, tetap tepat satu tipe hari bawaan';

  v_gagal := false;
  begin
    insert into public.day_types (user_id, nama) values ((select auth.uid()), '   ');
  exception when check_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'nama tipe hari kosong seharusnya ditolak';
end $$;

-- 5. Satu tipe hari bawaan milik akun lain tidak menghalangi akun ini
--    (indeksnya per pengguna), dan target akun lain tetap tidak terbaca.
do $$
begin
  assert not exists (select 1 from public.day_type_targets where user_id = 'abab0002-0000-4000-8000-000000000002'),
    'target akun lain seharusnya tidak terbaca';
end $$;

reset role;
do $$
begin
  assert (select count(*) from public.day_types where user_id = 'abab0002-0000-4000-8000-000000000002' and is_default) = 1,
    'akun lain tetap punya bawaannya sendiri';
end $$;

select '✓ skema target & preferensi: aturan = periksaTarget, target hanya di tipe hari sendiri, satu bawaan, nama terisi' as hasil;
