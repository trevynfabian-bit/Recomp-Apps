-- =============================================================================
-- Uji konteks data AI Coach.
--
-- Yang diuji di sini bukan angkanya (tiap sumbernya punya berkas ujinya
-- sendiri), melainkan DUA JAMINAN BENTUK yang membuat syarat PRD tidak
-- bergantung pada kepatuhan model:
--
--   1. Berat yang bisa dikutip HANYA rata-rata 7 hari. Timbangan harian tidak
--      pernah muncul sebagai angka berlabel — coach tidak bisa mengutip angka
--      yang tidak diberikan.
--   2. Setiap angka membawa `sumber` sebagai FIELD. Model bisa lupa menulis
--      "estimasi"; ia tidak bisa menghapus field.
--
-- Tanggalnya relatif terhadap hari ini karena `simpan_ukuran` menolak tanggal
-- masa depan menurut jam server.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('bbbb7777-0000-0000-0000-000000000007', 'konteks-a@contoh.test'),
  ('bbbb8888-0000-0000-0000-000000000008', 'konteks-b@contoh.test');

update public.profiles
   set fase_aktif = 'Lean Gain', tinggi_cm = 178, jenis_kelamin = 'pria',
       tanggal_lahir = date '1994-05-10', batas_pinggang_cm = 88
 where user_id = 'bbbb7777-0000-0000-0000-000000000007';

set request.jwt.claim.sub = 'bbbb7777-0000-0000-0000-000000000007';
set role authenticated;

-- 1. Konteks pengguna yang belum punya data apa pun tetap berbentuk utuh.
do $$
declare k jsonb;
begin
  k := public.konteks_coach();
  assert (k->>'fase') = 'Lean Gain', format('fase = %s', k->>'fase');
  assert (k->'angka') is not null, 'daftar angka seharusnya ada, meski kosong';
  assert (k->'aturan'->>'wajib_rata_rata_7_hari')::boolean, 'bendera aturan hilang';
  assert (k->'evaluasi_terakhir') = 'null'::jsonb, 'belum ada evaluasi';
  assert (k->'ringkasan_terakhir') = 'null'::jsonb, 'belum ada ringkasan';
  -- Tanpa timbangan, tidak ada angka berat yang bisa dikutip — bukan nol.
  assert not exists (
    select 1 from jsonb_array_elements(k->'angka') a
     where a->>'kunci' = 'berat_rata_7_hari'
  ), 'angka berat muncul padahal belum ada timbangan';
end $$;

-- Data 28 hari: timbangan naik, asupan tercatat, plus ukuran & tipe hari.
do $$
declare v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date; v_rest uuid; i integer;
begin
  select id into v_rest from public.day_types
   where user_id = 'bbbb7777-0000-0000-0000-000000000007' and nama = 'Rest';

  for i in 0..27 loop
    perform public.setel_tipe_hari((v_hari_ini - 27 + i)::date, v_rest);
    update public.daily_logs
       set berat_pagi_kg = 74.00 + 0.03 * i, sumber_berat = 'manual', kalori = 2500
     where tanggal = (v_hari_ini - 27 + i)::date;
  end loop;

  perform public.simpan_ukuran(v_hari_ini - 14, 85.4, 102.0, 38.5);
  perform public.simpan_ukuran(v_hari_ini - 7, 85.6, 102.1, 38.5);
  perform public.simpan_ukuran(v_hari_ini, 85.8, 102.3, 38.5);
end $$;

-- 2. JAMINAN 1: berat yang dikutip adalah rata-rata 7 hari, dan timbangan
--    HARIAN tidak pernah jadi angka berlabel.
do $$
declare k jsonb; v_rata numeric; v_harian numeric;
begin
  k := public.konteks_coach();

  select (a->>'nilai')::numeric into v_rata
    from jsonb_array_elements(k->'angka') a where a->>'kunci' = 'berat_rata_7_hari';
  assert v_rata is not null, 'rata-rata 7 hari seharusnya ada di daftar angka';

  -- Timbangan hari ini berbeda dari rata-ratanya; itu premis ujinya.
  select berat_pagi_kg into v_harian from public.daily_logs
   where tanggal = (now() at time zone 'Asia/Jakarta')::date;
  assert v_harian <> v_rata,
    format('timbangan harian %s sama dengan rata-rata %s — premis uji ini gugur',
           v_harian, v_rata);

  -- TIDAK ADA satu pun angka berlabel yang bernilai timbangan harian.
  assert not exists (
    select 1 from jsonb_array_elements(k->'angka') a
     where (a->>'unit') = 'kg' and (a->>'nilai')::numeric = v_harian
  ), 'timbangan harian muncul sebagai angka yang bisa dikutip';

  -- Dan tidak ada kunci yang menawarkannya.
  assert not exists (
    select 1 from jsonb_array_elements(k->'angka') a
     where a->>'kunci' in ('berat_hari_ini', 'berat_harian', 'berat_pagi')
  ), 'ada kunci yang menawarkan timbangan harian';

  -- Ia tetap ada di DERET tren, tempat asalnya jelas.
  assert exists (
    select 1 from jsonb_array_elements(k->'tren'->'deret') d
     where (d->>'berat_harian_kg')::numeric = v_harian
  ), 'timbangan harian seharusnya tetap ada di deret tren';
end $$;

-- 3. JAMINAN 2: setiap angka membawa sumber yang dikenal, dan estimasi ditandai
--    sebagai estimasi — bukan diserahkan ke kalimat model.
do $$
declare k jsonb; n_tanpa integer; n_asing integer;
begin
  k := public.konteks_coach(null, 18);

  select count(*) into n_tanpa from jsonb_array_elements(k->'angka') a
   where (a->>'sumber') is null;
  assert n_tanpa = 0, format('%s angka tanpa sumber', n_tanpa);

  select count(*) into n_asing from jsonb_array_elements(k->'angka') a
   where (a->>'sumber') not in ('manual', 'sinkron', 'estimasi');
  assert n_asing = 0, format('%s angka bersumber tak dikenal', n_asing);

  -- Setiap angka juga punya unit & dasar; angka tanpa dasar tidak bisa
  -- diperiksa pengguna.
  assert not exists (select 1 from jsonb_array_elements(k->'angka') a
                      where (a->>'unit') is null or (a->'dasar') is null),
    'ada angka tanpa unit atau tanpa dasar';

  -- TDEE & body fat WAJIB bertanda estimasi.
  assert (select a->>'sumber' from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'tdee') = 'estimasi',
    'TDEE seharusnya bertanda estimasi';
  assert (select a->>'sumber' from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'body_fat_persen') = 'estimasi',
    'body fat seharusnya bertanda estimasi';
  -- Sementara timbangan & catatan makan adalah data mentah.
  assert (select a->>'sumber' from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'berat_rata_7_hari') = 'manual',
    'rata-rata timbangan seharusnya bertanda manual';
  assert (select a->>'sumber' from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'sisa_budget_pekan') = 'manual',
    'sisa budget seharusnya bertanda manual';
end $$;

-- 4. Angkanya sama dengan yang dilaporkan sumber aslinya — konteks tidak
--    menghitung ulang apa pun dengan aturan lain.
do $$
declare k jsonb; t jsonb; b jsonb; bf jsonb;
begin
  k := public.konteks_coach(null, 18);
  t := public.tren_berat_7_hari((now() at time zone 'Asia/Jakarta')::date, 28);
  b := public.budget_mingguan((now() at time zone 'Asia/Jakarta')::date,
                              (now() at time zone 'Asia/Jakarta')::date);
  bf := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);

  assert (select (a->>'nilai')::numeric from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'berat_rata_7_hari')
         = (t->'rata_rata'->>'rata_rata_kg')::numeric,
    'rata-rata di konteks berbeda dari tren_berat_7_hari';
  assert (select (a->>'nilai')::integer from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'sisa_budget_pekan') = (b->>'sisa')::integer,
    'sisa budget di konteks berbeda dari budget_mingguan';
  assert (select (a->>'nilai')::numeric from jsonb_array_elements(k->'angka') a
           where a->>'kunci' = 'body_fat_persen') = (bf->>'persen')::numeric,
    'body fat di konteks berbeda dari estimasi_body_fat';
  assert k->'body_fat' = bf, 'blok body_fat berbeda dari sumbernya';
end $$;

-- 5. Dasar angka menyebut seberapa TIPIS dasarnya: rata-rata dari satu
--    timbangan dan dari tujuh tampak sama kalau hanya angkanya yang disebut.
do $$
declare k jsonb; d jsonb;
begin
  k := public.konteks_coach();
  select a->'dasar' into d from jsonb_array_elements(k->'angka') a
   where a->>'kunci' = 'berat_rata_7_hari';
  assert (d->>'jumlah_timbangan')::int = 7,
    format('jumlah timbangan = %s, seharusnya 7', d->>'jumlah_timbangan');
  assert (d->>'jendela_hari')::int = 7, 'jendela seharusnya disebut';
end $$;

-- 6. Laporan berkala terakhir ikut dibawa, jadi coach tidak mengulang verdict
--    yang sudah pernah ia sampaikan.
do $$
declare k jsonb; v_senin date;
begin
  -- Senin 4 pekan lalu.
  v_senin := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 28;

  insert into public.evaluasi_periodik (
    user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
    arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
  values ('bbbb7777-0000-0000-0000-000000000007', v_senin, v_senin + 27,
          'Lean Gain', 'naik', 'naik', 'naik', 4,
          'lg-naik-campur', 'Naik campur', 'Pinggang ikut naik.',
          'Turunkan surplus 150 kkal.', 'pinggang', 'tinggi');

  insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan)
  values ('bbbb7777-0000-0000-0000-000000000007',
          public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7,
          public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 1,
          'Pekan lalu berat naik 0,2 kg.');

  k := public.konteks_coach();
  assert (k->'evaluasi_terakhir'->>'kode') = 'lg-naik-campur',
    format('evaluasi terakhir = %s', k->'evaluasi_terakhir'->>'kode');
  assert (k->'evaluasi_terakhir'->'arah'->>'pinggang') = 'naik',
    'sumbu masukan evaluasi seharusnya ikut dibawa';
  assert (k->'ringkasan_terakhir'->>'bacaan') = 'Pekan lalu berat naik 0,2 kg.',
    'ringkasan terakhir tidak dibawa';
end $$;

-- 7. Keadaan batas pinggang ikut dibawa — itu yang membuat coach bisa
--    menyinggungnya tanpa diminta.
do $$
declare k jsonb;
begin
  k := public.konteks_coach();
  assert (k->'ukuran'->'batas_pinggang'->>'keadaan') is not null,
    'keadaan batas pinggang seharusnya dibawa';
  assert (k->'ukuran'->'batas_pinggang'->>'batas_cm')::numeric = 88,
    'batas pinggang dari profil tidak terbaca';
end $$;

-- 7b. Kekuatan ikut dibawa: e1RM per gerakan 28 hari terakhir, tanpa deret titik.
reset role;
do $$
declare u uuid := 'bbbb7777-0000-0000-0000-000000000007'; w1 uuid; w2 uuid;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values (u, (now() at time zone 'Asia/Jakarta')::date - 10, 'Push', 'angkat_beban', 'hevy', 'konteks-1') returning id into w1;
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values (u, (now() at time zone 'Asia/Jakarta')::date - 3, 'Push', 'angkat_beban', 'hevy', 'konteks-2') returning id into w2;
  insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, beban_kg, reps)
  values (w1, u, 'Bench Press', 1, 1, 80, 8), (w2, u, 'Bench Press', 1, 1, 85, 8);
end $$;
set request.jwt.claim.sub = 'bbbb7777-0000-0000-0000-000000000007';
set role authenticated;
do $$
declare k jsonb;
begin
  k := public.konteks_coach()->'kekuatan';
  assert (k->>'naik')::int = 1 and jsonb_array_length(k->'gerakan') = 1, format('kekuatan di konteks %s', k);
  assert k->'gerakan'->0->>'latihan' = 'Bench Press' and k->'gerakan'->0->>'arah' = 'naik', format('gerakan %s', k->'gerakan'->0);
  assert not (k->'gerakan'->0 ? 'titik'), 'deret titik tidak perlu ikut ke konteks';
end $$;
reset role;
delete from public.workouts where external_id like 'konteks-%';

-- 8. Isolasi: konteks pengguna lain tidak memuat sepotong pun data pengguna A.
reset role;
set request.jwt.claim.sub = 'bbbb8888-0000-0000-0000-000000000008';
set role authenticated;

do $$
declare k jsonb;
begin
  k := public.konteks_coach();
  assert (k->'angka') = '[]'::jsonb or not exists (
    select 1 from jsonb_array_elements(k->'angka') a
     where a->>'kunci' = 'berat_rata_7_hari'
  ), 'pengguna B membaca berat pengguna A';
  assert (k->'evaluasi_terakhir') = 'null'::jsonb, 'pengguna B membaca evaluasi orang lain';
  assert (k->'ringkasan_terakhir') = 'null'::jsonb, 'pengguna B membaca ringkasan orang lain';
  assert (k->'ukuran'->>'jumlah')::int = 0, 'pengguna B membaca ukuran orang lain';
  assert (k->>'fase') = 'Maintenance', 'pengguna B mewarisi fase pengguna A';
  assert jsonb_array_length(k->'kekuatan'->'gerakan') = 0 and (k->'kekuatan'->>'naik')::int = 0, 'pengguna B membaca latihan pengguna A';
end $$;

-- 9. Tanpa sesi & peran anon.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.konteks_coach();
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;

  assert not has_function_privilege('anon', 'public.konteks_coach(date, numeric)', 'execute'),
    'anon masih boleh membaca konteks coach';
  assert has_function_privilege('authenticated', 'public.konteks_coach(date, numeric)', 'execute'),
    'authenticated seharusnya boleh membaca konteksnya';
end $$;

select '✓ konteks coach: berat harian tidak bisa dikutip, setiap angka bersumber & berdasar, laporan terakhir dibawa, isolasi terjaga' as hasil;
