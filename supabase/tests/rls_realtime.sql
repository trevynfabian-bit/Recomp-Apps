-- =============================================================================
-- Uji Realtime: isi publikasi sebagai ATURAN katalog, dan snapshot_hari_ini.
--
-- Realtime mengirim perubahan ke setiap perangkat yang berlangganan, dengan
-- RLS sebagai satu-satunya penyaring. Jadi aturannya diuji atas SEMUA tabel
-- di publikasi, bukan tabel yang kebetulan ditambahkan hari ini:
--   1. setiap tabel yang dipublikasikan mengaktifkan RLS dan punya kebijakan
--      SELECT yang menyebut auth.uid();
--   2. tidak ada kolom token/kunci di tabel yang dipublikasikan;
--   3. health_data (volume) dan health_connection_secrets tidak pernah ada.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

create function pg_temp.pelanggaran_realtime()
returns table (tabel text, masalah text)
language sql
stable
as $$
  with terbit as (
    select c.oid, c.relname::text as nama, c.relrowsecurity
      from pg_publication_tables p
      join pg_class c on c.relname = p.tablename
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
     where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
  )
  select nama, 'RLS tidak aktif' from terbit where not relrowsecurity
  union all
  select t.nama, 'tanpa kebijakan SELECT per pengguna'
    from terbit t
   where not exists (
     select 1 from pg_policies pol
      where pol.schemaname = 'public' and pol.tablename = t.nama
        and pol.cmd in ('SELECT', 'ALL') and pol.qual like '%auth.uid()%')
  union all
  select t.nama, 'memuat kolom rahasia ' || a.attname
    from terbit t
    join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
   where a.attname ~ '(token|kunci_api|rahasia|secret)'
  union all
  select nama, 'tidak boleh dipublikasikan'
    from terbit where nama in ('health_data', 'health_connection_secrets')
$$;

-- 1. Keadaan setelah semua migrasi: bersih, dan tabel yang dijanjikan ada.
do $$
declare r record; n int := 0;
begin
  for r in select * from pg_temp.pelanggaran_realtime() loop
    raise warning '% — %', r.tabel, r.masalah;
    n := n + 1;
  end loop;
  assert n = 0, format('%s pelanggaran aturan Realtime (lihat peringatan di atas)', n);
  assert (select array_agg(tablename::text order by tablename) from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public')
         @> array['daily_logs', 'health_connections', 'import_jobs', 'workouts'],
    'tabel denyut Realtime seharusnya dipublikasikan';
end $$;

-- 2. Kontrol negatif: tiga cara melanggar, masing-masing harus tertangkap.
create table public.uji_realtime_bocor (id int primary key, user_id uuid, refresh_token text);
alter publication supabase_realtime add table public.uji_realtime_bocor;
alter publication supabase_realtime add table public.health_data;
do $$
declare v text[];
begin
  select array_agg(tabel || ': ' || masalah order by tabel, masalah) into v from pg_temp.pelanggaran_realtime();
  assert v @> array['uji_realtime_bocor: RLS tidak aktif',
                    'uji_realtime_bocor: tanpa kebijakan SELECT per pengguna',
                    'uji_realtime_bocor: memuat kolom rahasia refresh_token',
                    'health_data: tidak boleh dipublikasikan'],
    format('kontrol: pelanggaran yang tertangkap = %s', v);
end $$;
alter publication supabase_realtime drop table public.health_data;
alter publication supabase_realtime drop table public.uji_realtime_bocor;
drop table public.uji_realtime_bocor;

-- 3. snapshot_hari_ini --------------------------------------------------------------
insert into auth.users (id, email)
values
  ('e1f1a1b1-0000-0000-0000-000000000001', 'rt-a@contoh.test'),
  ('e2f2a2b2-0000-0000-0000-000000000002', 'rt-b@contoh.test');
insert into public.health_connections (user_id, sumber, akun_eksternal)
values
  ('e1f1a1b1-0000-0000-0000-000000000001', 'apple_health', null),
  ('e1f1a1b1-0000-0000-0000-000000000001', 'strava', 'rt-s');

set role service_role;
do $$
declare
  t text := ((now() at time zone 'Asia/Jakarta')::date)::text;
  a text := ((now() at time zone 'Asia/Jakarta')::date)::text || 'T00:00:00+07:00';
  b text := ((now() at time zone 'Asia/Jakarta')::date + 1)::text || 'T00:00:00+07:00';
begin
  insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values
    ('e1f1a1b1-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.iphone', 'total:' || t, 'langkah', 7000, a::timestamptz, b::timestamptz),
    ('e1f1a1b1-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'total:' || t, 'langkah', 8800, a::timestamptz, b::timestamptz),
    ('e1f1a1b1-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'total:' || t, 'kalori_aktif', 620, a::timestamptz, b::timestamptz),
    ('e1f1a1b1-0000-0000-0000-000000000001', 'strava', null, 'rt-act', 'kalori_aktif', 450, a::timestamptz + interval '6 hours', null);
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, waktu_mulai)
  values ('e1f1a1b1-0000-0000-0000-000000000001', t::date, 'Morning Run', 'lari', 'strava', 'rt-act', a::timestamptz + interval '6 hours');
end $$;

reset role;
set request.jwt.claim.sub = 'e1f1a1b1-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare s jsonb;
begin
  perform public.simpan_berat_pagi((now() at time zone 'Asia/Jakarta')::date, 74.2);
  s := public.snapshot_hari_ini();
  -- Dihitung: langkah Watch (8.800, bukan 15.800), energi Apple Health (620, bukan 1.070).
  assert s -> 'dihitung' = '{"langkah": 8800, "kalori_aktif": 620, "latihan": 1, "berat": 74.2}'::jsonb,
    format('dihitung = %s', s -> 'dihitung');
  assert s -> 'per_sumber' -> 'apple_health' = '{"langkah": 8800, "kalori_aktif": 620}'::jsonb,
    format('per sumber Apple Health = %s (berat manual bukan dari Apple Health)', s -> 'per_sumber' -> 'apple_health');
  assert s -> 'per_sumber' -> 'strava' = '{"kalori_aktif": 450, "latihan": 1}'::jsonb,
    format('per sumber Strava = %s', s -> 'per_sumber' -> 'strava');
  assert not (s -> 'dihitung' ? 'tidur'), 'jenis tanpa data dihilangkan, bukan nol';
end $$;

reset role;
set request.jwt.claim.sub = 'e2f2a2b2-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare v_gagal boolean := false;
begin
  assert public.snapshot_hari_ini() -> 'per_sumber' = '{}'::jsonb, 'snapshot B seharusnya kosong';
  begin
    perform public.snapshot_hari_ini(null, 'e1f1a1b1-0000-0000-0000-000000000001');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'B seharusnya tidak bisa meminta snapshot A';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('e1f1a1b1-0000-0000-0000-000000000001', 'e2f2a2b2-0000-0000-0000-000000000002');
