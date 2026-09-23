-- =============================================================================
-- Uji API target: muat_target & simpan_target.
-- Semua atau tidak sama sekali, berlaku mulai hari ini, hari lewat dan hari
-- yang diredistribusi tidak disentuh, pesan terbaca, isolasi per pemilik.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('efef0001-0000-4000-8000-000000000001', 'api-target-ani@contoh.test'),
  ('efef0002-0000-4000-8000-000000000002', 'api-target-budi@contoh.test')
on conflict do nothing;

set request.jwt.claim.sub = 'efef0001-0000-4000-8000-000000000001';
set role authenticated;

-- 1. muat_target: tipe hari urut, seluruh target tiap fase, satu snapshot.
do $$
declare m jsonb := public.muat_target();
begin
  assert jsonb_array_length(m->'tipe_hari') = 4, format('%s tipe hari', jsonb_array_length(m->'tipe_hari'));
  assert m->'tipe_hari'->0->>'nama' = 'Rest', 'tipe hari pertama seharusnya Rest (urutan 1)';
  assert (m->'tipe_hari'->0->>'is_default')::boolean, 'Rest seharusnya bawaan';
  assert jsonb_array_length(m->'target') = 12, format('%s target, seharusnya 12', jsonb_array_length(m->'target'));
  assert (select count(distinct t->>'fase') from jsonb_array_elements(m->'target') t) = 3,
    'target seharusnya mencakup ketiga fase';
end $$;

-- 2. Snapshot di daily_logs: kemarin, hari ini, besok (diredistribusi), lusa (tipe lain).
do $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_beban uuid := (select id from public.day_types where nama = 'Angkat Beban');
begin
  perform public.setel_tipe_hari(v_hari_ini - 1, v_rest);
  perform public.setel_tipe_hari(v_hari_ini, v_rest);
  perform public.setel_tipe_hari(v_hari_ini + 1, v_rest);
  perform public.setel_tipe_hari(v_hari_ini + 2, v_beban);
  -- Besok sudah diredistribusi: 200 kcal dipindah dari rencananya.
  update public.daily_logs
     set target_asli_kalori = target_kalori, target_kalori = target_kalori - 200
   where tanggal = v_hari_ini + 1;
end $$;

-- 3. Simpan satu target: berlaku mulai hari ini.
do $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_fase text := (select fase_aktif::text from public.profiles);
  v_kemarin_lama integer := (select target_kalori from public.daily_logs where tanggal = v_hari_ini - 1);
  v_besok_lama integer := (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 1);
  v_lusa_lama integer := (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 2);
  h jsonb;
begin
  h := public.simpan_target(jsonb_build_array(jsonb_build_object(
    'day_type_id', v_rest, 'fase', v_fase,
    'target_kalori', 2600, 'target_protein_g', 170, 'target_lemak_g', 80, 'batas_sat_fat_g', 23)));

  assert jsonb_array_length(h->'target') = 1, 'satu target tersimpan';
  assert (h->'target'->0->>'target_kalori')::int = 2600, 'nilai tersimpan dikembalikan';
  assert (h->>'berlaku_mulai')::date = v_hari_ini, 'berlaku mulai hari ini (Asia/Jakarta)';
  assert (h->>'hari_disegarkan')::int = 1, format('%s hari disegarkan, seharusnya 1 (hari ini)', h->>'hari_disegarkan');
  assert (h->>'hari_diredistribusi_tetap')::int = 1, 'besok yang diredistribusi dilaporkan tetap';

  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini) = 2600,
    'snapshot hari ini ikut target baru';
  assert (select target_protein_g from public.daily_logs where tanggal = v_hari_ini) = 170,
    'protein hari ini ikut target baru';
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini - 1) = v_kemarin_lama,
    'kemarin memegang snapshot lamanya';
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 1) = v_besok_lama,
    'hari yang diredistribusi tidak ditimpa';
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 2) = v_lusa_lama,
    'tipe hari lain tidak tersentuh';
  assert (select target_kalori from public.day_type_targets where day_type_id = v_rest and fase::text = v_fase) = 2600,
    'target tersimpan di tabelnya';
end $$;

-- 4. Semua atau tidak sama sekali: satu butir tidak sah membatalkan semuanya.
do $$
declare
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_padel uuid := (select id from public.day_types where nama = 'Padel');
  v_padel_lama integer := (select target_kalori from public.day_type_targets where day_type_id = v_padel and fase = 'Cut');
  v_gagal boolean := false;
  v_aturan text;
begin
  begin
    perform public.simpan_target(jsonb_build_array(
      jsonb_build_object('day_type_id', v_padel, 'fase', 'Cut',
        'target_kalori', 2500, 'target_protein_g', 180, 'target_lemak_g', 70, 'batas_sat_fat_g', 20),
      jsonb_build_object('day_type_id', v_rest, 'fase', 'Cut',
        'target_kalori', 2100, 'target_protein_g', 170, 'target_lemak_g', 60, 'batas_sat_fat_g', 61)));
  exception when check_violation then
    v_gagal := true;
    get stacked diagnostics v_aturan = constraint_name;
  end;
  assert v_gagal, 'sat fat melebihi lemak seharusnya ditolak';
  assert v_aturan = 'day_type_targets_sat_fat_dalam_lemak', format('ditolak oleh %s', v_aturan);
  assert (select target_kalori from public.day_type_targets where day_type_id = v_padel and fase = 'Cut') = v_padel_lama,
    'butir yang sah ikut batal';
end $$;

-- 5. Permintaan yang cacat ditolak dengan kode & pesan terbaca.
do $$
declare
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_kasus record;
  v_kode text;
  v_pesan text;
begin
  for v_kasus in
    select * from (values
      ('kosong', '[]'::jsonb, '22023', 'Tidak ada target'),
      ('bukan larik', '{"a":1}'::jsonb, '22023', 'Tidak ada target'),
      ('butir bukan objek', '[1]'::jsonb, '22023', 'Setiap butir'),
      ('kolom kurang', jsonb_build_array(jsonb_build_object('day_type_id', v_rest, 'fase', 'Cut', 'target_kalori', 2000)),
         '22023', 'Setiap target butuh'),
      ('butir ganda', jsonb_build_array(
         jsonb_build_object('day_type_id', v_rest, 'fase', 'Cut', 'target_kalori', 2000, 'target_protein_g', 150, 'target_lemak_g', 60, 'batas_sat_fat_g', 18),
         jsonb_build_object('day_type_id', v_rest, 'fase', 'Cut', 'target_kalori', 2100, 'target_protein_g', 150, 'target_lemak_g', 60, 'batas_sat_fat_g', 18)),
         '22023', 'Satu tipe hari dan fase'),
      ('tipe hari tak dikenal', jsonb_build_array(jsonb_build_object('day_type_id', gen_random_uuid(), 'fase', 'Cut',
         'target_kalori', 2000, 'target_protein_g', 150, 'target_lemak_g', 60, 'batas_sat_fat_g', 18)),
         '23503', 'Tipe hari tidak ditemukan'),
      ('terlalu banyak', (select jsonb_agg(jsonb_build_object('day_type_id', v_rest)) from generate_series(1, 101)),
         '22023', 'Paling banyak 100')
    ) as t(nama, isi, kode, awal_pesan)
  loop
    v_kode := null;
    begin
      perform public.simpan_target(v_kasus.isi);
    exception when others then
      v_kode := sqlstate;
      v_pesan := sqlerrm;
    end;
    assert v_kode = v_kasus.kode, format('%s: kode %s, seharusnya %s', v_kasus.nama, v_kode, v_kasus.kode);
    assert v_pesan like v_kasus.awal_pesan || '%', format('%s: pesan "%s"', v_kasus.nama, v_pesan);
  end loop;
end $$;

-- 6. Target untuk tipe hari yang belum bertarget: dibuat (upsert), tanpa
--    mengisi fase lain dengan angka karangan.
do $$
declare v_yoga uuid; m jsonb;
begin
  insert into public.day_types (user_id, nama, auto_detect, urutan)
  values ((select auth.uid()), 'Yoga', false, 5)
  returning id into v_yoga;
  perform public.simpan_target(jsonb_build_array(jsonb_build_object(
    'day_type_id', v_yoga, 'fase', 'Maintenance',
    'target_kalori', 2200, 'target_protein_g', 140, 'target_lemak_g', 70, 'batas_sat_fat_g', 20)));
  m := public.muat_target();
  assert jsonb_array_length(m->'tipe_hari') = 5, 'Yoga ikut termuat';
  assert (select count(*) from jsonb_array_elements(m->'target') t where t->>'day_type_id' = v_yoga::text) = 1,
    'Yoga hanya punya target yang benar-benar diisi';
end $$;

-- 7. Isolasi: akun lain tidak melihat dan tidak bisa menulis target akun ini.
reset role;
create temp table rest_ani as
  select id from public.day_types where nama = 'Rest' and user_id = 'efef0001-0000-4000-8000-000000000001';
grant select on rest_ani to authenticated;
set request.jwt.claim.sub = 'efef0002-0000-4000-8000-000000000002';
set role authenticated;
do $$
declare
  m jsonb := public.muat_target();
  v_rest_ani uuid := (select id from rest_ani);
  v_kode text;
begin
  assert jsonb_array_length(m->'tipe_hari') = 4, 'Budi hanya melihat tipe harinya sendiri';
  assert not exists (select 1 from jsonb_array_elements(m->'tipe_hari') d where d->>'nama' = 'Yoga'),
    'Yoga milik Ani tidak terlihat';
  -- Setiap target yang termuat menempel pada tipe hari Budi sendiri.
  assert jsonb_array_length(m->'target') = 12, 'Budi hanya melihat 12 targetnya sendiri';
  assert not exists (
    select 1 from jsonb_array_elements(m->'target') t
     where not exists (select 1 from jsonb_array_elements(m->'tipe_hari') d where d->>'id' = t->>'day_type_id')
  ), 'ada target yang bukan milik tipe hari Budi';
  assert not exists (select 1 from jsonb_array_elements(m->'target') t where (t->>'day_type_id')::uuid = v_rest_ani),
    'target Rest milik Ani tidak terlihat';

  begin
    perform public.simpan_target(jsonb_build_array(jsonb_build_object(
      'day_type_id', v_rest_ani, 'fase', 'Cut',
      'target_kalori', 2000, 'target_protein_g', 150, 'target_lemak_g', 60, 'batas_sat_fat_g', 18)));
  exception when others then
    v_kode := sqlstate;
  end;
  assert v_kode = '23503', format('menulis ke tipe hari akun lain: kode %s', v_kode);
end $$;

-- 8. Tanpa sesi: ditolak.
reset role;
reset request.jwt.claim.sub;
set role authenticated;
do $$
declare v_kode text;
begin
  begin
    perform public.muat_target();
  exception when others then
    v_kode := sqlstate;
  end;
  assert v_kode = '28000', format('muat tanpa sesi: kode %s', v_kode);
end $$;

reset role;
select '✓ API target: muat satu snapshot, simpan semua-atau-tidak, berlaku mulai hari ini, redistribusi & hari lewat utuh, isolasi terjaga' as hasil;
