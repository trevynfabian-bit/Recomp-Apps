-- =============================================================================
-- Uji endpoint sinkron_healthkit & penanda asal berat.
--
-- Tanggal relatif terhadap hari ini (WIB): "yang baru masuk hari ini" dan
-- jam timbang manual bergantung pada hari berjalan.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('a1b1c1d1-0000-0000-0000-000000000001', 'hk-a@contoh.test'),
  ('a2b2c2d2-0000-0000-0000-000000000002', 'hk-b@contoh.test');

set request.jwt.claim.sub = 'a1b1c1d1-0000-0000-0000-000000000001';
set role authenticated;

-- Pembantu: waktu WIB untuk tanggal relatif hari ini.
create function pg_temp.wib(p_hari integer, p_jam text)
returns text
language sql
stable
as $$
  select format('%sT%s:00+07:00', (now() at time zone 'Asia/Jakarta')::date + p_hari, p_jam)
$$;

-- --- 1. Tanpa koneksi, kiriman ditolak ----------------------------------------
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.sinkron_healthkit('{"sampel": []}');
  exception when raise_exception then v_gagal := true; end;
  assert v_gagal, 'kiriman tanpa koneksi Apple Health seharusnya ditolak';
end $$;

insert into public.health_connections (user_id, sumber) values ('a1b1c1d1-0000-0000-0000-000000000001', 'apple_health');

-- --- 2. Sampel: disimpan, dilewati beserta alasannya -------------------------
do $$
declare
  h jsonb;
  v_hari text := ((now() at time zone 'Asia/Jakarta')::date)::text;
  v_mulai text := pg_temp.wib(0, '00:00');
  v_selesai text := pg_temp.wib(1, '00:00');
begin
  h := public.sinkron_healthkit(jsonb_build_object('sampel', jsonb_build_array(
    -- 0–2: langkah hari ini: iPhone, Watch, dan total gabungan HealthKit.
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.iphone', 'nilai', 3000, 'mulai', v_mulai, 'selesai', v_selesai),
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.watch', 'nilai', 2800, 'mulai', v_mulai, 'selesai', v_selesai),
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'nilai', 3100, 'mulai', v_mulai, 'selesai', v_selesai),
    -- 3: energi aktif Watch.
    jsonb_build_object('jenis', 'kalori_aktif', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.watch', 'nilai', 200, 'mulai', v_mulai, 'selesai', v_selesai),
    -- 4–8: yang harus DILEWATI, masing-masing dengan alasannya.
    jsonb_build_object('jenis', 'langkah', 'id', 'x-pecahan', 'nilai', 12.5, 'mulai', v_mulai),
    jsonb_build_object('jenis', 'lainnya', 'id', 'x-jenis', 'nilai', 1, 'mulai', v_mulai),
    jsonb_build_object('jenis', 'recovery', 'id', 'x-whoop', 'nilai', 60, 'mulai', v_mulai),
    jsonb_build_object('jenis', 'langkah', 'id', 'x-format', 'nilai', 'banyak', 'mulai', v_mulai),
    jsonb_build_object('jenis', 'tidur', 'id', 'x-tidur', 'nilai', 400, 'mulai', v_mulai)
  )));

  assert (h ->> 'disimpan')::int = 4, format('disimpan = %s, seharusnya 4', h ->> 'disimpan');
  assert (select jsonb_agg(e ->> 'alasan' order by (e ->> 'indeks')::int) from jsonb_array_elements(h -> 'dilewati') e)
         = '["nilai_di_luar_rentang", "jenis_tidak_dikenal", "bukan_apple_health", "format_tidak_sah", "waktu_tidak_sah"]'::jsonb,
    format('alasan dilewati = %s', h -> 'dilewati');
  assert (select jsonb_agg((e ->> 'indeks')::int order by (e ->> 'indeks')::int) from jsonb_array_elements(h -> 'dilewati') e)
         = '[4, 5, 6, 7, 8]'::jsonb, 'indeks yang dilewati salah';

  -- "Baru masuk" = angka SETELAH anti-dobel: total gabungan 3.100, bukan
  -- 8.900 (iPhone + Watch + gabungan).
  assert h -> 'masuk' = '[{"jenis": "kalori_aktif", "jumlah": 200}, {"jenis": "langkah", "jumlah": 3100}]'::jsonb,
    format('masuk = %s', h -> 'masuk');
  assert (select sinkron_terakhir from public.health_connections where sumber = 'apple_health') is not null,
    'sinkron_terakhir seharusnya diperbarui';
end $$;

-- --- 3. Kiriman ulang: memperbarui, tidak menambah; banner = selisih ---------
do $$
declare
  h jsonb;
  v_hari text := ((now() at time zone 'Asia/Jakarta')::date)::text;
begin
  h := public.sinkron_healthkit(jsonb_build_object('sampel', jsonb_build_array(
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'nilai', 4304,
                       'mulai', pg_temp.wib(0, '00:00'), 'selesai', pg_temp.wib(1, '00:00')),
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.iphone', 'nilai', 4100,
                       'mulai', pg_temp.wib(0, '00:00'), 'selesai', pg_temp.wib(1, '00:00'))
  )));
  assert (select count(*) from public.health_data where jenis = 'langkah') = 3,
    'kiriman ulang seharusnya memperbarui baris yang sama';
  assert h -> 'masuk' = '[{"jenis": "langkah", "jumlah": 1204}]'::jsonb,
    format('masuk kiriman ulang = %s, seharusnya +1.204 langkah', h -> 'masuk');
end $$;

-- --- 4. Sampel yang dihapus di Health ----------------------------------------
do $$
declare
  h jsonb;
  v_hari text := ((now() at time zone 'Asia/Jakarta')::date)::text;
begin
  h := public.sinkron_healthkit(jsonb_build_object('dihapus', jsonb_build_array(
    jsonb_build_object('jenis', 'kalori_aktif', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.watch'),
    -- Asal berbeda: bukan sampel yang sama, tidak ikut terhapus.
    jsonb_build_object('jenis', 'langkah', 'id', 'total:' || v_hari, 'asal', 'com.apple.health.lain'),
    jsonb_build_object('jenis', 'langkah', 'id', 'tidak-pernah-ada')
  )));
  assert (h ->> 'dihapus')::int = 1, format('dihapus = %s, seharusnya 1', h ->> 'dihapus');
  assert not exists (select 1 from public.health_data where jenis = 'kalori_aktif'), 'energi Watch seharusnya terhapus';
  assert (select count(*) from public.health_data where jenis = 'langkah') = 3, 'langkah tidak boleh ikut terhapus';
end $$;

-- --- 5. Berat pagi -------------------------------------------------------------
do $$
declare h jsonb; v public.daily_logs;
begin
  -- Kemarin: dua timbangan pagi; yang PALING PAGI menang, dengan asalnya.
  h := public.sinkron_healthkit(jsonb_build_object('berat', jsonb_build_array(
    jsonb_build_object('id', 'b1', 'kg', 74.3, 'waktu', pg_temp.wib(-1, '06:40'), 'nama_asal', 'Withings'),
    jsonb_build_object('id', 'b2', 'kg', 74.6, 'waktu', pg_temp.wib(-1, '06:10'), 'nama_asal', 'Withings')
  )));
  select * into v from public.daily_logs where tanggal = (now() at time zone 'Asia/Jakarta')::date - 1;
  assert v.berat_pagi_kg = 74.6 and v.sumber_berat = 'healthkit' and v.asal_berat = 'Withings',
    format('berat kemarin = %s (%s, %s), seharusnya 74,6 dari Withings', v.berat_pagi_kg, v.sumber_berat, v.asal_berat);
  assert (v.waktu_timbang at time zone 'Asia/Jakarta')::time = time '06:10', 'jam timbang seharusnya 06.10';
  assert (h -> 'berat' -> 0 ->> 'status') = 'disimpan', format('status = %s', h -> 'berat');

  -- Kiriman berikutnya membawa timbangan yang LEBIH PAGI: menggantikan.
  h := public.sinkron_healthkit(jsonb_build_object('berat', jsonb_build_array(
    jsonb_build_object('id', 'b3', 'kg', 74.1, 'waktu', pg_temp.wib(-1, '05:50'), 'nama_asal', 'Withings'))));
  assert (select berat_pagi_kg from public.daily_logs where tanggal = (now() at time zone 'Asia/Jakarta')::date - 1) = 74.1,
    'timbangan yang lebih pagi seharusnya menggantikan';

  -- ... dan yang LEBIH SIANG tidak.
  h := public.sinkron_healthkit(jsonb_build_object('berat', jsonb_build_array(
    jsonb_build_object('id', 'b4', 'kg', 74.9, 'waktu', pg_temp.wib(-1, '07:30')))));
  assert (h -> 'berat' -> 0 ->> 'status') = 'ada_yang_lebih_pagi', format('status = %s', h -> 'berat');
  assert (select berat_pagi_kg from public.daily_logs where tanggal = (now() at time zone 'Asia/Jakarta')::date - 1) = 74.1,
    'timbangan yang lebih siang tidak boleh menggantikan';
end $$;

-- Berat MANUAL tidak pernah ditimpa sinkron.
do $$
declare h jsonb; v public.daily_logs; d date := (now() at time zone 'Asia/Jakarta')::date - 2;
begin
  perform public.simpan_berat_pagi(d, 75.0);
  h := public.sinkron_healthkit(jsonb_build_object('berat', jsonb_build_array(
    jsonb_build_object('id', 'b5', 'kg', 74.8, 'waktu', pg_temp.wib(-2, '06:30'), 'nama_asal', 'Withings'))));
  select * into v from public.daily_logs where tanggal = d;
  assert v.berat_pagi_kg = 75.0 and v.sumber_berat = 'manual' and v.asal_berat is null,
    format('berat manual tertimpa: %s (%s)', v.berat_pagi_kg, v.sumber_berat);
  assert (h -> 'berat' -> 0 ->> 'status') = 'manual_dipertahankan', format('status = %s', h -> 'berat');

  -- Jalur lama (simpan_berat_pagi dengan sumber healthkit) pun tidak menimpa.
  select * into v from public.simpan_berat_pagi(d, 74.7, 'healthkit');
  assert v.berat_pagi_kg = 75.0 and v.sumber_berat = 'manual',
    'simpan_berat_pagi healthkit seharusnya tidak menimpa berat manual';

  -- Sebaliknya, pengguna BOLEH mengoreksi angka timbangan dengan mengetik.
  select * into v from public.simpan_berat_pagi((now() at time zone 'Asia/Jakarta')::date - 1, 74.4);
  assert v.berat_pagi_kg = 74.4 and v.sumber_berat = 'manual' and v.asal_berat is null,
    'berat yang diketik seharusnya menggantikan angka timbangan';
  assert v.waktu_timbang is null, 'berat yang diketik untuk hari lalu tidak punya jam timbang';

  -- Berat yang diketik untuk HARI INI mencatat jamnya.
  select * into v from public.simpan_berat_pagi((now() at time zone 'Asia/Jakarta')::date, 74.2);
  assert v.waktu_timbang is not null, 'berat hari ini yang diketik seharusnya mencatat jam timbang';
end $$;

-- Timbangan malam tidak dipakai, dan tidak menutupi timbangan pagi di hari yang sama.
do $$
declare h jsonb; d date := (now() at time zone 'Asia/Jakarta')::date - 3;
begin
  h := public.sinkron_healthkit(jsonb_build_object('berat', jsonb_build_array(
    jsonb_build_object('id', 'b6', 'kg', 75.6, 'waktu', pg_temp.wib(-3, '01:15')),
    jsonb_build_object('id', 'b7', 'kg', 74.5, 'waktu', pg_temp.wib(-3, '06:00')),
    jsonb_build_object('id', 'b8', 'kg', 75.9, 'waktu', pg_temp.wib(-3, '20:00')),
    jsonb_build_object('id', 'b9', 'kg', 74.0, 'waktu', 'kemarin pagi'),
    jsonb_build_object('id', 'b10', 'kg', 745, 'waktu', pg_temp.wib(-4, '06:00'))
  )));
  assert (select berat_pagi_kg from public.daily_logs where tanggal = d) = 74.5,
    'berat pagi seharusnya 74,5 (06.00), bukan timbangan 01.15 atau 20.00';
  assert (select count(*) from jsonb_array_elements(h -> 'berat') e where e ->> 'status' = 'bukan_pagi') = 2,
    format('dua timbangan di luar pagi seharusnya dilaporkan: %s', h -> 'berat');
  assert (select jsonb_agg(e ->> 'alasan' order by (e ->> 'indeks')::int) from jsonb_array_elements(h -> 'dilewati') e)
         = '["format_tidak_sah", "nilai_di_luar_rentang"]'::jsonb,
    format('berat yang dilewati = %s', h -> 'dilewati');
  assert not exists (select 1 from public.daily_logs where tanggal = d - 1 and berat_pagi_kg is not null),
    'berat 745 kg tidak boleh tersimpan';
end $$;

-- --- 6. Batas & koneksi --------------------------------------------------------
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    perform public.sinkron_healthkit(jsonb_build_object('dihapus',
      (select jsonb_agg(jsonb_build_object('jenis', 'langkah', 'id', g::text)) from generate_series(1, 5001) g)));
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'kiriman lebih dari 5.000 isi seharusnya ditolak';

  v_gagal := false;
  begin
    perform public.sinkron_healthkit('{"sampel": {"jenis": "langkah"}}');
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'sampel yang bukan daftar seharusnya ditolak';

  -- Pengguna memutus Apple Health: tugas latar yang masih terjadwal ditolak.
  update public.health_connections set status = 'terputus' where sumber = 'apple_health';
  v_gagal := false;
  begin
    perform public.sinkron_healthkit('{"sampel": []}');
  exception when raise_exception then v_gagal := true; end;
  assert v_gagal, 'kiriman setelah koneksi diputus seharusnya ditolak';
end $$;

-- Pengguna lain tidak melihat apa pun; anon tidak bisa memanggil.
reset role;
set request.jwt.claim.sub = 'a2b2c2d2-0000-0000-0000-000000000002';
set role authenticated;
do $$
begin
  assert (select count(*) from public.health_data) = 0, 'pengguna lain seharusnya tidak melihat data A';
  assert (select count(*) from public.daily_logs where berat_pagi_kg is not null) = 0,
    'pengguna lain seharusnya tidak melihat berat A';
end $$;

reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.sinkron_healthkit('{}');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa memanggil sinkron_healthkit';
end $$;

reset role;
delete from auth.users where id in ('a1b1c1d1-0000-0000-0000-000000000001', 'a2b2c2d2-0000-0000-0000-000000000002');
