-- =============================================================================
-- Uji endpoint status akun.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, created_at, email_confirmed_at)
values
  ('5ac0ac00-0000-0000-0000-00000000000a', 'akun-a@contoh.test', timestamptz '2026-08-02 09:00+07', timestamptz '2026-08-02 09:05+07'),
  ('5ac0ac00-0000-0000-0000-00000000000b', 'akun-b@contoh.test', timestamptz '2026-09-01 09:00+07', null);
insert into public.health_connections (user_id, sumber, status) values
  ('5ac0ac00-0000-0000-0000-00000000000a', 'apple_health', 'terhubung');

set request.jwt.claim.sub = '5ac0ac00-0000-0000-0000-00000000000a';
set role authenticated;

-- 1. Fakta auth.users milik sendiri + kesimpulan dari tabel app.
do $$
declare s jsonb;
begin
  s := public.status_akun_saya();
  assert s->>'email' = 'akun-a@contoh.test' and (s->>'email_terkonfirmasi')::boolean, format('akun %s', s);
  assert (s->>'bergabung_pada')::timestamptz = timestamptz '2026-08-02 09:00+07', format('bergabung %s', s->>'bergabung_pada');
  assert (s->'profil'->>'ada')::boolean and not (s->'profil'->>'lengkap')::boolean, format('profil %s', s->'profil');
  assert (s->>'data_awal_siap')::boolean, 'pengguna baru seharusnya sudah punya tipe hari';
  assert s->'sumber_terhubung' = '["apple_health"]'::jsonb, format('sumber %s', s->'sumber_terhubung');
end $$;

-- 2. Profil lengkap setelah tinggi & jenis kelamin diisi.
update public.profiles set tinggi_cm = 176, jenis_kelamin = 'pria' where user_id = '5ac0ac00-0000-0000-0000-00000000000a';
do $$
begin
  assert (public.status_akun_saya()->'profil'->>'lengkap')::boolean, 'profil seharusnya lengkap';
end $$;

-- 3. B hanya melihat akunnya sendiri (belum terkonfirmasi, tanpa sumber).
set request.jwt.claim.sub = '5ac0ac00-0000-0000-0000-00000000000b';
do $$
declare s jsonb;
begin
  s := public.status_akun_saya();
  assert s->>'email' = 'akun-b@contoh.test' and not (s->>'email_terkonfirmasi')::boolean
     and s->'sumber_terhubung' = '[]'::jsonb, format('akun B %s', s);
  -- auth.users tetap tidak terbaca langsung.
  begin
    perform 1 from auth.users;
    raise exception 'auth.users terbaca pengguna';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Tanpa sesi ditolak; anon tidak punya hak.
set request.jwt.claim.sub = '';
do $$
declare v text;
begin
  begin perform public.status_akun_saya(); exception when others then v := sqlstate; end;
  assert v = '28000', format('tanpa sesi: %s', v);
end $$;
reset role;
set role anon;
do $$
declare v boolean := false;
begin
  begin perform public.status_akun_saya(); exception when insufficient_privilege then v := true; end;
  assert v, 'anon bisa memanggil status_akun_saya';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('5ac0ac00-0000-0000-0000-00000000000a', '5ac0ac00-0000-0000-0000-00000000000b');
select '✓ status akun: fakta akun milik sendiri dari auth.users, profil lengkap, data awal, sumber terhubung, isolasi & hak akses' as hasil;
