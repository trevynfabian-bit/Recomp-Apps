-- ---------------------------------------------------------------------------
-- Penarikan Hevy terjadwal: set latihan, kursor, dan penerimanya.
--
-- Hevy tidak punya webhook. Edge Function `sinkron-hevy` dipicu cron tiap jam,
-- menarik `GET /v1/workouts/events?since=<kursor>` per koneksi, lalu
-- menyerahkan hasilnya ke `terima_sesi_hevy` dalam SATU transaksi per
-- pengguna. Kursor baru ikut disimpan di transaksi yang sama: sesi dan kursor
-- maju bersama, atau tidak sama sekali. Kursor yang maju tanpa sesinya
-- berarti sesi yang hilang selamanya.
--
-- Hevy adalah catatan latihan BEBAN (PRD: latihan tetap dicatat di Hevy, app
-- hanya membaca). Karena itu, untuk pertama kalinya, set per latihan
-- disimpan — `workout_sets` — dasar e1RM dan sumbu kekuatan evaluasi.
-- ---------------------------------------------------------------------------

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  -- Diulang dari workouts supaya RLS tidak butuh join.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nama latihan persis dari Hevy, mis. "Bench Press (Barbell)".
  latihan text not null,
  -- Urutan latihan dalam sesi (1…); latihan yang sama bisa muncul dua kali.
  latihan_ke integer not null,
  set_ke integer not null,
  jenis_set text not null default 'normal',
  -- null = berat badan (pull-up, dip) tanpa beban tambahan.
  beban_kg numeric(6, 2),
  reps integer not null,
  created_at timestamptz not null default now(),

  constraint workout_sets_urutan unique (workout_id, latihan_ke, set_ke),
  constraint workout_sets_latihan_isi check (char_length(latihan) between 1 and 120),
  constraint workout_sets_nomor check (latihan_ke >= 1 and set_ke >= 1),
  constraint workout_sets_jenis_sah check (jenis_set in ('normal', 'warmup', 'dropset', 'failure')),
  -- 0 kg ditulis null (berat badan); 600 kg melebihi rekor dunia squat.
  constraint workout_sets_beban_wajar check (beban_kg is null or (beban_kg > 0 and beban_kg <= 600)),
  -- Set tanpa repetisi (kardio, plank) tidak disimpan di sini.
  constraint workout_sets_reps_wajar check (reps between 1 and 200)
);

comment on table public.workout_sets is
  'Set latihan beban dari Hevy. Dasar e1RM (Epley, ≤12 repetisi) dan sumbu kekuatan.';

create index if not exists workout_sets_workout_idx on public.workout_sets (workout_id);
create index if not exists workout_sets_user_latihan_idx on public.workout_sets (user_id, latihan);

-- Set milik latihan orang lain tidak bisa ditempelkan ke sesi ini.
create or replace function public.set_sesuai_pemilik_latihan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workouts w where w.id = new.workout_id and w.user_id = new.user_id) then
    raise exception 'Set tidak cocok dengan pemilik latihannya' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sets_sesuai_pemilik on public.workout_sets;
create trigger workout_sets_sesuai_pemilik
  before insert or update on public.workout_sets
  for each row execute function public.set_sesuai_pemilik_latihan();

alter table public.workout_sets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'workout_sets' and policyname = 'set_baca_milik_sendiri'
  ) then
    -- Hanya baca: Hevy adalah sumber kebenarannya; app tidak mengubah set.
    create policy set_baca_milik_sendiri on public.workout_sets
      for select using (user_id = (select auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.workout_sets from authenticated';
    execute 'grant select on public.workout_sets to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.workout_sets from anon';
  end if;
end $$;

revoke execute on function public.set_sesuai_pemilik_latihan() from public, anon, authenticated;

-- --- Kursor penarikan ----------------------------------------------------------
alter table public.health_connections add column if not exists kursor_sinkron timestamptz;

comment on column public.health_connections.kursor_sinkron is
  'Sumber yang ditarik cron (Hevy): peristiwa sejak waktu ini yang belum diambil.';

/**
 * Antrean penarikan: koneksi Hevy terhubung, yang paling lama tidak ditarik
 * lebih dulu. Service role saja.
 */
create or replace function public.koneksi_hevy_perlu_sinkron(p_batas integer default 50)
returns table (connection_id uuid, user_id uuid, kursor_sinkron timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Hanya untuk jadwal server' using errcode = '42501';
  end if;
  return query
    select c.id, c.user_id, c.kursor_sinkron
      from public.health_connections c
     where c.sumber = 'hevy' and c.status = 'terhubung'
     order by c.sinkron_terakhir nulls first, c.id
     limit greatest(1, least(p_batas, 500));
end;
$$;

/**
 * Terima hasil satu penarikan untuk satu koneksi Hevy.
 *
 *   p_sesi  [{ id, mulai, nama, durasi_menit, jenis, latihan: [{ latihan, sets: [{ set_ke, beban_kg, reps, jenis }] }] }]
 *   p_hapus [id workout Hevy]
 *   p_kursor kursor berikutnya
 *
 * Set sebuah sesi DIGANTI utuh: sesi yang disunting di Hevy (set dihapus,
 * beban dikoreksi) harus tampil persis seperti di Hevy, bukan gabungan versi
 * lama dan baru.
 */
create or replace function public.terima_sesi_hevy(
  p_connection_id uuid,
  p_sesi jsonb,
  p_hapus jsonb,
  p_kursor timestamptz
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid;
  v_s jsonb;
  v_l jsonb;
  v_set jsonb;
  v_i integer;
  v_li integer;
  v_workout uuid;
  v_mulai timestamptz;
  v_n integer;
  v_sesi integer := 0;
  v_set_n integer := 0;
  v_hapus integer := 0;
  v_lewati jsonb := '[]'::jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'Hanya untuk jadwal server' using errcode = '42501';
  end if;

  select c.user_id into v_user
    from public.health_connections c
   where c.id = p_connection_id and c.sumber = 'hevy' and c.status = 'terhubung'
     for update;
  if v_user is null then
    -- Diputus di tengah penarikan: jangan tulis apa pun, kursor tidak maju.
    return jsonb_build_object('diabaikan', 'koneksi_tidak_terhubung');
  end if;

  for v_s, v_i in
    select e, i - 1 from jsonb_array_elements(coalesce(p_sesi, '[]')) with ordinality as x (e, i)
  loop
    begin
      v_mulai := (v_s ->> 'mulai')::timestamptz;
      insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, durasi_menit, waktu_mulai)
      values (v_user, (timezone('Asia/Jakarta', v_mulai))::date,
              left(coalesce(nullif(trim(v_s ->> 'nama'), ''), 'Latihan Hevy'), 120),
              coalesce(v_s ->> 'jenis', 'angkat_beban')::public.jenis_olahraga,
              'hevy', v_s ->> 'id', (v_s ->> 'durasi_menit')::integer, v_mulai)
      on conflict (user_id, sumber, external_id) do update
        set tanggal = excluded.tanggal,
            nama = excluded.nama,
            jenis = excluded.jenis,
            durasi_menit = excluded.durasi_menit,
            waktu_mulai = excluded.waktu_mulai
      returning id into v_workout;

      delete from public.workout_sets where workout_id = v_workout;

      v_li := 0;
      for v_l in select e from jsonb_array_elements(coalesce(v_s -> 'latihan', '[]')) as y (e) loop
        v_li := v_li + 1;
        for v_set in select e from jsonb_array_elements(coalesce(v_l -> 'sets', '[]')) as z (e) loop
          insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, jenis_set, beban_kg, reps)
          values (v_workout, v_user, left(v_l ->> 'latihan', 120), v_li, (v_set ->> 'set_ke')::integer,
                  coalesce(v_set ->> 'jenis', 'normal'), (v_set ->> 'beban_kg')::numeric, (v_set ->> 'reps')::integer);
          v_set_n := v_set_n + 1;
        end loop;
      end loop;
      v_sesi := v_sesi + 1;
    exception
      when check_violation or not_null_violation or unique_violation or data_exception then
        -- Satu sesi rusak tidak menahan sesi lain (dan kursornya).
        v_lewati := v_lewati || jsonb_build_object('indeks', v_i, 'id', v_s ->> 'id', 'alasan', sqlerrm);
    end;
  end loop;

  delete from public.workouts w
   where w.user_id = v_user and w.sumber = 'hevy'
     and w.external_id in (select jsonb_array_elements_text(coalesce(p_hapus, '[]')));
  get diagnostics v_n = row_count;
  v_hapus := v_n;

  update public.health_connections
     set kursor_sinkron = p_kursor, sinkron_terakhir = now(), galat_terakhir = null, galat_pada = null
   where id = p_connection_id;

  return jsonb_build_object('sesi', v_sesi, 'set', v_set_n, 'dihapus', v_hapus, 'dilewati', v_lewati);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.koneksi_hevy_perlu_sinkron(integer)',
    'public.terima_sesi_hevy(uuid, jsonb, jsonb, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
