-- ---------------------------------------------------------------------------
-- Impor riwayat sekali: endpoint + pelacakan job.
--
-- Alurnya di app: berkas diurai & DIPRATINJAU di perangkat (parser bersama
-- @recomp/logika), lalu dikirim bertahap:
--   mulai_impor  → satu baris import_jobs berstatus `berjalan`
--   impor_batch  → potongan demi potongan; kemajuan "120 dari 312" tersimpan
--   selesaikan_impor → `selesai` (atau `gagal` beserta alasannya)
--
-- Jaminan:
--
-- 1. IMPOR ULANG TIDAK MENGGANDAKAN. Setiap baris punya kunci alami: sesi
--    Hevy dari CSV ber-id `csv:<waktu mulai UTC>` (diturunkan server, bukan
--    dikirim klien), ukuran per tanggal, sampel HealthKit per kunci dedup
--    health_data. Berkas yang sama diimpor dua kali menghasilkan data yang
--    sama persis.
--
-- 2. IMPOR TIDAK MENIMPA. Riwayat lama adalah data LAMA: tanggal yang sudah
--    punya ukuran, atau sesi yang sudah masuk lewat API Hevy, dibiarkan dan
--    dihitung `sudah_ada`. Berat pagi mengikuti aturan sinkron_healthkit
--    (manual tidak pernah ditimpa).
--
-- 3. SESI API MENGGANTIKAN SESI CSV. Sesi yang sama bisa datang lewat CSV
--    (impor) lalu lewat API (penarikan 90 hari). Versi API membawa id Hevy
--    asli, jadi saat ia masuk, salinan CSV dengan waktu mulai yang sama
--    dihapus — bukan dua sesi untuk satu latihan.
--
-- 4. SATU IMPOR BERJALAN PER SUMBER. App yang ditutup di tengah impor
--    meninggalkan job `berjalan`; setelah 10 menit tanpa kemajuan job itu
--    dianggap terputus dan impor baru boleh dimulai.
-- ---------------------------------------------------------------------------

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sumber text not null,
  status text not null default 'berjalan',
  -- Jumlah isi yang akan dikirim (sesi / tanggal / entri) — dasar "N dari M".
  total integer not null,
  selesai integer not null default 0,
  -- Kalimat pratinjau, mis. "3 sesi · 7 set · 8–12 September".
  ringkas text not null,
  -- Baris berkas yang dilewati PARSER di perangkat, beserta alasannya.
  dilewati_berkas jsonb not null default '[]',
  -- Hitungan server: disimpan / sudah_ada / dilewati.
  hasil jsonb not null default '{"disimpan": 0, "sudah_ada": 0, "dilewati": 0}',
  galat text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  selesai_pada timestamptz,

  constraint import_jobs_sumber_sah check (sumber in ('hevy_csv', 'apple_health', 'ukuran_lama')),
  constraint import_jobs_status_sah check (status in ('berjalan', 'selesai', 'gagal')),
  constraint import_jobs_total_wajar check (total between 1 and 20000),
  constraint import_jobs_kemajuan check (selesai between 0 and total),
  constraint import_jobs_ringkas_isi check (char_length(ringkas) between 1 and 200),
  constraint import_jobs_dilewati_daftar
    check (jsonb_typeof(dilewati_berkas) = 'array' and jsonb_array_length(dilewati_berkas) <= 2000),
  constraint import_jobs_selesai_konsisten check ((status = 'berjalan') = (selesai_pada is null)),
  constraint import_jobs_galat_konsisten
    check ((status = 'gagal') = (galat is not null) and (galat is null or char_length(galat) between 1 and 300))
);

comment on table public.import_jobs is
  'Impor riwayat sekali (Hevy CSV, Apple Health, ukuran lama): status, kemajuan, dan hasil per job.';

create unique index if not exists import_jobs_satu_berjalan
  on public.import_jobs (user_id, sumber) where status = 'berjalan';
create index if not exists import_jobs_user_idx on public.import_jobs (user_id, dibuat_pada desc);

alter table public.import_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'import_jobs' and policyname = 'impor_milik_sendiri'
  ) then
    -- Tulis lewat fungsi di bawah (INVOKER); kebijakan ini yang membatasinya
    -- ke job milik sendiri.
    create policy impor_milik_sendiri on public.import_jobs
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.import_jobs from authenticated';
    execute 'grant select, insert, update on public.import_jobs to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.import_jobs from anon';
  end if;
end $$;

-- --- Set dari impor CSV boleh ditulis pemiliknya ------------------------------
-- Set dari API Hevy tetap hanya-baca (Hevy sumber kebenarannya). Set dari
-- berkas yang diimpor pengguna sendiri — latihan ber-id `csv:` — boleh
-- ditulis & diganti oleh pemiliknya, dan HANYA itu.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'workout_sets' and policyname = 'set_impor_tulis'
  ) then
    create policy set_impor_tulis on public.workout_sets
      for insert with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.workouts w
                     where w.id = workout_id and w.user_id = (select auth.uid())
                       and w.sumber = 'hevy' and w.external_id like 'csv:%'));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'workout_sets' and policyname = 'set_impor_hapus'
  ) then
    create policy set_impor_hapus on public.workout_sets
      for delete using (
        user_id = (select auth.uid())
        and exists (select 1 from public.workouts w
                     where w.id = workout_id and w.user_id = (select auth.uid())
                       and w.sumber = 'hevy' and w.external_id like 'csv:%'));
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant insert, delete on public.workout_sets to authenticated';
  end if;
end $$;

-- --- Sesi API menggantikan salinan CSV-nya -------------------------------------
create or replace function public.sesi_api_gantikan_csv()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.workouts w
   where w.user_id = new.user_id
     and w.sumber = 'hevy'
     and w.external_id like 'csv:%'
     and w.waktu_mulai = new.waktu_mulai;
  return new;
end;
$$;

drop trigger if exists workouts_sesi_api_gantikan_csv on public.workouts;
create trigger workouts_sesi_api_gantikan_csv
  before insert on public.workouts
  for each row
  when (new.sumber = 'hevy' and new.waktu_mulai is not null and new.external_id not like 'csv:%')
  execute function public.sesi_api_gantikan_csv();

revoke execute on function public.sesi_api_gantikan_csv() from public, anon, authenticated;

-- --- Batas potongan -------------------------------------------------------------
create or replace function public.maks_isi_batch_impor(p_sumber text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_sumber
           when 'hevy_csv' then 100      -- sesi, masing-masing dengan setnya
           when 'ukuran_lama' then 500   -- tanggal
           when 'apple_health' then 5000 -- sama dengan batas sinkron_healthkit
         end
$$;

-- --- Mulai ------------------------------------------------------------------------
create or replace function public.mulai_impor(
  p_sumber text,
  p_total integer,
  p_ringkas text,
  p_dilewati jsonb default '[]'
)
returns public.import_jobs
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_lama public.import_jobs;
  v_job public.import_jobs;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_lama from public.import_jobs
   where user_id = v_user and sumber = p_sumber and status = 'berjalan'
     for update;
  if found then
    if v_lama.diperbarui_pada > now() - interval '10 minutes' then
      raise exception 'Impor % lain masih berjalan', p_sumber using errcode = '55006';
    end if;
    update public.import_jobs
       set status = 'gagal', galat = 'Terputus sebelum selesai.', selesai_pada = now(), diperbarui_pada = now()
     where id = v_lama.id;
  end if;

  insert into public.import_jobs (user_id, sumber, total, ringkas, dilewati_berkas)
  values (v_user, p_sumber, p_total, left(p_ringkas, 200), coalesce(p_dilewati, '[]'))
  returning * into v_job;
  return v_job;
end;
$$;

-- --- Satu potongan ------------------------------------------------------------------
create or replace function public.impor_batch(p_job uuid, p_isi jsonb)
returns public.import_jobs
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_job public.import_jobs;
  v_n integer := 0;          -- isi dalam potongan ini (untuk kemajuan)
  v_simpan integer := 0;
  v_ada integer := 0;
  v_lewati integer := 0;
  v_e jsonb;
  v_l jsonb;
  v_set jsonb;
  v_li integer;
  v_mulai timestamptz;
  v_workout uuid;
  v_h jsonb;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_job from public.import_jobs
   where id = p_job and user_id = v_user
     for update;
  if not found then
    raise exception 'Job impor tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_job.status <> 'berjalan' then
    raise exception 'Job impor sudah %', v_job.status using errcode = '55000';
  end if;

  -- ---------------- Hevy CSV: sesi → workouts + workout_sets ----------------
  if v_job.sumber = 'hevy_csv' then
    v_n := jsonb_array_length(coalesce(p_isi -> 'sesi', '[]'));
    if v_n > public.maks_isi_batch_impor(v_job.sumber) then
      raise exception 'Potongan terlalu besar (% sesi)', v_n using errcode = '22023';
    end if;

    for v_e in select e from jsonb_array_elements(coalesce(p_isi -> 'sesi', '[]')) as x (e) loop
      begin
        v_mulai := (v_e ->> 'mulai')::timestamptz;
        -- Sesi yang sudah masuk lewat API Hevy tidak disalin dari berkas.
        if exists (select 1 from public.workouts w
                    where w.user_id = v_user and w.sumber = 'hevy' and w.waktu_mulai = v_mulai
                      and w.external_id not like 'csv:%') then
          v_ada := v_ada + 1;
          continue;
        end if;

        insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, durasi_menit, waktu_mulai)
        values (v_user, (timezone('Asia/Jakarta', v_mulai))::date,
                left(coalesce(nullif(trim(v_e ->> 'nama'), ''), 'Latihan Hevy'), 120),
                case when jsonb_array_length(coalesce(v_e -> 'latihan', '[]')) > 0
                     then 'angkat_beban' else 'lainnya' end::public.jenis_olahraga,
                'hevy',
                'csv:' || to_char(v_mulai at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                nullif((v_e ->> 'durasi_menit')::integer, 0),
                v_mulai)
        on conflict (user_id, sumber, external_id) do update
          set nama = excluded.nama, jenis = excluded.jenis, durasi_menit = excluded.durasi_menit
        returning id into v_workout;

        delete from public.workout_sets where workout_id = v_workout;
        v_li := 0;
        for v_l in select e from jsonb_array_elements(coalesce(v_e -> 'latihan', '[]')) as y (e) loop
          v_li := v_li + 1;
          for v_set in select e from jsonb_array_elements(coalesce(v_l -> 'sets', '[]')) as z (e) loop
            insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, jenis_set, beban_kg, reps)
            values (v_workout, v_user, left(v_l ->> 'latihan', 120), v_li, (v_set ->> 'set_ke')::integer,
                    coalesce(v_set ->> 'jenis', 'normal'), (v_set ->> 'beban_kg')::numeric, (v_set ->> 'reps')::integer);
          end loop;
        end loop;
        v_simpan := v_simpan + 1;
      exception
        when check_violation or not_null_violation or unique_violation or data_exception then
          v_lewati := v_lewati + 1;
      end;
    end loop;

  -- ---------------- Ukuran lama: satu baris per tanggal ----------------------
  elsif v_job.sumber = 'ukuran_lama' then
    v_n := jsonb_array_length(coalesce(p_isi -> 'baris', '[]'));
    if v_n > public.maks_isi_batch_impor(v_job.sumber) then
      raise exception 'Potongan terlalu besar (% baris)', v_n using errcode = '22023';
    end if;

    for v_e in select e from jsonb_array_elements(coalesce(p_isi -> 'baris', '[]')) as x (e) loop
      begin
        insert into public.body_measurements (
          user_id, tanggal, pinggang_cm, dada_cm, leher_cm,
          lengan_kiri_cm, lengan_kanan_cm, paha_kiri_cm, paha_kanan_cm, catatan)
        values (v_user, (v_e ->> 'tanggal')::date,
                (v_e ->> 'pinggang_cm')::numeric, (v_e ->> 'dada_cm')::numeric, (v_e ->> 'leher_cm')::numeric,
                (v_e ->> 'lengan_kiri_cm')::numeric, (v_e ->> 'lengan_kanan_cm')::numeric,
                (v_e ->> 'paha_kiri_cm')::numeric, (v_e ->> 'paha_kanan_cm')::numeric,
                'Diimpor dari riwayat')
        -- Tanggal yang sudah punya ukuran dibiarkan: catatan di app lebih baru
        -- dari berkas lama mana pun.
        on conflict (user_id, tanggal) do nothing;
        if found then v_simpan := v_simpan + 1; else v_ada := v_ada + 1; end if;
      exception
        when check_violation or not_null_violation or data_exception then
          v_lewati := v_lewati + 1;
      end;
    end loop;

  -- ---------------- Apple Health: lewat endpoint sinkron yang sama -----------
  else
    v_n := jsonb_array_length(coalesce(p_isi -> 'sampel', '[]'))
         + jsonb_array_length(coalesce(p_isi -> 'berat', '[]'))
         + jsonb_array_length(coalesce(p_isi -> 'dihapus', '[]'));
    v_h := public.sinkron_healthkit(p_isi);
    v_simpan := (v_h ->> 'disimpan')::integer
              + (select count(*) from jsonb_array_elements(v_h -> 'berat') b where b ->> 'status' = 'disimpan');
    v_ada := (select count(*) from jsonb_array_elements(v_h -> 'berat') b
               where b ->> 'status' in ('manual_dipertahankan', 'ada_yang_lebih_pagi'));
    v_lewati := jsonb_array_length(v_h -> 'dilewati')
              + (select count(*) from jsonb_array_elements(v_h -> 'berat') b where b ->> 'status' = 'bukan_pagi');
  end if;

  update public.import_jobs
     set selesai = least(total, selesai + v_n),
         hasil = jsonb_build_object(
           'disimpan', (hasil ->> 'disimpan')::integer + v_simpan,
           'sudah_ada', (hasil ->> 'sudah_ada')::integer + v_ada,
           'dilewati', (hasil ->> 'dilewati')::integer + v_lewati),
         diperbarui_pada = now()
   where id = p_job
  returning * into v_job;
  return v_job;
end;
$$;

-- --- Selesai / gagal ------------------------------------------------------------------
create or replace function public.selesaikan_impor(p_job uuid, p_galat text default null)
returns public.import_jobs
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_job public.import_jobs;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  update public.import_jobs
     set status = case when p_galat is null then 'selesai' else 'gagal' end,
         galat = case when p_galat is null then null else left(coalesce(nullif(trim(p_galat), ''), 'Impor gagal.'), 300) end,
         selesai_pada = now(),
         diperbarui_pada = now()
   where id = p_job and user_id = v_user and status = 'berjalan'
  returning * into v_job;
  if not found then
    raise exception 'Job impor tidak ditemukan atau sudah selesai' using errcode = 'P0002';
  end if;
  return v_job;
end;
$$;

/** Job terakhir per sumber — untuk kartu "sudah diimpor 12 September". */
create or replace function public.impor_terakhir()
returns setof public.import_jobs
language sql
stable
set search_path = ''
as $$
  select distinct on (j.sumber) j.*
    from public.import_jobs j
   where j.user_id = (select auth.uid())
   order by j.sumber, j.dibuat_pada desc;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.maks_isi_batch_impor(text)',
    'public.mulai_impor(text, integer, text, jsonb)',
    'public.impor_batch(uuid, jsonb)',
    'public.selesaikan_impor(uuid, text)',
    'public.impor_terakhir()'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
