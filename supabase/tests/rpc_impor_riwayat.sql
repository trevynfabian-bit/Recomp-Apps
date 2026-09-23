-- =============================================================================
-- Uji impor riwayat sekali (import_jobs, mulai_impor, impor_batch, selesaikan_impor).
--
-- Dibuktikan: kemajuan tercatat per potongan; impor ulang berkas yang sama
-- tidak menggandakan apa pun; impor tidak menimpa ukuran yang sudah ada atau
-- sesi yang sudah masuk lewat API Hevy; sesi API yang datang belakangan
-- menggantikan salinan CSV-nya; satu impor berjalan per sumber, job yang
-- terbengkalai dilepas; set API tetap hanya-baca bagi pengguna.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('d1e1f1a1-0000-0000-0000-000000000001', 'impor-a@contoh.test'),
  ('d2e2f2a2-0000-0000-0000-000000000002', 'impor-b@contoh.test');

set request.jwt.claim.sub = 'd1e1f1a1-0000-0000-0000-000000000001';
set role authenticated;

-- Pembantu: satu sesi Hevy dari CSV.
create function pg_temp.sesi(p_mulai text, p_nama text, p_beban numeric)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('id', 'hevy-csv-x', 'mulai', p_mulai, 'nama', p_nama, 'durasi_menit', 60,
    'latihan', jsonb_build_array(jsonb_build_object('latihan', 'Squat (Barbell)', 'sets', jsonb_build_array(
      jsonb_build_object('set_ke', 1, 'beban_kg', p_beban, 'reps', 5),
      jsonb_build_object('set_ke', 2, 'beban_kg', p_beban, 'reps', 5)))))
$$;

-- --- 1. Hevy CSV: dua potongan, kemajuan & hasil ------------------------------
do $$
declare j public.import_jobs;
begin
  j := public.mulai_impor('hevy_csv', 3, '3 sesi · 6 set · 8–12 September',
                          '[{"baris": 5, "alasan": "tanpa repetisi (kardio atau berdurasi)"}]');
  assert j.status = 'berjalan' and j.selesai = 0, 'job baru seharusnya berjalan dari nol';

  j := public.impor_batch(j.id, jsonb_build_object('sesi', jsonb_build_array(
         pg_temp.sesi('2026-09-08T00:05:00Z', 'Push Day A', 77.5),
         pg_temp.sesi('2026-09-10T11:10:00Z', 'Pull Day A', 135))));
  assert j.selesai = 2, format('kemajuan = %s dari %s, seharusnya 2', j.selesai, j.total);

  j := public.impor_batch(j.id, jsonb_build_object('sesi', jsonb_build_array(
         pg_temp.sesi('2026-09-12T00:30:00Z', 'Leg Day', 95))));
  j := public.selesaikan_impor(j.id);
  assert j.status = 'selesai' and j.selesai = 3 and j.selesai_pada is not null, 'job seharusnya selesai 3 dari 3';
  assert j.hasil = '{"disimpan": 3, "sudah_ada": 0, "dilewati": 0}'::jsonb, format('hasil = %s', j.hasil);

  assert (select count(*) from public.workouts where sumber = 'hevy') = 3, 'tiga sesi Hevy seharusnya tersimpan';
  assert (select count(*) from public.workout_sets) = 6, 'enam set seharusnya tersimpan';
  -- Id diturunkan server dari waktu mulai, bukan dari id sementara parser.
  assert exists (select 1 from public.workouts where external_id = 'csv:2026-09-08T00:05:00Z'),
    'id sesi CSV seharusnya csv:<waktu mulai UTC>';
  assert (select tanggal from public.workouts where external_id = 'csv:2026-09-08T00:05:00Z') = date '2026-09-08',
    'sesi 07.05 WIB seharusnya tercatat 8 September';
end $$;

-- --- 2. Impor ulang berkas yang SAMA: tidak ada yang berganda -----------------
do $$
declare j public.import_jobs;
begin
  j := public.mulai_impor('hevy_csv', 3, '3 sesi · 6 set · 8–12 September');
  j := public.impor_batch(j.id, jsonb_build_object('sesi', jsonb_build_array(
         pg_temp.sesi('2026-09-08T00:05:00Z', 'Push Day A', 77.5),
         pg_temp.sesi('2026-09-10T11:10:00Z', 'Pull Day A', 135),
         pg_temp.sesi('2026-09-12T00:30:00Z', 'Leg Day', 95))));
  j := public.selesaikan_impor(j.id);
  assert (select count(*) from public.workouts where sumber = 'hevy') = 3, 'impor ulang menggandakan sesi';
  assert (select count(*) from public.workout_sets) = 6, 'impor ulang menggandakan set';
end $$;

-- --- 3. Ukuran lama: tanggal yang sudah ada TIDAK ditimpa ---------------------
do $$
declare j public.import_jobs;
begin
  perform public.simpan_ukuran(date '2026-08-25', 85.2);  -- diketik di app
  j := public.mulai_impor('ukuran_lama', 4, '4 tanggal · 4–25 Agustus');
  j := public.impor_batch(j.id, jsonb_build_object('baris', jsonb_build_array(
         jsonb_build_object('tanggal', '2026-08-04', 'pinggang_cm', 86.4, 'dada_cm', 100, 'leher_cm', 38.5),
         jsonb_build_object('tanggal', '2026-08-11', 'pinggang_cm', 86.1),
         jsonb_build_object('tanggal', '2026-08-18', 'pinggang_cm', 850),       -- salah ketik
         jsonb_build_object('tanggal', '2026-08-25', 'pinggang_cm', 85.8))));
  j := public.selesaikan_impor(j.id);
  assert j.hasil = '{"disimpan": 2, "sudah_ada": 1, "dilewati": 1}'::jsonb, format('hasil ukuran = %s', j.hasil);
  assert (select pinggang_cm from public.body_measurements where tanggal = date '2026-08-25') = 85.2,
    'ukuran yang diketik di app tidak boleh ditimpa berkas lama';
  assert (select catatan from public.body_measurements where tanggal = date '2026-08-04') = 'Diimpor dari riwayat',
    'baris impor seharusnya ditandai asalnya';

  -- Impor ulang: semua sudah ada atau tetap dilewati; tidak ada yang berubah.
  j := public.mulai_impor('ukuran_lama', 2, '2 tanggal');
  j := public.impor_batch(j.id, jsonb_build_object('baris', jsonb_build_array(
         jsonb_build_object('tanggal', '2026-08-04', 'pinggang_cm', 99),
         jsonb_build_object('tanggal', '2026-08-11', 'pinggang_cm', 86.1))));
  assert (j.hasil ->> 'sudah_ada')::int = 2, format('impor ulang ukuran = %s', j.hasil);
  assert (select pinggang_cm from public.body_measurements where tanggal = date '2026-08-04') = 86.4,
    'impor ulang tidak boleh mengubah ukuran yang sudah diimpor';
  perform public.selesaikan_impor(j.id);
end $$;

-- --- 4. Satu impor berjalan per sumber; job terbengkalai dilepas -------------
do $$
declare j public.import_jobs; j2 public.import_jobs; v_gagal boolean := false;
begin
  j := public.mulai_impor('ukuran_lama', 10, '10 tanggal');
  begin
    perform public.mulai_impor('ukuran_lama', 10, '10 tanggal');
  exception when object_in_use then v_gagal := true; end;
  assert v_gagal, 'impor kedua untuk sumber yang sama seharusnya ditolak selama yang pertama berjalan';

  -- App ditutup di tengah impor: 11 menit tanpa kemajuan.
  update public.import_jobs set diperbarui_pada = now() - interval '11 minutes' where id = j.id;
  j2 := public.mulai_impor('ukuran_lama', 10, '10 tanggal');
  assert j2.id <> j.id and j2.status = 'berjalan', 'impor baru seharusnya boleh dimulai';
  assert (select status || '/' || galat from public.import_jobs where id = j.id) = 'gagal/Terputus sebelum selesai.',
    'job terbengkalai seharusnya ditandai terputus';

  -- Gagal di tengah: alasannya tersimpan, potongan berikutnya ditolak.
  j2 := public.selesaikan_impor(j2.id, 'Jaringan terputus.');
  assert j2.status = 'gagal' and j2.galat = 'Jaringan terputus.', 'job gagal seharusnya menyimpan alasannya';
  v_gagal := false;
  begin
    perform public.impor_batch(j2.id, '{"baris": []}');
  exception when object_not_in_prerequisite_state then v_gagal := true; end;
  assert v_gagal, 'potongan untuk job yang sudah gagal seharusnya ditolak';

  -- Potongan kebesaran ditolak utuh.
  j := public.mulai_impor('hevy_csv', 200, '200 sesi');
  v_gagal := false;
  begin
    perform public.impor_batch(j.id, jsonb_build_object('sesi',
      (select jsonb_agg(pg_temp.sesi('2026-01-01T00:00:00Z', 'x', 50)) from generate_series(1, 101))));
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'potongan lebih dari 100 sesi seharusnya ditolak';
  perform public.selesaikan_impor(j.id);

  assert (select count(*) from public.impor_terakhir()) = 2, 'impor_terakhir: satu job per sumber';
end $$;

-- --- 5. Sesi API & CSV untuk latihan yang sama ------------------------------------
reset role;
insert into public.health_connections (id, user_id, sumber)
values ('d1e1f1a1-aaaa-0000-0000-000000000001', 'd1e1f1a1-0000-0000-0000-000000000001', 'hevy');
set role service_role;

do $$
begin
  -- Penarikan API membawa sesi 8 September (waktu mulai sama dengan salinan CSV).
  perform public.terima_sesi_hevy('d1e1f1a1-aaaa-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object('id', 'b459cba5-api', 'nama', 'Push Day A', 'mulai', '2026-09-08T00:05:00Z',
      'durasi_menit', 64, 'jenis', 'angkat_beban', 'latihan', jsonb_build_array(jsonb_build_object(
        'latihan', 'Squat (Barbell)', 'sets', jsonb_build_array(jsonb_build_object('set_ke', 1, 'beban_kg', 77.5, 'reps', 5, 'jenis', 'normal')))))),
    '[]'::jsonb, now());
  assert not exists (select 1 from public.workouts where external_id = 'csv:2026-09-08T00:05:00Z'),
    'salinan CSV seharusnya digantikan sesi API';
  assert (select count(*) from public.workouts where sumber = 'hevy' and tanggal = date '2026-09-08') = 1,
    'satu latihan, satu sesi';
end $$;

reset role;
set request.jwt.claim.sub = 'd1e1f1a1-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare j public.import_jobs; v_gagal boolean := false;
begin
  -- Impor CSV lagi SETELAH API: sesi 8 September sudah ada, tidak disalin.
  j := public.mulai_impor('hevy_csv', 1, '1 sesi');
  j := public.impor_batch(j.id, jsonb_build_object('sesi', jsonb_build_array(pg_temp.sesi('2026-09-08T00:05:00Z', 'Push Day A', 77.5))));
  assert j.hasil = '{"disimpan": 0, "sudah_ada": 1, "dilewati": 0}'::jsonb, format('hasil = %s', j.hasil);
  assert not exists (select 1 from public.workouts where external_id = 'csv:2026-09-08T00:05:00Z'),
    'sesi yang sudah masuk lewat API tidak boleh disalin dari berkas';
  perform public.selesaikan_impor(j.id);

  -- Set dari API tetap hanya-baca: tidak bisa dihapus atau ditambah pengguna.
  delete from public.workout_sets s using public.workouts w
   where w.id = s.workout_id and w.external_id = 'b459cba5-api';
  assert exists (select 1 from public.workout_sets s join public.workouts w on w.id = s.workout_id
                  where w.external_id = 'b459cba5-api'), 'set API seharusnya tidak bisa dihapus pengguna';
  begin
    insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, reps)
    select id, 'd1e1f1a1-0000-0000-0000-000000000001', 'Curl', 9, 1, 10 from public.workouts where external_id = 'b459cba5-api';
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna seharusnya tidak bisa menambah set ke sesi API';
end $$;

-- --- 6. Isolasi ----------------------------------------------------------------------
reset role;
-- Id job A diteruskan lewat setelan sesi ke blok milik B.
select set_config('uji.job_a', id::text, false) from public.import_jobs
 where user_id = 'd1e1f1a1-0000-0000-0000-000000000001' order by dibuat_pada desc limit 1;
set request.jwt.claim.sub = 'd2e2f2a2-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare v_gagal boolean := false;
begin
  assert (select count(*) from public.import_jobs) = 0, 'B seharusnya tidak melihat job A';
  assert (select count(*) from public.impor_terakhir()) = 0, 'impor_terakhir B seharusnya kosong';
  begin
    perform public.impor_batch(current_setting('uji.job_a')::uuid, '{"sesi": []}');
  exception when no_data_found then v_gagal := true; end;
  assert v_gagal, 'B seharusnya tidak bisa menulis ke job A';
end $$;

reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.mulai_impor('hevy_csv', 1, 'x');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa memulai impor';
end $$;

reset role;
delete from auth.users where id in ('d1e1f1a1-0000-0000-0000-000000000001', 'd2e2f2a2-0000-0000-0000-000000000002');
