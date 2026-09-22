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
end $$;

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
