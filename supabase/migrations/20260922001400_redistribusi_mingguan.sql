-- ---------------------------------------------------------------------------
-- Skema budget & redistribusi mingguan.
--
-- Redistribusi memindahkan kelebihan satu hari ke hari-hari lain dalam pekan
-- yang sama. Dua hal harus benar secara STRUKTURAL, bukan sekadar dijaga kode
-- pemanggilnya:
--
-- 1. Target ASLI hari itu tidak boleh hilang. Kalau target hari Kamis dipotong
--    dari 2.850 ke 2.630, lalu budget mingguan dihitung ulang dari target yang
--    sudah dipotong itu, redistribusinya membatalkan dirinya sendiri: jatah
--    pekan ikut mengecil sebesar potongan, dan kelebihannya tetap tidak
--    tertutup. Karena itu `target_asli_kalori` disimpan terpisah.
-- 2. Protein TIDAK PERNAH ikut dipotong — syarat tegas di PRD. Di sini itu
--    dijamin oleh bentuk tabelnya: redistribusi hanya punya kolom KALORI.
--    Tidak ada tempat untuk menulis perubahan protein, jadi tidak ada jalan
--    untuk melakukannya secara tidak sengaja.
-- ---------------------------------------------------------------------------

-- Target sebelum redistribusi. NULL berarti hari itu belum pernah disesuaikan,
-- dan target berlakunya adalah `target_kalori` apa adanya.
alter table public.daily_logs add column if not exists target_asli_kalori integer;

comment on column public.daily_logs.target_asli_kalori is
  'Target kalori SEBELUM redistribusi. Budget mingguan dihitung dari kolom ini '
  'supaya redistribusi tidak mengecilkan jatah pekan yang jadi dasarnya sendiri.';

-- --- Opsi redistribusi, sama persis dengan OpsiRedistribusi di TypeScript ---
do $$
begin
  if not exists (select 1 from pg_type where typname = 'opsi_redistribusi') then
    create type public.opsi_redistribusi as enum ('sebar_rata', 'tumpuk_satu_hari', 'abaikan');
  end if;
end $$;

-- --- Satu penerapan redistribusi -------------------------------------------
create table if not exists public.redistribusi_mingguan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Senin pekan yang disesuaikan; satu pekan bisa disesuaikan berkali-kali,
  -- dan tiap penerapan disimpan sebagai barisnya sendiri.
  minggu_mulai date not null,
  opsi public.opsi_redistribusi not null,
  /* Negatif berarti kelebihan yang harus ditutup. */
  perlu_dipindah integer not null,
  terserap integer not null,
  /* Yang TIDAK terserap; disimpan terang-terangan, bukan dibuang. */
  tersisa integer not null,
  dibatasi_lantai boolean not null default false,
  alasan text,
  created_at timestamptz not null default now(),
  constraint redistribusi_alasan_wajar check (alasan is null or char_length(alasan) <= 500),
  -- Terserap + tersisa harus menjelaskan seluruh selisihnya. Kalau tidak,
  -- ada kalori yang hilang tanpa keterangan — dan itu persis jenis angka yang
  -- membuat orang berhenti percaya pada budgetnya.
  constraint redistribusi_utuh check (terserap + tersisa = perlu_dipindah)
);

create index if not exists redistribusi_user_minggu_idx
  on public.redistribusi_mingguan (user_id, minggu_mulai desc);

comment on table public.redistribusi_mingguan is
  'Satu penerapan redistribusi budget mingguan. Hanya menyentuh kalori — '
  'protein tidak punya kolom di sini, jadi ia tidak bisa ikut dipotong.';

-- --- Perubahan per hari ----------------------------------------------------
create table if not exists public.redistribusi_hari (
  id uuid primary key default gen_random_uuid(),
  redistribusi_id uuid not null
    references public.redistribusi_mingguan (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tanggal date not null,
  target_lama integer not null,
  target_baru integer not null,
  /* true bila target tertahan batas bawah kalori harian. */
  kena_lantai boolean not null default false,
  constraint redistribusi_hari_satu_per_tanggal unique (redistribusi_id, tanggal),
  constraint redistribusi_hari_target_positif check (target_lama > 0 and target_baru > 0)
);

create index if not exists redistribusi_hari_user_tanggal_idx
  on public.redistribusi_hari (user_id, tanggal);

comment on table public.redistribusi_hari is
  'Perubahan target kalori per hari dalam satu penerapan redistribusi. '
  'Menyimpan target lama DAN baru supaya penerapannya bisa ditelusuri & dibatalkan.';

-- --- RLS -------------------------------------------------------------------
alter table public.redistribusi_mingguan enable row level security;
alter table public.redistribusi_hari enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'redistribusi_mingguan' and policyname = 'redistribusi_milik_sendiri'
  ) then
    create policy redistribusi_milik_sendiri on public.redistribusi_mingguan
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'redistribusi_hari' and policyname = 'redistribusi_hari_milik_sendiri'
  ) then
    create policy redistribusi_hari_milik_sendiri on public.redistribusi_hari
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- --- Senin pekan sebuah tanggal --------------------------------------------
-- Pekan dimulai SENIN, sama seperti `awalMinggu` di @recomp/logika. Postgres
-- `date_trunc('week', …)` juga memakai Senin, tapi menuliskannya sebagai
-- fungsi bernama membuat kesamaan itu terlihat dan bisa diuji.
create or replace function public.awal_minggu(p_tanggal date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('week', p_tanggal::timestamp))::date;
$$;

comment on function public.awal_minggu(date) is
  'Senin pekan yang memuat tanggal tersebut. Sama dengan awalMinggu di @recomp/logika.';

-- --- setel_tipe_hari: mengganti tipe hari MEMBATALKAN redistribusi hari itu
--
-- Redistribusi dihitung terhadap rencana tertentu. Begitu tipe harinya
-- berubah, rencana itu tidak ada lagi, dan menyisakan `target_asli_kalori`
-- lama menghasilkan pasangan angka yang omong kosong: asli 2.450 dengan
-- target berlaku 2.850 terbaca seolah hari itu MENDAPAT kalori dari
-- redistribusi, padahal yang terjadi cuma tipe harinya diganti.
-- ---------------------------------------------------------------------------
create or replace function public.setel_tipe_hari(
  p_tanggal date,
  p_day_type_id uuid,
  p_override boolean default true
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_fase public.fase_program;
  v_target public.day_type_targets;
  v_baris public.daily_logs;
  v_lama uuid;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.day_types where id = p_day_type_id and user_id = v_user_id
  ) then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  select day_type_id into v_lama
    from public.daily_logs
   where user_id = v_user_id and tanggal = p_tanggal;

  v_fase := public.fase_pada_tanggal(p_tanggal);
  if v_fase is null then
    raise exception 'Profil belum punya fase aktif' using errcode = '23502';
  end if;

  select * into v_target
    from public.day_type_targets
   where day_type_id = p_day_type_id and fase = v_fase;

  insert into public.daily_logs (
    user_id, tanggal, day_type_id, day_type_override,
    fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g
  )
  values (
    v_user_id, p_tanggal, p_day_type_id, p_override,
    v_fase, v_target.target_kalori, v_target.target_protein_g,
    v_target.target_lemak_g, v_target.batas_sat_fat_g
  )
  on conflict (user_id, tanggal) do update
    set day_type_id       = excluded.day_type_id,
        day_type_override = excluded.day_type_override,
        fase              = excluded.fase,
        target_kalori     = excluded.target_kalori,
        target_protein_g  = excluded.target_protein_g,
        target_lemak_g    = excluded.target_lemak_g,
        batas_sat_fat_g   = excluded.batas_sat_fat_g,
        -- Tipe hari BERUBAH → redistribusi lama tidak berlaku lagi.
        -- Tipe hari sama → biarkan; ini cuma menyegarkan snapshot.
        target_asli_kalori = case
          when public.daily_logs.day_type_id is distinct from excluded.day_type_id
            then null
          else public.daily_logs.target_asli_kalori
        end
  returning * into v_baris;

  return v_baris;
end;
$$;

-- --- Hak akses -------------------------------------------------------------
revoke all on function public.awal_minggu(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.awal_minggu(date) to authenticated';
    execute 'grant select, insert, update, delete on public.redistribusi_mingguan to authenticated';
    execute 'grant select, insert, update, delete on public.redistribusi_hari to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.redistribusi_mingguan from anon';
    execute 'revoke all on public.redistribusi_hari from anon';
  end if;
end $$;
