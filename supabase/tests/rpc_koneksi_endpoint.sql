-- =============================================================================
-- Uji endpoint koneksi: simpan_koneksi_sumber (service role) & putuskan_sumber.
--
-- Yang dijaga: koneksi & rahasianya lahir bersama, bentuk rahasia sesuai
-- sumbernya, satu akun luar tidak bisa terhubung ke dua pengguna, pengguna
-- tidak bisa menyambung sendiri (token harus lewat server), memutus menghapus
-- rahasia dan (bila diminta) data sumber itu SAJA, dan semuanya per pengguna.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('c0c0c0c0-0000-0000-0000-00000000000a', 'koneksi-a@contoh.test'),
  ('c0c0c0c0-0000-0000-0000-00000000000b', 'koneksi-b@contoh.test');

-- 1. Jalur server menyambungkan WHOOP (OAuth) dan Hevy (kunci API), atomik.
set role service_role;
do $$
declare k public.health_connections; n integer;
begin
  k := public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000a', 'whoop', 'whoop-111',
         'akses-1', 'segar-1', now() + interval '1 hour', array['read:workout'], null);
  assert k.status = 'terhubung' and k.akun_eksternal = 'whoop-111', format('koneksi whoop %s', k);
  select count(*) into n from public.health_connection_secrets where connection_id = k.id and access_token = 'akses-1';
  assert n = 1, 'rahasia whoop tidak tersimpan bersama koneksinya';

  -- Menyambung ulang memperbarui, tidak menggandakan.
  k := public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000a', 'whoop', 'whoop-111',
         'akses-2', 'segar-2', now() + interval '1 hour', null, null);
  select count(*) into n from public.health_connections where user_id = 'c0c0c0c0-0000-0000-0000-00000000000a' and sumber = 'whoop';
  assert n = 1, format('%s koneksi whoop, seharusnya 1', n);
  assert (select access_token from public.health_connection_secrets where connection_id = k.id) = 'akses-2', 'token tidak diperbarui';

  k := public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000a', 'hevy', null, null, null, null, null, 'kunci-hevy');
  assert (select kunci_api from public.health_connection_secrets where connection_id = k.id) = 'kunci-hevy', 'kunci hevy tidak tersimpan';
end $$;

-- 2. Bentuk rahasia harus sesuai sumbernya; Apple Health tidak lewat jalur ini.
do $$
declare v text;
begin
  v := null; begin perform public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000b', 'hevy', null, 'token', null, null, null, 'kunci');
  exception when others then v := sqlstate; end;
  assert v = '22023', format('hevy dengan token OAuth: %s', v);
  v := null; begin perform public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000b', 'strava', null, 'token', 'segar', now(), null, null);
  exception when others then v := sqlstate; end;
  assert v = '22023', format('strava tanpa id akun: %s', v);
  v := null; begin perform public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000b', 'apple_health', null, null, null, null, null, null);
  exception when others then v := sqlstate; end;
  assert v = '22023', format('apple_health lewat jalur server: %s', v);
end $$;

-- 3. Satu akun WHOOP tidak bisa terhubung ke dua pengguna Recomp.
do $$
declare v text;
begin
  begin perform public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000b', 'whoop', 'whoop-111',
          'akses-b', 'segar-b', now() + interval '1 hour', null, null);
  exception when others then v := sqlstate; end;
  assert v = '23505', format('akun whoop yang sama untuk pengguna lain: %s', v);
end $$;

-- Data dari beberapa sumber untuk A dan B, supaya penghapusan bisa diperiksa.
-- (Data hanya diterima dari sumber yang terhubung, jadi Apple Health disambung dulu.)
reset role;
insert into public.health_connections (user_id, sumber, status) values
  ('c0c0c0c0-0000-0000-0000-00000000000a', 'apple_health', 'terhubung'),
  ('c0c0c0c0-0000-0000-0000-00000000000b', 'apple_health', 'terhubung');
insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai) values
  ('c0c0c0c0-0000-0000-0000-00000000000a', 'whoop', 'w-1', 'kalori_aktif', 300, now() - interval '1 day'),
  ('c0c0c0c0-0000-0000-0000-00000000000a', 'whoop', 'w-2', 'kalori_aktif', 250, now() - interval '2 day'),
  ('c0c0c0c0-0000-0000-0000-00000000000a', 'apple_health', 'a-1', 'langkah', 8000, now() - interval '1 day'),
  ('c0c0c0c0-0000-0000-0000-00000000000b', 'apple_health', 'a-1', 'langkah', 9000, now() - interval '1 day');
insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id) values
  ('c0c0c0c0-0000-0000-0000-00000000000a', current_date - 1, 'Lari', 'lari', 'whoop', 'wk-1'),
  ('c0c0c0c0-0000-0000-0000-00000000000a', current_date - 1, 'Push', 'angkat_beban', 'hevy', 'hv-1');

-- 4. Pengguna tidak bisa menyambung sendiri, dan tidak melihat rahasia.
set request.jwt.claim.sub = 'c0c0c0c0-0000-0000-0000-00000000000a';
set role authenticated;
do $$
declare v_ditolak boolean := false;
begin
  begin perform public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000a', 'hevy', null, null, null, null, null, 'curang');
  exception when insufficient_privilege then v_ditolak := true; end;
  assert v_ditolak, 'pengguna bisa memanggil simpan_koneksi_sumber';
end $$;

-- 5. Memutus WHOOP dengan hapus data: rahasia hilang, data & latihan WHOOP milik A
--    terhapus; data Apple Health A, latihan Hevy A, dan data WHOOP B utuh.
do $$
declare r jsonb;
begin
  r := public.putuskan_sumber('whoop', true);
  assert r->>'status' = 'terputus' and r->>'diputus_pada' is not null, format('hasil putus %s', r);
  assert (r->>'data_dihapus')::int = 2 and (r->>'latihan_dihapus')::int = 1, format('jumlah dihapus %s', r);
  assert (select count(*) from public.health_data where sumber = 'apple_health') = 1, 'data Apple Health ikut terhapus';
  assert (select count(*) from public.workouts where sumber = 'hevy') = 1, 'latihan Hevy ikut terhapus';
end $$;

reset role;
do $$
begin
  assert not exists (select 1 from public.health_connection_secrets s join public.health_connections c on c.id = s.connection_id
                      where c.user_id = 'c0c0c0c0-0000-0000-0000-00000000000a' and c.sumber = 'whoop'), 'rahasia whoop tidak terhapus saat putus';
  assert (select count(*) from public.health_data where user_id = 'c0c0c0c0-0000-0000-0000-00000000000b') = 1, 'data B ikut terhapus';
  assert exists (select 1 from public.health_connection_secrets s join public.health_connections c on c.id = s.connection_id
                  where c.user_id = 'c0c0c0c0-0000-0000-0000-00000000000a' and c.sumber = 'hevy'), 'rahasia hevy ikut terhapus';
end $$;

-- 6. Setelah A memutus, akun WHOOP itu boleh dipakai B.
set role service_role;
do $$
declare k public.health_connections;
begin
  k := public.simpan_koneksi_sumber('c0c0c0c0-0000-0000-0000-00000000000b', 'whoop', 'whoop-111',
         'akses-b', 'segar-b', now() + interval '1 hour', null, null);
  assert k.status = 'terhubung', 'B tidak bisa menyambung akun yang sudah dilepas A';
end $$;

-- 7. Memutus tanpa hapus data: data tetap; sumber yang belum pernah disambung ditolak.
reset role;
set request.jwt.claim.sub = 'c0c0c0c0-0000-0000-0000-00000000000b';
set role authenticated;
do $$
declare r jsonb; v text;
begin
  r := public.putuskan_sumber('whoop');
  assert (r->>'data_dihapus')::int = 0 and (select count(*) from public.health_data) = 1, format('putus tanpa hapus %s', r);
  begin perform public.putuskan_sumber('strava'); exception when others then v := sqlstate; end;
  assert v = 'P0002', format('sumber yang belum disambung: %s', v);
  v := null;
  begin perform public.putuskan_sumber('fitbit'); exception when others then v := sqlstate; end;
  assert v = '22023', format('sumber tak dikenal: %s', v);
end $$;

-- 8. Tanpa sesi ditolak; anon tidak punya hak eksekusi.
set request.jwt.claim.sub = '';
do $$
declare v text;
begin
  begin perform public.putuskan_sumber('whoop'); exception when others then v := sqlstate; end;
  assert v = '28000', format('tanpa sesi: %s', v);
end $$;
reset role;
set role anon;
do $$
declare v_ditolak boolean := false;
begin
  begin perform public.putuskan_sumber('whoop'); exception when insufficient_privilege then v_ditolak := true; end;
  assert v_ditolak, 'anon bisa memanggil putuskan_sumber';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('c0c0c0c0-0000-0000-0000-00000000000a', 'c0c0c0c0-0000-0000-0000-00000000000b');
select '✓ koneksi: sambung atomik lewat server, satu akun luar satu pengguna, putus menghapus rahasia & data sumbernya saja' as hasil;
