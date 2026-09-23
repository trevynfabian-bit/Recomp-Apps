-- =============================================================================
-- Uji ambil_target: satu baris untuk (tipe hari x fase), tanpa cadangan dari
-- tipe hari atau fase lain, sisa karbo pasti, tipe hari akun lain ditolak.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email) values
  ('a7a70001-0000-4000-8000-000000000001', 'ambil-ani@contoh.test'),
  ('a7a70002-0000-4000-8000-000000000002', 'ambil-budi@contoh.test')
on conflict do nothing;
create temp table rest_budi as
  select id from public.day_types where user_id = 'a7a70002-0000-4000-8000-000000000002' and nama = 'Rest';
grant select on rest_budi to authenticated;

set request.jwt.claim.sub = 'a7a70001-0000-4000-8000-000000000001';
set role authenticated;

do $$
declare
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_yoga uuid;
  r record;
  v_n int;
  v_kode text;
begin
  -- 1. Terisi: angka bawaan dan sisa karbo (2450 − 165×4 − 75×9) / 4 = 278,75 → 278.
  select * into r from public.ambil_target(v_rest, 'Lean Gain');
  assert r.diisi and r.nama_tipe_hari = 'Rest' and r.fase = 'Lean Gain', 'Rest x Lean Gain terisi';
  assert r.target_id = (select id from public.day_type_targets where day_type_id = v_rest and fase = 'Lean Gain'), 'id target asli';
  assert r.target_kalori = 2450 and r.target_protein_g = 165 and r.karbo_g = 278, format('angka: %s', row_to_json(r));

  -- 2. Tanpa fase: fase yang berlaku hari ini.
  select * into r from public.ambil_target(v_rest);
  assert r.fase = (select fase_aktif from public.profiles), format('fase bawaan %s', r.fase);

  -- 3. Belum diisi: satu baris, diisi=false, angka NULL — tanpa cadangan.
  insert into public.day_types (user_id, nama, auto_detect, urutan) values ((select auth.uid()), 'Yoga', false, 5)
  returning id into v_yoga;
  select count(*) into v_n from public.ambil_target(v_yoga, 'Cut');
  assert v_n = 1, 'selalu tepat satu baris';
  select * into r from public.ambil_target(v_yoga, 'Cut');
  assert not r.diisi and r.nama_tipe_hari = 'Yoga' and r.target_id is null, 'Yoga belum diisi';
  assert r.target_kalori is null and r.target_protein_g is null and r.karbo_g is null,
    'angka pinjaman dari tipe hari atau fase lain';

  -- 4. Sisa karbo pasti di batas pecahan (7,4 × 4 + 41,6 × 9 = 404 tepat) → 99, bukan 98.
  insert into public.day_type_targets (user_id, day_type_id, fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g)
  values ((select auth.uid()), v_yoga, 'Maintenance', 800, 7.4, 41.6, 10);
  select * into r from public.ambil_target(v_yoga, 'Maintenance');
  assert r.karbo_g = 99, format('sisa karbo %s, seharusnya 99', r.karbo_g);

  -- 5. Tipe hari akun lain: ditolak, bukan dijawab "belum diisi".
  begin
    perform public.ambil_target((select id from rest_budi), 'Cut');
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23503', format('tipe hari akun lain: kode %s', v_kode);
end $$;

-- 6. Tanpa sesi dan anon.
reset request.jwt.claim.sub;
do $$
declare v_kode text;
begin
  begin
    perform public.ambil_target(gen_random_uuid());
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '28000', format('tanpa sesi: kode %s', v_kode);
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.ambil_target(uuid, public.fase_program)', 'execute'), 'anon boleh membaca target';
end $$;

delete from auth.users where id in ('a7a70001-0000-4000-8000-000000000001', 'a7a70002-0000-4000-8000-000000000002');

select '✓ ambil_target: satu baris per (tipe hari x fase), tanpa cadangan, sisa karbo pasti, milik sendiri saja' as hasil;
