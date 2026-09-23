-- ---------------------------------------------------------------------------
-- Supabase Realtime untuk data kesehatan.
--
-- YANG DIPUBLIKASIKAN adalah tabel kecil yang menandai PERUBAHAN:
--   • health_connections — sinkron_terakhir/status/galat berubah setiap kali
--     sebuah sumber selesai mengirim; ini denyut "data baru masuk";
--   • daily_logs         — berat pagi dari timbangan, makro dari perangkat lain;
--   • workouts           — latihan dari Strava/WHOOP/Hevy (tipe hari ikut berubah);
--   • import_jobs        — kemajuan impor yang dijalankan di perangkat lain.
--
-- YANG SENGAJA TIDAK:
--   • health_data — satu sinkron HealthKit bisa menulis ribuan sampel; mengirim
--     setiap baris ke setiap perangkat terbuka adalah lalu lintas tanpa guna,
--     dan angkanya MENTAH (sebelum anti-dobel). Klien yang menerima denyut dari
--     health_connections meminta `snapshot_hari_ini` — angka yang sudah
--     dipilih server — lalu menghitung selisihnya untuk banner.
--   • health_connection_secrets — tidak pernah. Diuji sebagai aturan katalog.
--
-- Realtime menerapkan RLS pada setiap perubahan yang dikirim: pelanggan hanya
-- menerima baris yang boleh ia SELECT. Semua tabel di atas sudah dibatasi
-- `user_id = auth.uid()`.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publikasi supabase_realtime tidak ada; Realtime dilewati';
    return;
  end if;
  foreach t in array array['health_connections', 'daily_logs', 'workouts', 'import_jobs'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

/**
 * Potret angka HARI INI, untuk dibandingkan klien sebelum/sesudah denyut
 * Realtime.
 *
 *   {
 *     "tanggal": "2026-09-23",
 *     "dihitung":   { langkah, kalori_aktif, tidur, latihan, berat },   -- setelah anti-dobel
 *     "per_sumber": { "<sumber>": { langkah, kalori_aktif, tidur, latihan, berat, pemulihan } }
 *   }
 *
 * `per_sumber` memakai aturan yang sama dengan anti-dobel DI DALAM sebuah
 * sumber: satu perangkat (total gabungan HealthKit bila ada, kalau tidak
 * yang terbesar) — langkah iPhone dan Watch tidak dijumlah bahkan untuk
 * kartu sumbernya sendiri. Angka yang tidak ada dihilangkan, bukan nol:
 * "0 langkah" dan "belum ada data langkah" adalah dua hal berbeda.
 */
create or replace function public.snapshot_hari_ini(p_tanggal date default null, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
  v_tgl date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_dihitung jsonb;
  v_per jsonb;
  v_latihan integer;
  v_berat jsonb;
begin
  select coalesce(jsonb_object_agg(a.jenis, a.nilai), '{}'::jsonb) into v_dihitung
    from public.agregat_kesehatan_harian(v_tgl, v_tgl, v_user) a
   where a.jenis in ('langkah', 'kalori_aktif', 'tidur');

  select count(*)::integer into v_latihan from public.latihan_terhitung(v_tgl, v_tgl, v_user);
  if v_latihan > 0 then
    v_dihitung := v_dihitung || jsonb_build_object('latihan', v_latihan);
  end if;

  select case when l.berat_pagi_kg is null then null
              else jsonb_build_object('kg', l.berat_pagi_kg, 'sumber', l.sumber_berat, 'asal', l.asal_berat) end
    into v_berat
    from public.daily_logs l
   where l.user_id = v_user and l.tanggal = v_tgl;
  if v_berat is not null then
    v_dihitung := v_dihitung || jsonb_build_object('berat', v_berat -> 'kg');
  end if;

  -- Per sumber: satu perangkat per (sumber, jenis), seperti anti-dobel.
  with d as (
    select h.sumber, h.asal, h.jenis, sum(h.nilai) as n, count(*) as c
      from public.health_data h
     where h.user_id = v_user and h.tanggal = v_tgl
     group by h.sumber, h.asal, h.jenis
  ),
  satu as (
    select distinct on (d.sumber, d.jenis) d.sumber, d.jenis, d.n, d.c
      from d
     order by d.sumber, d.jenis, (d.asal is null) desc, d.n desc, d.asal
  ),
  angka as (
    select s.sumber,
           case s.jenis when 'recovery' then 'pemulihan' else s.jenis end as kunci,
           case when s.jenis in ('langkah', 'kalori_aktif', 'tidur') then round(s.n, 2) else 1 end as nilai
      from satu s
     where s.jenis in ('langkah', 'kalori_aktif', 'tidur', 'recovery')
    union all
    select public.sumber_koneksi_latihan(w.sumber), 'latihan', count(*)
      from public.workouts w
     where w.user_id = v_user and w.tanggal = v_tgl and w.sumber <> 'manual'
     group by w.sumber
    union all
    select 'apple_health', 'berat', 1
      from public.daily_logs l
     where l.user_id = v_user and l.tanggal = v_tgl and l.sumber_berat = 'healthkit'
  )
  select coalesce(jsonb_object_agg(x.sumber, x.isi), '{}'::jsonb) into v_per
    from (select a.sumber, jsonb_object_agg(a.kunci, a.nilai) as isi from angka a group by a.sumber) x;

  return jsonb_build_object('tanggal', v_tgl, 'dihitung', v_dihitung, 'per_sumber', v_per);
end;
$$;

comment on function public.snapshot_hari_ini(date, uuid) is
  'Angka hari ini (setelah anti-dobel & per sumber) untuk dibandingkan klien saat denyut Realtime tiba.';

revoke all on function public.snapshot_hari_ini(date, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.snapshot_hari_ini(date, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.snapshot_hari_ini(date, uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.snapshot_hari_ini(date, uuid) to service_role';
  end if;
end $$;
