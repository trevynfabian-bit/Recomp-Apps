-- =============================================================================
-- Uji auto-deteksi tipe hari dari workout.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('88888888-8888-8888-8888-888888888888', 'hana@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = '88888888-8888-8888-8888-888888888888';

set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
set role authenticated;

-- 1. Tanpa workout → Rest, dasar kosong.
do $$
declare r record;
begin
  select * into r from public.deteksi_tipe_hari(date '2026-09-22');
  assert r.nama = 'Rest', format('tanpa workout seharusnya Rest, bukan %s', r.nama);
  assert cardinality(r.dasar) = 0, format('dasar seharusnya kosong, isinya %s', r.dasar);
end $$;

-- 2. Angkat beban saja → Angkat Beban, dan daily_logs ikut tersetel otomatis.
do $$
declare r record; l public.daily_logs;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values ('88888888-8888-8888-8888-888888888888', date '2026-09-22',
          'Push Day A', 'angkat_beban', 'hevy', 'hevy-1');

  select * into r from public.deteksi_tipe_hari(date '2026-09-22');
  assert r.nama = 'Angkat Beban', format('seharusnya Angkat Beban, bukan %s', r.nama);
  assert cardinality(r.dasar) = 1, format('dasar %s', r.dasar);

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.day_type_id = r.day_type_id, 'daily_logs tidak ikut tersetel';
  assert not l.day_type_override, 'override seharusnya false';
  assert l.target_kalori = 2850, format('target %s, seharusnya 2850', l.target_kalori);
end $$;

-- 3. Tambah lari → Beban+Lari, target ikut naik.
do $$
declare r record; l public.daily_logs;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values ('88888888-8888-8888-8888-888888888888', date '2026-09-22',
          'Lari sore 5K', 'lari', 'strava', 'strava-1');

  select * into r from public.deteksi_tipe_hari(date '2026-09-22');
  assert r.nama = 'Beban+Lari', format('seharusnya Beban+Lari, bukan %s', r.nama);
  assert cardinality(r.dasar) = 2, format('dasar %s', r.dasar);

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.target_kalori = 3100, format('target %s, seharusnya 3100', l.target_kalori);
end $$;

-- 4. Override manual MENANG: workout baru tidak boleh menimpanya.
do $$
declare v_id uuid; l public.daily_logs;
begin
  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Rest';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);

  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values ('88888888-8888-8888-8888-888888888888', date '2026-09-22',
          'Padel malam', 'padel', 'healthkit', 'hk-1');

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.day_type_id = v_id, 'workout baru menimpa pilihan manual pengguna';
  assert l.day_type_override, 'override hilang';
  assert l.target_kalori = 2450, format('target %s, seharusnya tetap 2450', l.target_kalori);
end $$;

-- 5. "Ikuti auto lagi" membuang override dan memulihkan hasil deteksi.
do $$
declare l public.daily_logs;
begin
  select * into l from public.ikuti_auto_deteksi(date '2026-09-22');
  assert not l.day_type_override, 'override seharusnya dibuang';
  assert l.target_kalori = 3100, format('target %s, seharusnya kembali 3100', l.target_kalori);
end $$;

-- 6. Menghapus workout menurunkan deteksi ke tingkat yang sesuai.
do $$
declare r record; l public.daily_logs;
begin
  delete from public.workouts where external_id = 'strava-1';

  select * into r from public.deteksi_tipe_hari(date '2026-09-22');
  assert r.nama = 'Angkat Beban', format('setelah hapus lari: %s', r.nama);

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.target_kalori = 2850, format('target %s, seharusnya turun ke 2850', l.target_kalori);
end $$;

-- 7. Padel saja → Padel.
do $$
declare r record;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values ('88888888-8888-8888-8888-888888888888', date '2026-09-25',
          'Padel pagi', 'padel', 'healthkit', 'hk-2');

  select * into r from public.deteksi_tipe_hari(date '2026-09-25');
  assert r.nama = 'Padel', format('seharusnya Padel, bukan %s', r.nama);
end $$;

-- 8. Jenis "lainnya" saja tidak mengubah apa-apa → tetap Rest.
do $$
declare r record;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values ('88888888-8888-8888-8888-888888888888', date '2026-09-26',
          'Jalan santai', 'lainnya', 'healthkit', 'hk-3');

  select * into r from public.deteksi_tipe_hari(date '2026-09-26');
  assert r.nama = 'Rest', format('jenis lainnya seharusnya tetap Rest, bukan %s', r.nama);
end $$;

-- 9. Tipe hari dengan auto_detect = false tidak boleh jadi hasil tebakan.
do $$
declare r record;
begin
  update public.day_types set auto_detect = false
   where user_id = '88888888-8888-8888-8888-888888888888' and nama = 'Padel';

  select * into r from public.deteksi_tipe_hari(date '2026-09-25');
  assert r.nama = 'Rest',
    format('Padel dimatikan auto-deteksinya, seharusnya jatuh ke Rest, bukan %s', r.nama);

  update public.day_types set auto_detect = true
   where user_id = '88888888-8888-8888-8888-888888888888' and nama = 'Padel';
end $$;

-- 10. Workout pengguna lain tidak mempengaruhi deteksi.
do $$
declare r record;
begin
  select count(*) into strict r from public.workouts
   where user_id <> '88888888-8888-8888-8888-888888888888';
  -- RLS menyembunyikannya; yang penting hasil deteksi tetap benar.
  select * into r from public.deteksi_tipe_hari(date '2026-09-22');
  assert r.nama = 'Angkat Beban', format('deteksi terpengaruh data lain: %s', r.nama);
end $$;

-- 11. Klien TIDAK boleh memanggil terapkan_auto_deteksi langsung: fungsi itu
--     menerima p_user_id, jadi akses langsung berarti bisa menulis ke hari
--     milik orang lain.
do $$
begin
  begin
    perform public.terapkan_auto_deteksi(date '2026-09-22',
      '11111111-1111-1111-1111-111111111111');
    raise exception 'GAGAL: klien bisa memanggil terapkan_auto_deteksi langsung';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

\echo 'Auto-deteksi OK — override manual menang, hapus workout menurunkan deteksi, auto_detect=false dihormati'
