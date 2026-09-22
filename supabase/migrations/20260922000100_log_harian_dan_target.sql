-- =============================================================================
-- Recomp Coach — skema Log Harian & Target
--
-- Dijalankan di proyek Supabase yang SUDAH ADA (dipakai bersama web Next.js),
-- jadi setiap objek dibuat dengan IF NOT EXISTS dan kolom `profiles` ditambahkan
-- lewat ALTER ... ADD COLUMN IF NOT EXISTS. Migrasi ini aman dijalankan ulang.
--
-- Semua tabel memakai RLS dengan aturan tunggal: satu baris hanya bisa diakses
-- pemiliknya (`user_id = auth.uid()`). Data kesehatan bersifat sensitif, jadi
-- tidak ada kebijakan baca lintas pengguna sama sekali.
--
-- Tanggal disimpan sebagai DATE yang SUDAH dinormalisasi ke Asia/Jakarta oleh
-- pemanggil. Kolom timestamptz tetap UTC seperti biasa.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Prasyarat
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Nilai fase program dipakai di beberapa tabel; domain menjaga ejaannya seragam.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fase_program') then
    create type public.fase_program as enum ('Maintenance', 'Lean Gain', 'Cut');
  end if;
end $$;

-- Pembeda data mentah (manual/healthkit) untuk berat pagi.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sumber_berat') then
    create type public.sumber_berat as enum ('manual', 'healthkit');
  end if;
end $$;

-- Pembeda data mentah vs estimasi untuk entri makanan.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sumber_makanan') then
    create type public.sumber_makanan as enum ('manual', 'foto_ai');
  end if;
end $$;

-- Trigger `updated_at` dipakai ulang oleh beberapa tabel di bawah.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — mungkin sudah ada dari web; hanya kolom yang kurang yang ditambah
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists nama text;
alter table public.profiles add column if not exists satuan text not null default 'metrik';
alter table public.profiles add column if not exists fase_aktif public.fase_program not null default 'Maintenance';
-- tinggi_cm & jenis_kelamin dibutuhkan rumus body fat Navy (Fase 2).
alter table public.profiles add column if not exists tinggi_cm numeric(5, 1);
alter table public.profiles add column if not exists jenis_kelamin text;
alter table public.profiles add column if not exists batas_pinggang_cm numeric(5, 1);
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_satuan_check') then
    alter table public.profiles
      add constraint profiles_satuan_check check (satuan in ('metrik', 'imperial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_jenis_kelamin_check') then
    alter table public.profiles
      add constraint profiles_jenis_kelamin_check
      check (jenis_kelamin is null or jenis_kelamin in ('pria', 'wanita'));
  end if;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- day_types — konfigurasi tipe hari. TIDAK ada faktor pengali di sini;
-- targetnya hidup di day_type_targets sebagai nilai absolut.
-- ---------------------------------------------------------------------------
create table if not exists public.day_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nama text not null,
  -- Boleh dipakai sebagai hasil auto-deteksi dari workout.
  auto_detect boolean not null default true,
  is_default boolean not null default false,
  -- Urutan tampil di pemilih tipe hari.
  urutan smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint day_types_nama_unik unique (user_id, nama)
);

create index if not exists day_types_user_idx on public.day_types (user_id, urutan);

-- ---------------------------------------------------------------------------
-- day_type_targets — target ABSOLUT per (tipe hari x fase)
-- ---------------------------------------------------------------------------
create table if not exists public.day_type_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_type_id uuid not null references public.day_types (id) on delete cascade,
  fase public.fase_program not null,
  target_kalori integer not null,
  target_protein_g numeric(6, 1) not null,
  target_lemak_g numeric(6, 1) not null,
  -- Batas atas, bukan sasaran yang harus dikejar.
  batas_sat_fat_g numeric(6, 1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Satu target per kombinasi tipe hari x fase.
  constraint day_type_targets_unik unique (day_type_id, fase),
  constraint day_type_targets_kalori_masuk_akal check (target_kalori between 800 and 8000),
  constraint day_type_targets_protein_positif check (target_protein_g >= 0),
  constraint day_type_targets_lemak_positif check (target_lemak_g >= 0),
  constraint day_type_targets_sat_fat_positif check (batas_sat_fat_g >= 0)
);

create index if not exists day_type_targets_user_fase_idx
  on public.day_type_targets (user_id, fase);

drop trigger if exists day_type_targets_set_updated_at on public.day_type_targets;
create trigger day_type_targets_set_updated_at
  before update on public.day_type_targets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- daily_logs — inti log harian, satu baris per (pengguna, tanggal)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sudah dinormalisasi ke Asia/Jakarta oleh pemanggil.
  tanggal date not null,
  berat_pagi_kg numeric(5, 2),
  -- Dibiarkan null bila tipe hari belum ditentukan sama sekali.
  day_type_id uuid references public.day_types (id) on delete set null,
  -- true bila pengguna menimpa hasil auto-deteksi.
  day_type_override boolean not null default false,
  kalori integer not null default 0,
  protein_g numeric(6, 1) not null default 0,
  lemak_g numeric(6, 1) not null default 0,
  karbo_g numeric(6, 1) not null default 0,
  sat_fat_g numeric(6, 1) not null default 0,
  -- Snapshot target hari itu, supaya riwayat tidak berubah saat target diedit.
  target_kalori integer,
  catatan text,
  -- Membedakan data mentah (ketikan) dari hasil sinkronisasi perangkat.
  sumber_berat public.sumber_berat,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_logs_satu_per_hari unique (user_id, tanggal),
  constraint daily_logs_berat_masuk_akal
    check (berat_pagi_kg is null or berat_pagi_kg between 30 and 250),
  constraint daily_logs_kalori_positif check (kalori >= 0),
  constraint daily_logs_makro_positif
    check (protein_g >= 0 and lemak_g >= 0 and karbo_g >= 0 and sat_fat_g >= 0),
  constraint daily_logs_catatan_wajar check (catatan is null or char_length(catatan) <= 2000),
  -- Berat ada tanpa sumber berarti asal angkanya hilang; itu dilarang karena
  -- pembedaan data mentah vs sinkron adalah syarat PRD.
  constraint daily_logs_sumber_berat_konsisten
    check ((berat_pagi_kg is null) = (sumber_berat is null))
);

-- Grafik tren membaca rentang tanggal per pengguna, urut menurun.
create index if not exists daily_logs_user_tanggal_idx
  on public.daily_logs (user_id, tanggal desc);

drop trigger if exists daily_logs_set_updated_at on public.daily_logs;
create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- food_logs — entri makanan di dalam satu hari
-- ---------------------------------------------------------------------------
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  daily_log_id uuid not null references public.daily_logs (id) on delete cascade,
  nama_makanan text not null,
  -- Referensi objek di Supabase Storage; diisi mulai Fase 4.
  foto_url text,
  kalori integer not null default 0,
  protein_g numeric(6, 1) not null default 0,
  lemak_g numeric(6, 1) not null default 0,
  karbo_g numeric(6, 1) not null default 0,
  sat_fat_g numeric(6, 1) not null default 0,
  -- 'foto_ai' menandai ESTIMASI, 'manual' menandai data mentah.
  sumber public.sumber_makanan not null default 'manual',
  created_at timestamptz not null default now(),
  constraint food_logs_nama_tidak_kosong check (char_length(btrim(nama_makanan)) > 0),
  constraint food_logs_kalori_positif check (kalori >= 0),
  constraint food_logs_makro_positif
    check (protein_g >= 0 and lemak_g >= 0 and karbo_g >= 0 and sat_fat_g >= 0)
);

create index if not exists food_logs_daily_log_idx
  on public.food_logs (daily_log_id, created_at);

-- =============================================================================
-- Row Level Security — pemilik saja, tanpa pengecualian
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.day_types         enable row level security;
alter table public.day_type_targets  enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.food_logs         enable row level security;

-- profiles memakai user_id sebagai primary key, jadi kolom pemiliknya berbeda nama.
drop policy if exists "profiles pemilik saja" on public.profiles;
create policy "profiles pemilik saja" on public.profiles
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "day_types pemilik saja" on public.day_types;
create policy "day_types pemilik saja" on public.day_types
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "day_type_targets pemilik saja" on public.day_type_targets;
create policy "day_type_targets pemilik saja" on public.day_type_targets
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "daily_logs pemilik saja" on public.daily_logs;
create policy "daily_logs pemilik saja" on public.daily_logs
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "food_logs pemilik saja" on public.food_logs;
create policy "food_logs pemilik saja" on public.food_logs
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
