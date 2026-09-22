-- =============================================================================
-- Auto-deteksi tipe hari dari workout
--
-- Cakupan: tabel `workouts` di sini sengaja MINIMAL — hanya kolom yang
-- dibutuhkan auto-deteksi. Integrasi Hevy penuh (workout_sets, e1RM Epley,
-- source_priority, dedup antar sumber) adalah pekerjaan Fase 2; tabel ini
-- dirancang agar kolom-kolom itu tinggal ditambahkan, bukan diganti.
--
-- Aturan deteksinya sengaja sama persis dengan `src/lib/deteksiTipeHari.ts`
-- dan dijaga oleh `npm run cek:paritas`.
-- =============================================================================

-- Kategori olahraga yang menjadi dasar aturan deteksi.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'jenis_olahraga') then
    create type public.jenis_olahraga as enum ('angkat_beban', 'lari', 'padel', 'lainnya');
  end if;
  if not exists (select 1 from pg_type where typname = 'sumber_workout') then
    create type public.sumber_workout as enum ('hevy', 'strava', 'whoop', 'healthkit', 'manual');
  end if;
end $$;

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sudah dinormalisasi ke Asia/Jakarta. Strava mengirim UTC, jadi konversi
  -- wajib dilakukan SEBELUM menulis ke sini.
  tanggal date not null,
  nama text not null,
  jenis public.jenis_olahraga not null,
  sumber public.sumber_workout not null,
  durasi_menit integer,
  -- Id dari layanan asal; dipakai Fase 2 untuk dedup saat sync berulang.
  external_id text,
  created_at timestamptz not null default now(),
  -- Satu workout dari satu sumber hanya boleh masuk sekali.
  constraint workouts_unik_per_sumber unique (user_id, sumber, external_id),
  constraint workouts_durasi_wajar
    check (durasi_menit is null or durasi_menit between 0 and 1440)
);

create index if not exists workouts_user_tanggal_idx
  on public.workouts (user_id, tanggal desc);

alter table public.workouts enable row level security;

drop policy if exists "workouts pemilik saja" on public.workouts;
create policy "workouts pemilik saja" on public.workouts
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.workouts from anon';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Aturan deteksi
--
-- Sengaja sederhana dan eksplisit supaya hasilnya bisa DIJELASKAN ke pengguna
-- (dan nanti ke AI coach), bukan terasa ajaib:
--   1. ada angkat beban DAN lari  → "Beban+Lari"
--   2. ada angkat beban saja      → "Angkat Beban"
--   3. ada padel                  → "Padel"
--   4. tidak ada apa-apa          → "Rest"
-- Hanya tipe hari dengan `auto_detect` yang boleh menjadi hasil tebakan.
-- ---------------------------------------------------------------------------
create or replace function public.deteksi_tipe_hari(p_tanggal date, p_user_id uuid default null)
returns table (
  day_type_id uuid,
  nama text,
  -- Workout yang mendasari tebakan; kosong berarti hari istirahat.
  dasar text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := coalesce(p_user_id, (select auth.uid()));
  v_ada_beban boolean;
  v_ada_lari boolean;
  v_ada_padel boolean;
  v_nama text;
  v_dasar text[];
begin
  select
    bool_or(jenis = 'angkat_beban'),
    bool_or(jenis = 'lari'),
    bool_or(jenis = 'padel')
  into v_ada_beban, v_ada_lari, v_ada_padel
  from public.workouts
  where user_id = v_user_id and tanggal = p_tanggal;

  v_ada_beban := coalesce(v_ada_beban, false);
  v_ada_lari  := coalesce(v_ada_lari, false);
  v_ada_padel := coalesce(v_ada_padel, false);

  if v_ada_beban and v_ada_lari then
    v_nama := 'Beban+Lari';
  elsif v_ada_beban then
    v_nama := 'Angkat Beban';
  elsif v_ada_padel then
    v_nama := 'Padel';
  else
    v_nama := 'Rest';
  end if;

  -- Tipe hari yang tidak mengizinkan auto-deteksi tidak boleh jadi hasil;
  -- dalam hal itu app jatuh ke Rest.
  if not exists (
    select 1 from public.day_types
     where user_id = v_user_id and day_types.nama = v_nama and auto_detect
  ) then
    v_nama := 'Rest';
  end if;

  -- Dasar tebakan hanya berisi workout yang benar-benar menentukan hasilnya.
  select coalesce(array_agg(w.nama || ' (' || w.sumber || ')' order by w.created_at), '{}')
    into v_dasar
    from public.workouts w
   where w.user_id = v_user_id
     and w.tanggal = p_tanggal
     and (
       (v_nama = 'Beban+Lari'   and w.jenis in ('angkat_beban', 'lari')) or
       (v_nama = 'Angkat Beban' and w.jenis = 'angkat_beban') or
       (v_nama = 'Padel'        and w.jenis = 'padel')
     );

  return query
    select d.id, d.nama, v_dasar
      from public.day_types d
     where d.user_id = v_user_id and d.nama = v_nama
     limit 1;
end;
$$;

comment on function public.deteksi_tipe_hari(date, uuid) is
  'Menebak tipe hari dari workout yang tercatat. Aturannya dijaga sama dengan '
  'src/lib/deteksiTipeHari.ts oleh npm run cek:paritas.';

-- ---------------------------------------------------------------------------
-- Terapkan hasil deteksi — HANYA bila pengguna belum meng-override
-- ---------------------------------------------------------------------------
create or replace function public.terapkan_auto_deteksi(p_tanggal date, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deteksi record;
  v_fase public.fase_program;
  v_target integer;
  v_override boolean;
begin
  -- Pilihan manual pengguna selalu menang; auto tidak boleh menimpanya.
  select day_type_override into v_override
    from public.daily_logs
   where user_id = p_user_id and tanggal = p_tanggal;

  if coalesce(v_override, false) then
    return;
  end if;

  select * into v_deteksi from public.deteksi_tipe_hari(p_tanggal, p_user_id);
  if v_deteksi.day_type_id is null then
    return;
  end if;

  select fase_aktif into v_fase from public.profiles where user_id = p_user_id;
  select target_kalori into v_target
    from public.day_type_targets
   where day_type_id = v_deteksi.day_type_id and fase = v_fase;

  insert into public.daily_logs (user_id, tanggal, day_type_id, day_type_override, target_kalori)
  values (p_user_id, p_tanggal, v_deteksi.day_type_id, false, v_target)
  on conflict (user_id, tanggal) do update
    set day_type_id   = excluded.day_type_id,
        target_kalori = excluded.target_kalori
    -- Sabuk pengaman kedua: jangan pernah menyentuh baris yang di-override.
    where not public.daily_logs.day_type_override;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workout masuk/berubah/hilang → deteksi ulang hari yang terpengaruh
-- ---------------------------------------------------------------------------
create or replace function public.trigger_auto_deteksi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.terapkan_auto_deteksi(old.tanggal, old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.terapkan_auto_deteksi(new.tanggal, new.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists workouts_auto_deteksi on public.workouts;
create trigger workouts_auto_deteksi
  after insert or update or delete on public.workouts
  for each row execute function public.trigger_auto_deteksi();

-- ---------------------------------------------------------------------------
-- Kembali mengikuti auto-deteksi (membuang override)
-- ---------------------------------------------------------------------------
create or replace function public.ikuti_auto_deteksi(p_tanggal date)
returns public.daily_logs
language plpgsql
-- SECURITY DEFINER karena memanggil `terapkan_auto_deteksi`, yang sengaja
-- TIDAK diberikan ke klien: fungsi itu menerima p_user_id, jadi kalau klien
-- boleh memanggilnya langsung ia bisa menulis ke hari milik orang lain.
-- Aman di sini karena setiap pernyataan di bawah dibatasi ke v_user_id yang
-- berasal dari auth.uid(), bukan dari argumen pemanggil.
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_baris public.daily_logs;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  update public.daily_logs
     set day_type_override = false
   where user_id = v_user_id and tanggal = p_tanggal;

  perform public.terapkan_auto_deteksi(p_tanggal, v_user_id);

  select * into v_baris from public.daily_logs
   where user_id = v_user_id and tanggal = p_tanggal;
  return v_baris;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.terapkan_auto_deteksi(date, uuid) from public;
revoke all on function public.deteksi_tipe_hari(date, uuid) from public;
revoke all on function public.ikuti_auto_deteksi(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.deteksi_tipe_hari(date, uuid) to authenticated';
    execute 'grant execute on function public.ikuti_auto_deteksi(date) to authenticated';
  end if;
end $$;
