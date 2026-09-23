-- =============================================================================
-- Uji seed target bawaan: setiap akun yang memakai app punya 4 tipe hari x 3
-- fase, termasuk akun lama yang dibuat sebelum pemicu penyiapan ada — tanpa
-- pernah memunculkan kembali tipe hari yang diubah atau dihapus pengguna.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

-- Pengguna baru lewat pemicu seperti biasa.
insert into auth.users (id, email) values ('5eed0001-0000-4000-8000-000000000001', 'seed-baru@contoh.test')
on conflict do nothing;

-- Akun lama: dibuat saat pemicunya belum terpasang (web lebih dulu ada).
alter table auth.users disable trigger pengguna_baru_disiapkan;
insert into auth.users (id, email) values
  ('5eed0002-0000-4000-8000-000000000002', 'seed-lama@contoh.test'),
  ('5eed0003-0000-4000-8000-000000000003', 'seed-lama-tidak-pakai-app@contoh.test')
on conflict do nothing;
alter table auth.users enable trigger pengguna_baru_disiapkan;

-- 1. Pengguna baru: semua kombinasi 4 tipe hari x 3 fase, nilai bawaan, satu bawaan.
do $$
declare u uuid := '5eed0001-0000-4000-8000-000000000001';
begin
  assert (select count(*) from public.day_types where user_id = u) = 4, 'empat tipe hari bawaan';
  assert (select count(*) from public.day_type_targets where user_id = u) = 12, '12 target (4 x 3)';
  assert not exists (
    select 1 from public.day_types d cross join unnest(enum_range(null::public.fase_program)) as f(fase)
     where d.user_id = u
       and not exists (select 1 from public.day_type_targets t where t.day_type_id = d.id and t.fase = f.fase)
  ), 'ada kombinasi tipe hari x fase tanpa target';
  assert (select array_agg(nama order by urutan) from public.day_types where user_id = u)
         = array['Rest', 'Angkat Beban', 'Beban+Lari', 'Padel'], 'urutan tipe hari bawaan';
  assert (select nama from public.day_types where user_id = u and is_default) = 'Rest', 'Rest sebagai bawaan';
  assert (select target_kalori from public.day_type_targets t join public.day_types d on d.id = t.day_type_id
           where t.user_id = u and d.nama = 'Angkat Beban' and t.fase = 'Lean Gain') = 2850,
    'nilai bawaan Angkat Beban x Lean Gain';
end $$;

-- 2. Akun lama belum disiapkan sama sekali.
do $$
begin
  assert not exists (select 1 from public.day_types where user_id = '5eed0002-0000-4000-8000-000000000002'),
    'kontrol: akun lama tanpa tipe hari';
  assert not exists (select 1 from public.profiles where user_id = '5eed0002-0000-4000-8000-000000000002'),
    'kontrol: akun lama tanpa profil';
end $$;

-- 3. Akun lama membuka app: muat_target menyiapkannya lebih dulu.
set request.jwt.claim.sub = '5eed0002-0000-4000-8000-000000000002';
set role authenticated;
do $$
declare m jsonb := public.muat_target();
begin
  assert jsonb_array_length(m->'tipe_hari') = 4, format('%s tipe hari setelah muat pertama', jsonb_array_length(m->'tipe_hari'));
  assert jsonb_array_length(m->'target') = 12, format('%s target setelah muat pertama', jsonb_array_length(m->'target'));
  assert exists (select 1 from public.profiles), 'profil ikut disiapkan';
  assert exists (select 1 from public.fase_periode where selesai_tanggal is null), 'periode fase awal ikut disiapkan';

  -- Muat berikutnya tidak menambah apa pun.
  m := public.muat_target();
  assert jsonb_array_length(m->'tipe_hari') = 4 and jsonb_array_length(m->'target') = 12, 'muat kedua menggandakan';
  assert not public.siapkan_data_awal_saya(), 'penyiapan kedua seharusnya tidak melakukan apa-apa';
end $$;

-- 4. Tipe hari yang diganti nama & dihapus tidak dimunculkan lagi.
do $$
begin
  update public.day_types set nama = 'Istirahat' where nama = 'Rest';
  delete from public.day_types where nama = 'Padel';
  perform public.muat_target();
  assert (select array_agg(nama order by urutan) from public.day_types)
         = array['Istirahat', 'Angkat Beban', 'Beban+Lari'], 'tipe hari pengguna diubah oleh penyiapan ulang';
  assert (select count(*) from public.day_type_targets) = 9, 'target Padel yang dihapus kembali';
end $$;

-- 5. Akun lama yang tidak pernah membuka app tidak ditulisi apa pun.
reset role;
do $$
begin
  assert not exists (select 1 from public.day_types where user_id = '5eed0003-0000-4000-8000-000000000003'),
    'akun yang tidak memakai app ikut disiapkan';
  assert not exists (select 1 from public.profiles where user_id = '5eed0003-0000-4000-8000-000000000003'),
    'profil akun yang tidak memakai app ikut dibuat';
end $$;

-- 6. Tanpa sesi ditolak; anon tidak boleh menjalankan.
reset request.jwt.claim.sub;
set role authenticated;
do $$
declare v_kode text;
begin
  begin
    perform public.siapkan_data_awal_saya();
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '28000', format('tanpa sesi: kode %s', v_kode);
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.siapkan_data_awal_saya()', 'execute'), 'anon boleh menyiapkan';
  -- Versi yang menerima id tetap tertutup untuk klien.
  assert not has_function_privilege('authenticated', 'public.siapkan_data_awal_pengguna(uuid)', 'execute'),
    'klien bisa menyiapkan data untuk id siapa pun';
end $$;

delete from auth.users where id in ('5eed0001-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000002',
                                    '5eed0003-0000-4000-8000-000000000003');

select '✓ seed target bawaan: 4 tipe hari x 3 fase untuk akun baru & akun lama saat muat pertama; pilihan pengguna tidak ditimpa' as hasil;
