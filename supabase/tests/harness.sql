-- =============================================================================
-- Tiruan minimal bagian Supabase yang dipakai migrasi, HANYA untuk verifikasi
-- lokal di Postgres polos. File ini TIDAK pernah dijalankan di Supabase asli —
-- di sana `auth.users`, `auth.uid()`, dan peran `authenticated` sudah ada.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Tiruan auth.uid(): membaca klaim `sub` dari setelan sesi, sama seperti
-- Supabase membacanya dari JWT.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Peran yang dipakai PostgREST untuk permintaan yang sudah login.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  -- Peran yang dipakai kunci service role. Di Supabase ia melewati RLS; di sini
  -- ditiru supaya uji fungsi berhak tinggi menguji hal yang sama.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated;

-- Supabase memberi hak tabel ke `anon` dan `authenticated` lewat default
-- privileges SAAT tabel dibuat. Ditiru di sini supaya urutannya sama dengan
-- produksi: hak masuk saat migrasi skema berjalan, lalu migrasi pengerasan
-- mencabutnya. Tanpa ini, uji pencabutan anon tidak menguji apa pun.
alter default privileges in schema public
  grant all on tables to authenticated, anon;
alter default privileges in schema public
  grant all on sequences to authenticated, anon;

-- Supabase juga memberi EXECUTE atas setiap FUNGSI baru kepada anon,
-- authenticated, dan service_role LANGSUNG — bukan lewat PUBLIC. Akibatnya
-- `revoke all on function ... from public` TIDAK mencabut hak anon di produksi.
-- Tanpa baris ini, uji "anon tidak boleh menjalankan X" akan lulus di sini dan
-- tidak berarti apa-apa di Supabase sungguhan.
alter default privileges in schema public
  grant execute on functions to authenticated, anon, service_role;
grant usage on schema public to service_role;
