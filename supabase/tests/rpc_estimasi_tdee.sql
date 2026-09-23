-- =============================================================================
-- Uji estimasi TDEE tiga metode.
--
-- Angka-angka harapannya dihitung tangan dari rumusnya, bukan disalin dari
-- keluaran, supaya uji ini bisa MENOLAK implementasinya:
--
--   berat rata-rata 7 hari 74,70 kg · tinggi 178 cm · usia 32 · pria
--   14 hari Rest → pengali 1,35 · asupan rata-rata 2.800 kcal
--   berat naik 0,70 kg dalam 14 hari
--
--   Mifflin  : 10×74,70 + 6,25×178 − 5×32 + 5 = 1.704,5 → ×1,35 = 2.301
--   Katch@18%: LBM 61,254 kg → 370 + 21,6×61,254 = 1.693,0864 → ×1,35 = 2.286
--   Data     : 0,70×7.700 ÷ 14 = 385 → 2.800 − 385 = 2.415
--   rentang 2.286–2.415 · tengah 2.334 · lebar 129 → keyakinan tinggi
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('ffff6666-0000-0000-0000-000000000006', 'tdee@contoh.test'),
  ('ffff7777-0000-0000-0000-000000000007', 'tdee-tipis@contoh.test');

update public.profiles
   set tinggi_cm = 178, jenis_kelamin = 'pria', tanggal_lahir = date '1994-05-10'
 where user_id = 'ffff6666-0000-0000-0000-000000000006';

set request.jwt.claim.sub = 'ffff6666-0000-0000-0000-000000000006';
set role authenticated;

-- 14 hari 10–23 Sep: tujuh hari pertama 74,00 kg, tujuh terakhir 74,70 kg.
-- Dengan begitu rata-rata 7 hari di 10 Sep = 74,00 dan di 23 Sep = 74,70,
-- jadi perubahan 0,70 kg-nya bisa dihitung tangan.
do $$
declare v_rest uuid; i integer;
begin
  select id into v_rest from public.day_types
   where user_id = 'ffff6666-0000-0000-0000-000000000006' and nama = 'Rest';

  for i in 0..13 loop
    perform public.setel_tipe_hari((date '2026-09-10' + i)::date, v_rest);
    update public.daily_logs
       set berat_pagi_kg = case when i < 7 then 74.00 else 74.70 end,
           sumber_berat = 'manual',
           kalori = 2800
     where tanggal = (date '2026-09-10' + i)::date;
  end loop;
end $$;

-- 1. Masukan yang dikumpulkan server, sebelum rumusnya.
do $$
declare t jsonb; m jsonb;
begin
  t := public.estimasi_tdee(date '2026-09-23', 14, 18);
  m := t->'masukan';

  assert (t->>'dari') = '2026-09-10', format('dari = %s', t->>'dari');
  assert (m->>'berat_kg')::numeric = 74.70,
    format('berat = %s, seharusnya rata-rata 7 hari 74,70', m->>'berat_kg');
  assert (m->>'usia_tahun')::int = 32, format('usia = %s, seharusnya 32', m->>'usia_tahun');
  assert (m->>'tinggi_cm')::numeric = 178, 'tinggi tidak terbaca dari profil';
  assert (m->>'jenis_kelamin') = 'pria', 'jenis kelamin tidak terbaca dari profil';
  assert (m->>'hari_data')::int = 14, format('hari_data = %s, seharusnya 14', m->>'hari_data');
  assert (t->>'hari_tercatat')::int = 14, format('hari_tercatat = %s', t->>'hari_tercatat');
  assert (m->>'rata_asupan_kalori')::numeric = 2800,
    format('asupan = %s, seharusnya 2800', m->>'rata_asupan_kalori');
  assert (m->>'perubahan_berat_kg')::numeric = 0.70,
    format('perubahan berat = %s, seharusnya 0,70', m->>'perubahan_berat_kg');
  assert jsonb_array_length(m->'tipe_hari_minggu') = 14,
    'tipe hari yang dijalani seharusnya 14 hari';
  assert (t->>'pengali_aktivitas')::numeric = 1.35,
    format('pengali = %s, seharusnya 1,35 (semuanya Rest)', t->>'pengali_aktivitas');
  assert (t->>'kcal_per_kg')::int = 7700, 'kcal per kg seharusnya 7700';
end $$;

-- 2. Tiga metode, angka per metode, rentang, dan keyakinan.
do $$
declare t jsonb;
begin
  t := public.estimasi_tdee(date '2026-09-23', 14, 18);

  assert jsonb_array_length(t->'metode') = 3,
    format('%s metode terhitung, seharusnya 3', jsonb_array_length(t->'metode'));

  assert (t->'metode'->0->>'nama') = 'Mifflin-St Jeor', 'metode pertama bukan Mifflin';
  assert (t->'metode'->0->>'nilai')::int = 2301,
    format('Mifflin = %s, seharusnya 2301', t->'metode'->0->>'nilai');
  assert (t->'metode'->0->>'bmr')::numeric = 1704.5,
    format('BMR Mifflin = %s, seharusnya 1704,5', t->'metode'->0->>'bmr');
  assert not (t->'metode'->0->>'berbasis_data')::boolean, 'Mifflin bukan berbasis data';

  assert (t->'metode'->1->>'nama') = 'Katch-McArdle', 'metode kedua bukan Katch-McArdle';
  assert (t->'metode'->1->>'nilai')::int = 2286,
    format('Katch = %s, seharusnya 2286', t->'metode'->1->>'nilai');
  assert (t->'metode'->1->>'lbm_kg')::numeric = 61.254,
    format('LBM = %s, seharusnya 61,254', t->'metode'->1->>'lbm_kg');

  assert (t->'metode'->2->>'nama') = 'Dari data Anda', 'metode ketiga bukan dari data';
  assert (t->'metode'->2->>'nilai')::int = 2415,
    format('dari data = %s, seharusnya 2415', t->'metode'->2->>'nilai');
  assert (t->'metode'->2->>'energi_berat_kcal_per_hari')::numeric = 385,
    format('energi berat = %s, seharusnya 385', t->'metode'->2->>'energi_berat_kcal_per_hari');
  assert (t->'metode'->2->>'berbasis_data')::boolean, 'metode data harus ditandai berbasis data';

  assert (t->>'min')::int = 2286, format('min = %s', t->>'min');
  assert (t->>'maks')::int = 2415, format('maks = %s', t->>'maks');
  assert (t->>'tengah')::int = 2334, format('tengah = %s, seharusnya 2334', t->>'tengah');
  assert (t->>'lebar')::int = 129, format('lebar = %s, seharusnya 129', t->>'lebar');
  assert (t->>'keyakinan') = 'tinggi', format('keyakinan = %s, seharusnya tinggi', t->>'keyakinan');
end $$;

-- 3. Tanpa persen lemak, Katch-McArdle DILEWATI — bukan ditebak.
do $$
declare t jsonb;
begin
  t := public.estimasi_tdee(date '2026-09-23', 14);
  assert jsonb_array_length(t->'metode') = 2,
    format('%s metode, seharusnya 2 tanpa body fat', jsonb_array_length(t->'metode'));
  assert (select count(*) = 0 from jsonb_array_elements(t->'metode') as x
           where x->>'nama' = 'Katch-McArdle'),
    'Katch-McArdle seharusnya tidak muncul tanpa persen lemak';
  assert (t->>'min')::int = 2301 and (t->>'maks')::int = 2415,
    format('rentang = %s–%s, seharusnya 2301–2415', t->>'min', t->>'maks');
  assert (t->>'tengah')::int = 2358, format('tengah = %s, seharusnya 2358', t->>'tengah');
end $$;

-- 4. Profil belum lengkap → Mifflin dilewati; metode data tetap jalan.
do $$
declare t jsonb;
begin
  update public.profiles set tanggal_lahir = null
   where user_id = 'ffff6666-0000-0000-0000-000000000006';

  t := public.estimasi_tdee(date '2026-09-23', 14);
  assert jsonb_array_length(t->'metode') = 1,
    format('%s metode, seharusnya hanya metode data', jsonb_array_length(t->'metode'));
  assert (t->'metode'->0->>'nama') = 'Dari data Anda', 'yang tersisa bukan metode data';
  assert (t->>'lebar')::int = 0, 'satu metode seharusnya berentang nol';
  assert (t->>'keyakinan') = 'tinggi',
    format('keyakinan = %s; metode data 14 hari seharusnya tinggi', t->>'keyakinan');

  update public.profiles set tanggal_lahir = date '1994-05-10'
   where user_id = 'ffff6666-0000-0000-0000-000000000006';
end $$;

-- 5. Periode pendek: metode data tidak terhitung, jadi keyakinan TIDAK PERNAH
--    tinggi — seberapa pun rapinya rumus populasi.
do $$
declare t jsonb;
begin
  -- Periode 7 hari terakhir: tercatat 7 hari, tapi rentang catatan 7 hari
  -- (< 14) sehingga keyakinannya turun ke sedang.
  t := public.estimasi_tdee(date '2026-09-23', 7, 18);
  assert (t->'masukan'->>'hari_data')::int = 7, format('hari_data = %s', t->'masukan'->>'hari_data');
  assert (t->>'keyakinan') = 'sedang',
    format('keyakinan = %s, seharusnya sedang untuk 7 hari', t->>'keyakinan');
end $$;

-- 6. Catatan asupan yang JARANG tidak boleh lolos hanya karena rentangnya
--    panjang: masukan metode data dikosongkan, dan keyakinannya rendah.
reset role;
set request.jwt.claim.sub = 'ffff7777-0000-0000-0000-000000000007';
set role authenticated;

do $$
declare t jsonb; v_rest uuid;
begin
  update public.profiles
     set tinggi_cm = 170, jenis_kelamin = 'wanita', tanggal_lahir = date '1996-03-01'
   where user_id = 'ffff7777-0000-0000-0000-000000000007';

  select id into v_rest from public.day_types
   where user_id = 'ffff7777-0000-0000-0000-000000000007' and nama = 'Rest';

  -- Dua hari asupan saja, tapi berjarak 13 hari.
  perform public.setel_tipe_hari(date '2026-09-10', v_rest);
  perform public.setel_tipe_hari(date '2026-09-23', v_rest);
  update public.daily_logs set berat_pagi_kg = 62.00, sumber_berat = 'manual', kalori = 2100
   where tanggal = date '2026-09-10';
  update public.daily_logs set berat_pagi_kg = 62.90, sumber_berat = 'manual', kalori = 2100
   where tanggal = date '2026-09-23';

  t := public.estimasi_tdee(date '2026-09-23', 14);
  assert (t->>'hari_tercatat')::int = 2, format('hari_tercatat = %s', t->>'hari_tercatat');
  assert (t->'masukan'->'rata_asupan_kalori') = 'null'::jsonb,
    'asupan seharusnya dikosongkan saat catatannya jarang';
  assert (t->'masukan'->'perubahan_berat_kg') = 'null'::jsonb,
    'perubahan berat seharusnya dikosongkan saat catatannya jarang';
  assert (select count(*) = 0 from jsonb_array_elements(t->'metode') as x
           where (x->>'berbasis_data')::boolean),
    'metode berbasis data seharusnya tidak terhitung';
  assert (t->>'keyakinan') = 'rendah',
    format('keyakinan = %s, seharusnya rendah tanpa metode data', t->>'keyakinan');
  -- Rumus populasi TETAP dihitung: lebih baik rentang jujur daripada layar kosong.
  assert jsonb_array_length(t->'metode') = 1, 'Mifflin seharusnya tetap terhitung';
  assert (t->'metode'->0->>'nama') = 'Mifflin-St Jeor', 'yang terhitung bukan Mifflin';
end $$;

-- 7. Tanpa timbangan sama sekali, tidak ada satu pun metode yang bisa jalan.
do $$
declare t jsonb;
begin
  update public.daily_logs set berat_pagi_kg = null, sumber_berat = null
   where user_id = 'ffff7777-0000-0000-0000-000000000007';

  t := public.estimasi_tdee(date '2026-09-23', 14, 20);
  assert jsonb_array_length(t->'metode') = 0,
    format('%s metode, seharusnya nol tanpa berat', jsonb_array_length(t->'metode'));
  assert (t->'min') = 'null'::jsonb and (t->'tengah') = 'null'::jsonb,
    'rentang seharusnya kosong, bukan nol';
  assert (t->>'keyakinan') = 'rendah', 'tanpa metode, keyakinan seharusnya rendah';
end $$;

-- 8. Pengali aktivitas: empat tipe hari PRD + cadangan untuk yang tak dikenal.
do $$
begin
  assert public.pengali_aktivitas('Rest') = 1.35, 'pengali Rest salah';
  assert public.pengali_aktivitas('Angkat Beban') = 1.55, 'pengali Angkat Beban salah';
  assert public.pengali_aktivitas('Beban+Lari') = 1.7, 'pengali Beban+Lari salah';
  assert public.pengali_aktivitas('Padel') = 1.65, 'pengali Padel salah';
  assert public.pengali_aktivitas('Yoga') = 1.5, 'tipe hari tak dikenal seharusnya 1,5';
  assert public.pengali_aktivitas(null) = 1.5, 'tipe hari kosong seharusnya 1,5';
end $$;

-- 9. Tipe hari campuran → pengali rata-rata dari hari yang DIJALANI.
reset role;
set request.jwt.claim.sub = 'ffff6666-0000-0000-0000-000000000006';
set role authenticated;

do $$
declare t jsonb; v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff6666-0000-0000-0000-000000000006' and nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff6666-0000-0000-0000-000000000006' and nama = 'Beban+Lari';
  perform public.setel_tipe_hari(date '2026-09-23', v_id);

  -- (12×1,35 + 1,55 + 1,7) ÷ 14 = 19,45 ÷ 14 = 1,389286
  t := public.estimasi_tdee(date '2026-09-23', 14, 18);
  assert (t->>'pengali_aktivitas')::numeric = 1.389286,
    format('pengali campuran = %s, seharusnya 1,389286', t->>'pengali_aktivitas');
  -- Pengali naik → semua metode berbasis rumus ikut naik.
  assert (t->'metode'->0->>'nilai')::int > 2301,
    format('Mifflin = %s, seharusnya di atas 2301', t->'metode'->0->>'nilai');
end $$;

-- 10. Periode di luar batas ditolak, bukan dipotong diam-diam.
do $$
begin
  begin
    perform public.estimasi_tdee(date '2026-09-23', 3);
    assert false, 'periode 3 hari seharusnya ditolak';
  exception when numeric_value_out_of_range then
    null;
  end;
  begin
    perform public.estimasi_tdee(date '2026-09-23', 400);
    assert false, 'periode 400 hari seharusnya ditolak';
  exception when numeric_value_out_of_range then
    null;
  end;
end $$;

-- 11. Isolasi & hak akses.
do $$
declare t jsonb;
begin
  t := public.estimasi_tdee(date '2026-09-23', 14);
  -- Pengguna A tidak boleh melihat catatan pengguna B: beratnya masih 74,70.
  assert (t->'masukan'->>'berat_kg')::numeric = 74.70,
    format('berat pengguna A = %s — catatan pengguna lain ikut terbaca',
           t->'masukan'->>'berat_kg');
end $$;

reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.estimasi_tdee(date '2026-09-23', 14);
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;

  assert not has_function_privilege('anon', 'public.estimasi_tdee(date, integer, numeric)', 'execute'),
    'anon masih boleh menghitung TDEE';
  assert has_function_privilege('authenticated', 'public.estimasi_tdee(date, integer, numeric)', 'execute'),
    'authenticated seharusnya boleh menghitung TDEE';
end $$;

select '✓ estimasi TDEE: tiga metode dihitung tangan & cocok, metode yang kurang datanya dilewati, keyakinan tidak pernah tinggi tanpa metode data' as hasil;
