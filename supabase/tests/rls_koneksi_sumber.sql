-- =============================================================================
-- Uji skema & RLS koneksi sumber data (health_connections + rahasianya).
--
-- Tiga jaminan yang diuji:
--   1. Token & kunci tidak pernah terbaca klien — diuji sebagai ATURAN katalog
--      atas semua tabel publik, bukan hanya tabel yang ditulis hari ini.
--   2. Klien hanya menulis baris Apple Health miliknya; status sumber
--      ber-token (Strava, WHOOP, Hevy) hanya ditulis server.
--   3. Memutus koneksi menghapus tokennya, dan webhook satu akun luar tidak
--      bisa terarah ke dua pengguna sekaligus.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('cccc1111-0000-0000-0000-000000000001', 'koneksi-a@contoh.test'),
  ('cccc2222-0000-0000-0000-000000000002', 'koneksi-b@contoh.test');

-- --- 1. Aturan katalog: kolom rahasia tidak terbaca klien -------------------
create function pg_temp.rahasia_terbuka()
returns table (tabel text, kolom text, peran text)
language sql
stable
as $$
  select c.table_name::text, c.column_name::text, r.peran
    from information_schema.columns c
   cross join (values ('anon'), ('authenticated')) as r (peran)
   where c.table_schema = 'public'
     and c.column_name ~ '(token|kunci_api|rahasia|secret)'
     and has_column_privilege(r.peran, format('public.%I', c.table_name), c.column_name, 'select')
$$;

do $$
declare r record; n int := 0;
begin
  for r in select * from pg_temp.rahasia_terbuka() loop
    raise warning '%.% terbaca oleh %', r.tabel, r.kolom, r.peran;
    n := n + 1;
  end loop;
  assert n = 0, format('%s kolom rahasia terbaca klien (lihat peringatan di atas)', n);
end $$;

-- Kontrol negatif: tabel baru berisi token, dengan hak bawaan Supabase,
-- HARUS tertangkap aturan di atas. Tanpa ini, aturan yang tidak pernah
-- menemukan apa pun tidak bisa dibedakan dari aturan yang rusak.
create table public.uji_bocor_rahasia (id int primary key, refresh_token text);
do $$
begin
  assert (select count(*) from pg_temp.rahasia_terbuka() where tabel = 'uji_bocor_rahasia') = 2,
    'aturan katalog tidak menangkap tabel token yang terbuka untuk anon & authenticated';
end $$;
drop table public.uji_bocor_rahasia;

-- --- 2. Perangkat menulis Apple Health miliknya ------------------------------
set request.jwt.claim.sub = 'cccc1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v record;
begin
  insert into public.health_connections (user_id, sumber, sinkron_terakhir)
  values ('cccc1111-0000-0000-0000-000000000001', 'apple_health', now() - interval '10 minutes')
  returning * into v;

  assert v.mekanisme = 'healthkit', 'mekanisme Apple Health seharusnya healthkit';
  assert v.status = 'terhubung' and v.diputus_pada is null, 'koneksi baru seharusnya terhubung';
end $$;

-- Mekanisme diturunkan, tidak bisa ditulis.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.health_connections set mekanisme = 'cron' where sumber = 'apple_health';
  exception when generated_always or feature_not_supported or syntax_error_or_access_rule_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'mekanisme seharusnya tidak bisa ditulis';
end $$;

-- Klien TIDAK boleh menandai sumber ber-token sebagai terhubung.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_connections (user_id, sumber, akun_eksternal)
    values ('cccc1111-0000-0000-0000-000000000001', 'strava', '9001');
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'klien seharusnya tidak bisa membuat koneksi Strava sendiri';
end $$;

-- Klien tidak boleh membuat koneksi untuk orang lain.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_connections (user_id, sumber)
    values ('cccc2222-0000-0000-0000-000000000002', 'apple_health');
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'klien seharusnya tidak bisa membuat koneksi atas nama orang lain';
end $$;

-- Baris Apple Health tidak bisa "disulap" menjadi Strava.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.health_connections set sumber = 'strava' where sumber = 'apple_health';
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'baris Apple Health seharusnya tidak bisa diubah menjadi sumber lain';
end $$;

-- Satu baris per sumber per pengguna.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_connections (user_id, sumber)
    values ('cccc1111-0000-0000-0000-000000000001', 'apple_health');
  exception when unique_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'dua koneksi Apple Health untuk satu pengguna seharusnya ditolak';
end $$;

-- Tanpa DELETE untuk klien: memutus adalah status, bukan penghapusan.
do $$
declare v_gagal boolean := false;
begin
  begin
    delete from public.health_connections where sumber = 'apple_health';
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'klien seharusnya tidak bisa menghapus baris koneksi';
end $$;

-- Perangkat memutus Apple Health: waktu putus diisi database, dan pemicu
-- rahasia TIDAK berjalan (klien tidak punya hak atas tabel rahasia — bila
-- pemicunya berjalan, pembaruan ini gagal dengan permission denied).
do $$
declare v record;
begin
  update public.health_connections set status = 'terputus' where sumber = 'apple_health'
  returning * into v;
  assert v.diputus_pada is not null, 'diputus_pada seharusnya diisi pemicu';

  update public.health_connections set status = 'terhubung' where sumber = 'apple_health'
  returning * into v;
  assert v.diputus_pada is null, 'diputus_pada seharusnya dikosongkan saat tersambung lagi';
  assert v.terhubung_pada > now() - interval '1 minute', 'terhubung_pada seharusnya diperbarui saat tersambung lagi';
end $$;

-- --- 3. Server menulis sumber ber-token --------------------------------------
reset role;
set role service_role;

do $$
declare v_strava uuid; v_hevy uuid;
begin
  insert into public.health_connections (user_id, sumber, akun_eksternal, sinkron_terakhir)
  values ('cccc1111-0000-0000-0000-000000000001', 'strava', '9001', now() - interval '2 days')
  returning id into v_strava;
  insert into public.health_connection_secrets (connection_id, access_token, refresh_token, kedaluwarsa_pada, cakupan)
  values (v_strava, 'uji-akses-a', 'uji-segar-a', now() + interval '6 hours', '{activity:read_all}');

  insert into public.health_connections (user_id, sumber)
  values ('cccc1111-0000-0000-0000-000000000001', 'hevy')
  returning id into v_hevy;
  insert into public.health_connection_secrets (connection_id, kunci_api)
  values (v_hevy, 'uji-kunci-hevy');

  assert (select mekanisme from public.health_connections where id = v_strava) = 'webhook',
    'mekanisme Strava seharusnya webhook';
  assert (select mekanisme from public.health_connections where id = v_hevy) = 'cron',
    'mekanisme Hevy seharusnya cron';
end $$;

-- Rahasia tanpa isi, atau OAuth bercampur kunci API, ditolak.
do $$
declare v_id uuid; v_gagal boolean;
begin
  select id into v_id from public.health_connections where sumber = 'strava';
  v_gagal := false;
  begin
    update public.health_connection_secrets set access_token = null where connection_id = v_id;
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'baris rahasia tanpa token maupun kunci seharusnya ditolak';

  v_gagal := false;
  begin
    update public.health_connection_secrets set kunci_api = 'campur' where connection_id = v_id;
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'token OAuth dan kunci API dalam satu koneksi seharusnya ditolak';
end $$;

-- Akun eksternal hanya untuk sumber webhook.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.health_connections set akun_eksternal = 'x' where sumber = 'hevy';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'Hevy seharusnya tidak punya akun eksternal';
end $$;

-- Satu akun Strava tidak bisa terhubung ke dua pengguna sekaligus.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_connections (user_id, sumber, akun_eksternal)
    values ('cccc2222-0000-0000-0000-000000000002', 'strava', '9001');
  exception when unique_violation then v_gagal := true; end;
  assert v_gagal, 'akun Strava yang sama seharusnya tidak bisa terhubung ke dua pengguna';
end $$;

-- --- 4. Pemilik membaca statusnya, tidak pernah tokennya ---------------------
reset role;
set request.jwt.claim.sub = 'cccc1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v_gagal boolean := false;
begin
  assert (select count(*) from public.health_connections) = 3,
    'pemilik seharusnya melihat ketiga koneksinya';

  begin
    perform 1 from public.health_connection_secrets;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pemilik seharusnya tidak bisa membaca tabel rahasia, bahkan miliknya sendiri';

  -- Pembaruan status Strava oleh klien tidak menyentuh baris apa pun.
  update public.health_connections set status = 'terputus' where sumber = 'strava';
  assert (select status from public.health_connections where sumber = 'strava') = 'terhubung',
    'klien seharusnya tidak bisa mengubah status Strava';
end $$;

-- Pengguna lain tidak melihat apa pun.
reset role;
set request.jwt.claim.sub = 'cccc2222-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  assert (select count(*) from public.health_connections) = 0,
    'pengguna lain seharusnya tidak melihat koneksi siapa pun';
end $$;

-- anon tidak punya hak sama sekali.
reset role;
reset request.jwt.claim.sub;
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform 1 from public.health_connections;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa membaca koneksi';
end $$;

-- --- 5. Memutus menghapus token; akun luar bebas dipakai lagi ---------------
reset role;
set role service_role;

do $$
declare v_id uuid; v record;
begin
  select id into v_id from public.health_connections
   where user_id = 'cccc1111-0000-0000-0000-000000000001' and sumber = 'strava';

  update public.health_connections set status = 'terputus' where id = v_id returning * into v;
  assert v.diputus_pada is not null, 'diputus_pada seharusnya diisi';
  assert not exists (select 1 from public.health_connection_secrets where connection_id = v_id),
    'token Strava seharusnya terhapus saat koneksi diputus';
  assert exists (select 1 from public.health_connections where id = v_id),
    'baris koneksi seharusnya tetap ada setelah diputus';

  -- Pembaruan lain pada koneksi yang sudah putus tidak menggeser waktu putusnya.
  update public.health_connections set status = 'terputus', galat_terakhir = 'Izin dicabut dari Strava.', galat_pada = now()
   where id = v_id;
  assert (select diputus_pada from public.health_connections where id = v_id) = v.diputus_pada,
    'waktu putus seharusnya tidak bergeser oleh pembaruan berikutnya';

  -- Kunci Hevy tidak ikut terhapus: hanya koneksi yang diputus.
  assert exists (select 1 from public.health_connection_secrets s
                   join public.health_connections c on c.id = s.connection_id
                  where c.sumber = 'hevy'),
    'kunci Hevy seharusnya tidak tersentuh';

  -- Setelah pemilik lama memutus, akun Strava itu boleh dipakai pengguna lain.
  insert into public.health_connections (user_id, sumber, akun_eksternal)
  values ('cccc2222-0000-0000-0000-000000000002', 'strava', '9001');
end $$;

-- Galat tanpa waktu, atau berupa tumpukan galat panjang, ditolak.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    update public.health_connections set galat_terakhir = 'Token kedaluwarsa.', galat_pada = null
     where sumber = 'hevy';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'galat tanpa waktu seharusnya ditolak';

  v_gagal := false;
  begin
    update public.health_connections set galat_terakhir = repeat('x', 301), galat_pada = now()
     where sumber = 'hevy';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'galat lebih dari 300 karakter seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.health_connections (user_id, sumber)
    values ('cccc2222-0000-0000-0000-000000000002', 'fitbit');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'sumber yang tidak dikenal seharusnya ditolak';
end $$;

-- --- 6. Akun dihapus: koneksi dan tokennya ikut hilang ----------------------
reset role;

do $$
begin
  delete from auth.users where id = 'cccc1111-0000-0000-0000-000000000001';
  assert not exists (select 1 from public.health_connections
                      where user_id = 'cccc1111-0000-0000-0000-000000000001'),
    'koneksi seharusnya terhapus bersama akun';
  assert not exists (select 1 from public.health_connection_secrets s
                      where not exists (select 1 from public.health_connections c where c.id = s.connection_id)),
    'rahasia yatim seharusnya tidak ada';
end $$;

delete from auth.users where id = 'cccc2222-0000-0000-0000-000000000002';
