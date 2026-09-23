-- =============================================================================
-- Uji penerima penarikan Hevy (terima_sesi_hevy) & workout_sets.
--
-- Dibuktikan: sesi + set masuk dengan tanggal WIB; sesi yang disunting di
-- Hevy DIGANTI utuh (set lama tidak tertinggal); sesi dihapus ikut
-- menghapus setnya; kursor maju bersama datanya — dan TIDAK maju untuk
-- koneksi yang diputus di tengah jalan; set tidak bisa ditempel ke latihan
-- orang lain; pengguna hanya membaca setnya sendiri.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('c1d1e1f1-0000-0000-0000-000000000001', 'hevy-a@contoh.test'),
  ('c2d2e2f2-0000-0000-0000-000000000002', 'hevy-b@contoh.test');

insert into public.health_connections (id, user_id, sumber)
values
  ('c1d1e1f1-aaaa-0000-0000-000000000001', 'c1d1e1f1-0000-0000-0000-000000000001', 'hevy'),
  ('c2d2e2f2-aaaa-0000-0000-000000000002', 'c2d2e2f2-0000-0000-0000-000000000002', 'hevy');

set role service_role;

-- --- 1. Sesi masuk: tanggal WIB, set per latihan, kursor maju ---------------
do $$
declare h jsonb;
begin
  assert (select count(*) from public.koneksi_hevy_perlu_sinkron(500) where user_id in
          ('c1d1e1f1-0000-0000-0000-000000000001', 'c2d2e2f2-0000-0000-0000-000000000002')) = 2,
    'antrean seharusnya memuat dua koneksi';

  h := public.terima_sesi_hevy('c1d1e1f1-aaaa-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id', 'hv-1', 'nama', 'Push Day A', 'mulai', '2026-09-15T23:10:00Z', 'durasi_menit', 62, 'jenis', 'angkat_beban',
      'latihan', jsonb_build_array(
        jsonb_build_object('latihan', 'Bench Press (Barbell)', 'sets', jsonb_build_array(
          jsonb_build_object('set_ke', 1, 'beban_kg', 40, 'reps', 10, 'jenis', 'warmup'),
          jsonb_build_object('set_ke', 2, 'beban_kg', 80, 'reps', 6, 'jenis', 'normal'),
          jsonb_build_object('set_ke', 3, 'beban_kg', 80, 'reps', 5, 'jenis', 'normal'))),
        jsonb_build_object('latihan', 'Pull Up', 'sets', jsonb_build_array(
          jsonb_build_object('set_ke', 1, 'beban_kg', null, 'reps', 8, 'jenis', 'normal'))),
        -- Latihan yang sama muncul lagi di akhir sesi: entri terpisah.
        jsonb_build_object('latihan', 'Bench Press (Barbell)', 'sets', jsonb_build_array(
          jsonb_build_object('set_ke', 1, 'beban_kg', 60, 'reps', 12, 'jenis', 'dropset')))
      ))),
    '[]'::jsonb, timestamptz '2026-09-16 00:00:00+00');

  assert (h ->> 'sesi')::int = 1 and (h ->> 'set')::int = 5, format('hasil = %s', h);
  -- 23.10 UTC tanggal 15 = 06.10 WIB tanggal 16.
  assert (select tanggal from public.workouts where external_id = 'hv-1') = date '2026-09-16',
    'sesi Hevy seharusnya tercatat di tanggal WIB (16 September)';
  assert (select count(*) from public.workout_sets s join public.workouts w on w.id = s.workout_id
           where w.external_id = 'hv-1' and s.latihan = 'Bench Press (Barbell)') = 4,
    'bench press dari dua entri seharusnya empat set';
  assert (select beban_kg from public.workout_sets where latihan = 'Pull Up') is null,
    'pull-up tanpa beban tambahan seharusnya beban null';
  assert (select kursor_sinkron from public.health_connections where id = 'c1d1e1f1-aaaa-0000-0000-000000000001')
         = timestamptz '2026-09-16 00:00:00+00', 'kursor seharusnya maju';
end $$;

-- --- 2. Sesi disunting di Hevy: set DIGANTI utuh ------------------------------
do $$
declare h jsonb;
begin
  h := public.terima_sesi_hevy('c1d1e1f1-aaaa-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'id', 'hv-1', 'nama', 'Push Day A', 'mulai', '2026-09-15T23:10:00Z', 'durasi_menit', 62, 'jenis', 'angkat_beban',
      'latihan', jsonb_build_array(
        jsonb_build_object('latihan', 'Bench Press (Barbell)', 'sets', jsonb_build_array(
          jsonb_build_object('set_ke', 1, 'beban_kg', 82.5, 'reps', 6, 'jenis', 'normal')))))),
    '[]'::jsonb, timestamptz '2026-09-16 01:00:00+00');
  assert (select count(*) from public.workouts where external_id = 'hv-1') = 1, 'sesi yang disunting tidak boleh berganda';
  assert (select count(*) from public.workout_sets) = 1,
    format('set lama seharusnya diganti, bukan ditambah (ada %s)', (select count(*) from public.workout_sets));
  assert (select beban_kg from public.workout_sets) = 82.5, 'beban hasil koreksi seharusnya tersimpan';
end $$;

-- --- 3. Sesi rusak dilewati; sesi lain & kursor tetap maju --------------------
do $$
declare h jsonb;
begin
  h := public.terima_sesi_hevy('c1d1e1f1-aaaa-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object('id', 'hv-rusak', 'nama', 'X', 'mulai', '2026-09-17T00:00:00Z', 'durasi_menit', 10, 'jenis', 'angkat_beban',
        'latihan', jsonb_build_array(jsonb_build_object('latihan', 'Squat', 'sets', jsonb_build_array(
          -- 1.800 kg: salah ketik (180) yang tidak boleh masuk.
          jsonb_build_object('set_ke', 1, 'beban_kg', 1800, 'reps', 5, 'jenis', 'normal'))))),
      jsonb_build_object('id', 'hv-2', 'nama', 'Pull Day', 'mulai', '2026-09-17T23:00:00Z', 'durasi_menit', 55, 'jenis', 'angkat_beban',
        'latihan', jsonb_build_array(jsonb_build_object('latihan', 'Barbell Row', 'sets', jsonb_build_array(
          jsonb_build_object('set_ke', 1, 'beban_kg', 70, 'reps', 8, 'jenis', 'normal')))))),
    '[]'::jsonb, timestamptz '2026-09-18 00:00:00+00');
  assert (h ->> 'sesi')::int = 1 and jsonb_array_length(h -> 'dilewati') = 1, format('hasil = %s', h);
  assert not exists (select 1 from public.workouts where external_id = 'hv-rusak'),
    'sesi rusak seharusnya tidak tersimpan setengah (tanpa set)';
  assert exists (select 1 from public.workouts where external_id = 'hv-2'), 'sesi sehat tetap tersimpan';
end $$;

-- --- 4. Sesi dihapus di Hevy: setnya ikut hilang ------------------------------
do $$
declare h jsonb;
begin
  h := public.terima_sesi_hevy('c1d1e1f1-aaaa-0000-0000-000000000001', '[]'::jsonb, '["hv-1", "tidak-ada"]'::jsonb,
                               timestamptz '2026-09-18 01:00:00+00');
  assert (h ->> 'dihapus')::int = 1, format('dihapus = %s', h ->> 'dihapus');
  assert not exists (select 1 from public.workout_sets s join public.workouts w on w.id = s.workout_id where w.external_id = 'hv-1'),
    'set sesi yang dihapus seharusnya ikut hilang';
end $$;

-- --- 5. Diputus di tengah penarikan: tidak menulis, kursor tidak maju --------
do $$
declare h jsonb; v_kursor timestamptz;
begin
  select kursor_sinkron into v_kursor from public.health_connections where id = 'c2d2e2f2-aaaa-0000-0000-000000000002';
  update public.health_connections set status = 'terputus' where id = 'c2d2e2f2-aaaa-0000-0000-000000000002';
  h := public.terima_sesi_hevy('c2d2e2f2-aaaa-0000-0000-000000000002',
    jsonb_build_array(jsonb_build_object('id', 'hv-b', 'nama', 'B', 'mulai', '2026-09-17T00:00:00Z', 'durasi_menit', 30,
                                         'jenis', 'angkat_beban', 'latihan', '[]'::jsonb)),
    '[]'::jsonb, timestamptz '2026-09-18 00:00:00+00');
  assert h ->> 'diabaikan' = 'koneksi_tidak_terhubung', format('hasil = %s', h);
  assert not exists (select 1 from public.workouts where external_id = 'hv-b'), 'koneksi terputus tidak boleh menulis';
  assert (select kursor_sinkron from public.health_connections where id = 'c2d2e2f2-aaaa-0000-0000-000000000002')
         is not distinct from v_kursor, 'kursor koneksi terputus tidak boleh maju';
  assert (select count(*) from public.koneksi_hevy_perlu_sinkron(500) where user_id in
          ('c1d1e1f1-0000-0000-0000-000000000001', 'c2d2e2f2-0000-0000-0000-000000000002')) = 1,
    'koneksi terputus keluar dari antrean';
end $$;

-- Set tidak bisa ditempel ke latihan milik orang lain (bahkan oleh server).
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, reps)
    select id, 'c2d2e2f2-0000-0000-0000-000000000002', 'Curl', 1, 1, 10 from public.workouts where external_id = 'hv-2';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'set dengan pemilik berbeda dari latihannya seharusnya ditolak';
end $$;

-- --- 6. Pengguna: baca setnya sendiri saja, tidak menulis, tidak memanggil ---
reset role;
set request.jwt.claim.sub = 'c1d1e1f1-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v_gagal boolean;
begin
  assert (select count(*) from public.workout_sets) = 1, 'A seharusnya melihat set Barbell Row-nya';

  v_gagal := false;
  begin
    update public.workout_sets set reps = 20;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna seharusnya tidak bisa mengubah set (Hevy sumber kebenarannya)';

  v_gagal := false;
  begin
    perform public.terima_sesi_hevy('c1d1e1f1-aaaa-0000-0000-000000000001', '[]', '[]', now());
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna seharusnya tidak bisa memanggil terima_sesi_hevy';

  v_gagal := false;
  begin
    perform * from public.koneksi_hevy_perlu_sinkron(10);
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna seharusnya tidak bisa membaca antrean penarikan';
end $$;

reset role;
set request.jwt.claim.sub = 'c2d2e2f2-0000-0000-0000-000000000002';
set role authenticated;
do $$
begin
  assert (select count(*) from public.workout_sets) = 0, 'B seharusnya tidak melihat set A';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('c1d1e1f1-0000-0000-0000-000000000001', 'c2d2e2f2-0000-0000-0000-000000000002');
