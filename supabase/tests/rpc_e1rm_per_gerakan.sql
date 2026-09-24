-- =============================================================================
-- Uji endpoint e1RM per gerakan.
--
-- Aturan arahnya sudah dibuktikan sama dengan TypeScript oleh
-- `npm run cek:paritas`. Di sini yang diuji bentuk jawabannya, rentang
-- tanggal, penolakan masukan cacat, isolasi, dan hak akses.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('e1e1e1e1-0000-0000-0000-000000000001', 'e1rm-a@contoh.test'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 'e1rm-b@contoh.test');

-- Set ditulis jalur server (pengguna hanya boleh membaca workout_sets).
do $$
declare u uuid := 'e1e1e1e1-0000-0000-0000-000000000001'; w1 uuid; w2 uuid; w3 uuid;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, waktu_mulai)
  values (u, date '2026-09-01', 'Push A', 'angkat_beban', 'hevy', 'e1-1', timestamptz '2026-09-01 07:00+07') returning id into w1;
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, waktu_mulai)
  values (u, date '2026-09-08', 'Push B', 'angkat_beban', 'hevy', 'e1-2', timestamptz '2026-09-08 07:00+07') returning id into w2;
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, waktu_mulai)
  values (u, date '2026-10-20', 'Push C', 'angkat_beban', 'hevy', 'e1-3', timestamptz '2026-10-20 07:00+07') returning id into w3;
  insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, beban_kg, reps) values
    (w1, u, 'Bench Press', 1, 1, 80, 8), (w1, u, 'Bench Press', 1, 2, 82.5, 6),
    (w1, u, 'Squat', 2, 1, 100, 5), (w1, u, 'Pull Up', 3, 1, null, 8),
    (w2, u, 'Bench Press', 1, 1, 85, 8), (w2, u, 'Squat', 2, 1, 95, 5), (w2, u, 'Overhead Press', 3, 1, 50, 8),
    (w3, u, 'Bench Press', 1, 1, 120, 1);
end $$;

set request.jwt.claim.sub = 'e1e1e1e1-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Bentuk jawaban: per gerakan, urut naik → turun → datar → satu titik.
do $$
declare r jsonb; g jsonb;
begin
  r := public.e1rm_per_gerakan(date '2026-09-01', date '2026-09-30');
  assert r->>'periode_dari' = '2026-09-01' and r->>'periode_sampai' = '2026-09-30', 'periode tidak dikembalikan';
  assert jsonb_array_length(r->'gerakan') = 3, format('%s gerakan, seharusnya 3 (Pull Up tanpa beban tidak ikut)', jsonb_array_length(r->'gerakan'));
  assert (r->>'naik')::int = 1 and (r->>'turun')::int = 1 and (r->>'datar')::int = 0, format('hitungan %s', r);

  g := r->'gerakan'->0;
  assert g->>'latihan' = 'Bench Press' and g->>'arah' = 'naik', format('gerakan pertama %s', g);
  -- Titik sesi 1 = e1RM set terbaik: 80 × 8 = 101,3 vs 82,5 × 6 = 99,0.
  assert (g->'titik'->0->>'e1rm_kg')::numeric = 101.3, format('titik pertama Bench %s', g->'titik'->0);
  assert (g->>'awal_kg')::numeric = 101.3 and (g->>'akhir_kg')::numeric = 107.7, format('ujung Bench %s', g);
  assert (g->>'selisih_kg')::numeric = 6.4 and (g->>'terbaik_kg')::numeric = 107.7 and (g->>'jumlah_sesi')::int = 2, format('Bench %s', g);

  g := r->'gerakan'->1;
  assert g->>'latihan' = 'Squat' and g->>'arah' = 'turun', format('gerakan kedua %s', g);

  -- Satu titik: dikirim (berguna di layar), tanpa arah & selisih.
  g := r->'gerakan'->2;
  assert g->>'latihan' = 'Overhead Press' and g->'arah' = 'null'::jsonb and g->'selisih_kg' = 'null'::jsonb,
    format('gerakan satu titik %s', g);
end $$;

-- 2. Rentang tanggal membatasi: sesi 20 Okt tidak ikut di September, ikut bila diminta.
do $$
declare r jsonb;
begin
  r := public.e1rm_per_gerakan(date '2026-09-01', date '2026-10-31');
  assert (r->'gerakan'->0->>'jumlah_sesi')::int = 3, format('Bench Sep–Okt %s sesi, seharusnya 3', r->'gerakan'->0->>'jumlah_sesi');
  r := public.e1rm_per_gerakan(date '2026-11-01', date '2026-11-30');
  assert jsonb_array_length(r->'gerakan') = 0 and (r->>'naik')::int = 0, 'rentang kosong seharusnya tanpa gerakan';
end $$;

-- 3. Masukan cacat ditolak dengan kode yang dipetakan klien.
do $$
declare v_kode text;
begin
  begin perform public.e1rm_per_gerakan(null, date '2026-09-30'); exception when others then v_kode := sqlstate; end;
  assert v_kode = '22004', format('tanggal kosong: %s', v_kode);
  v_kode := null;
  begin perform public.e1rm_per_gerakan(date '2026-09-30', date '2026-09-01'); exception when others then v_kode := sqlstate; end;
  assert v_kode = '22007', format('rentang terbalik: %s', v_kode);
  v_kode := null;
  begin perform public.e1rm_per_gerakan(date '2025-01-01', date '2026-09-30'); exception when others then v_kode := sqlstate; end;
  assert v_kode = '22003', format('rentang > 400 hari: %s', v_kode);
end $$;

-- 4. Isolasi: B tidak melihat gerakan A.
set request.jwt.claim.sub = 'e1e1e1e1-0000-0000-0000-000000000002';
do $$
begin
  assert jsonb_array_length(public.e1rm_per_gerakan(date '2026-09-01', date '2026-09-30')->'gerakan') = 0, 'B melihat gerakan A';
end $$;

-- 5. Tanpa sesi ditolak; anon tidak punya hak eksekusi.
set request.jwt.claim.sub = '';
do $$
declare v_kode text;
begin
  begin perform public.e1rm_per_gerakan(date '2026-09-01', date '2026-09-30'); exception when others then v_kode := sqlstate; end;
  assert v_kode = '28000', format('tanpa sesi: %s', v_kode);
end $$;

reset role;
set role anon;
do $$
declare v_ditolak boolean := false;
begin
  begin perform public.e1rm_per_gerakan(date '2026-09-01', date '2026-09-30');
  exception when insufficient_privilege then v_ditolak := true; end;
  assert v_ditolak, 'anon bisa memanggil e1rm_per_gerakan';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('e1e1e1e1-0000-0000-0000-000000000001', 'e1e1e1e1-0000-0000-0000-000000000002');
select '✓ e1RM per gerakan: titik set terbaik per sesi, urut arah, rentang dibatasi, masukan cacat ditolak, isolasi & hak akses' as hasil;
