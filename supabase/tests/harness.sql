-- =============================================================================
-- Tiruan minimal bagian Supabase yang dipakai migrasi, HANYA untuk verifikasi
-- lokal di Postgres polos. File ini TIDAK pernah dijalankan di Supabase asli —
-- di sana `auth.users`, `auth.uid()`, dan peran `authenticated` sudah ada.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  -- Kolom Supabase Auth yang dibaca fungsi app (mis. status_akun_saya).
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
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

-- Kunci service role di Supabase membawa hak penuh atas tabel publik (dan
-- melewati RLS). Ditiru supaya jalur terjadwal yang berjalan sebagai
-- service_role diuji dengan hak yang sama seperti di produksi — tidak lebih.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
grant usage on schema auth to service_role;

-- Supabase membuat publikasi `supabase_realtime` (kosong) di setiap proyek;
-- migrasi Realtime menambahkan tabel ke sana. Ditiru supaya migrasi itu dan
-- uji katalognya berjalan di sini persis seperti di produksi.
-- (Postgres uji memakai wal_level=replica; peringatannya tidak relevan di sini.)
set client_min_messages = error;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
reset client_min_messages;
