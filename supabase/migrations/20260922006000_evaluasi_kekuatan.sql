-- =============================================================================
-- Evaluasi 4 mingguan: sumbu kekuatan dibaca dari set latihan
--
-- Saat evaluasi dibuat, `workouts` hanya mencatat jenis latihan, jadi sumbu
-- kekuatan selalu `belum jelas` dan keyakinan tidak pernah bisa `tinggi`.
-- Sinkronisasi Hevy kini menyimpan set beserta e1RM-nya (`workout_sets.e1rm_kg`,
-- migrasi e1rm_epley), tetapi evaluasi tetap menyatakan "belum ada data beban"
-- walau datanya ada. Di sini sumbunya diturunkan dari data, dengan aturan yang
-- SAMA dengan `arahKekuatan` + `ringkasArahKekuatan` (@recomp/logika):
--
--   • titik = e1RM tertinggi satu gerakan dalam satu kemunculan di satu sesi;
--     kemunculan tanpa e1RM (berat badan, > 12 repetisi) dilewati;
--   • hanya gerakan dengan minimal dua titik di dalam periode;
--   • titik PERTAMA vs TERAKHIR menurut waktu mulai sesi (cadangan: tanggal);
--   • datar bila |selisih| < 2% dari awal, dihitung dalam persepuluhan kg
--     (bilangan bulat), naik/turun selain itu;
--   • sumbu: naik bila gerakan naik > turun, turun bila sebaliknya, datar bila
--     seri, `belum jelas` bila tidak ada gerakan yang diulang.
-- Kesamaannya dijaga `npm run cek:paritas`. Aman dijalankan ulang.
-- =============================================================================

create or replace function public.arah_kekuatan_periode(p_dari date, p_sampai date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with titik as (
    select ws.latihan,
           coalesce(w.waktu_mulai, w.tanggal::timestamp at time zone 'Asia/Jakarta') as waktu,
           w.id as sesi_id,
           ws.latihan_ke,
           max(ws.e1rm_kg) as e1rm
      from public.workouts w
      join public.workout_sets ws on ws.workout_id = w.id
     where w.user_id = (select auth.uid())
       and w.tanggal between p_dari and p_sampai
     group by ws.latihan, w.id, waktu, ws.latihan_ke
    having max(ws.e1rm_kg) is not null
  ),
  urut as (
    select latihan, e1rm,
           row_number() over (partition by latihan order by waktu, sesi_id, latihan_ke) as ke,
           count(*) over (partition by latihan) as n
      from titik
  ),
  gerakan as (
    select latihan,
           max(e1rm) filter (where ke = 1) as awal,
           max(e1rm) filter (where ke = n) as akhir
      from urut
     where n >= 2
     group by latihan
  ),
  arah as (
    select case
             when abs(round(akhir * 10) - round(awal * 10)) * 50 < round(awal * 10) then 'datar'
             when akhir > awal then 'naik'
             else 'turun'
           end as arah
      from gerakan
  ),
  hitung as (
    select count(*) filter (where arah = 'naik') as naik,
           count(*) filter (where arah = 'turun') as turun,
           count(*) filter (where arah = 'datar') as datar,
           count(*) as jumlah
      from arah
  )
  select jsonb_build_object(
    'arah', case when jumlah = 0 then 'belum jelas'
                 when naik > turun then 'naik'
                 when turun > naik then 'turun'
                 else 'datar' end,
    'naik', naik,
    'turun', turun,
    'datar', datar,
    'jumlah_gerakan', jumlah,
    -- Dinyatakan, bukan disamarkan: tanpa gerakan berbeban yang diulang,
    -- kekuatan memang tidak bisa dibaca.
    'sebab', case when jumlah = 0 then 'belum ada gerakan berbeban yang diulang dalam periode ini' end
  )
  from hitung;
$$;

comment on function public.arah_kekuatan_periode(date, date) is
  'Arah kekuatan pengguna yang masuk dalam rentang tanggal, dari e1RM gerakan yang diulang. '
  'Kembaran TS: arahKekuatan + ringkasArahKekuatan (dijaga cek:paritas).';

revoke all on function public.arah_kekuatan_periode(date, date) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.arah_kekuatan_periode(date, date) to authenticated';
  end if;
end $$;

create or replace function public.evaluasi_4_mingguan(p_sampai date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_acuan date := coalesce(p_sampai, (now() at time zone 'Asia/Jakarta')::date);
  -- Empat pekan yang SUDAH selesai: Senin empat pekan sebelum pekan ini sampai
  -- Minggu kemarin-pekan.
  v_dari date := public.awal_minggu(v_acuan) - (public.pekan_evaluasi() * 7);
  v_sampai date := public.awal_minggu(v_acuan) - 1;
  v_fase public.fase_program;
  v_berat_awal numeric;
  v_berat_akhir numeric;
  v_n_awal integer;
  v_n_akhir integer;
  v_selisih_berat numeric;
  v_pinggang_awal numeric;
  v_pinggang_akhir numeric;
  v_n_pinggang integer;
  v_selisih_pinggang numeric;
  v_pekan_data integer;
  v_arah_berat text;
  v_arah_pinggang text;
  v_arah_kekuatan text;
  v_kekuatan jsonb;
  v_verdict jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  -- Fase yang berlaku di AKHIR periode: evaluasinya menilai apakah fase itu
  -- berjalan, jadi fase yang dipakai harus fase yang sedang dinilai.
  v_fase := public.fase_pada_tanggal(v_sampai);

  -- Berat: rata-rata 7 hari di akhir pekan PERTAMA vs di akhir periode. Bukan
  -- timbangan harian di dua ujung — dua timbangan tunggal akan menjadikan
  -- goyangan air sebagai verdict empat pekan.
  select r.rata_rata_kg, r.jumlah_timbangan into v_berat_awal, v_n_awal
    from public.rata_rata_berat_7_hari(v_dari + 6) as r;
  select r.rata_rata_kg, r.jumlah_timbangan into v_berat_akhir, v_n_akhir
    from public.rata_rata_berat_7_hari(v_sampai) as r;

  -- Rata-rata dari satu-dua timbangan tidak cukup untuk dipakai sebagai ujung
  -- sebuah tren empat pekan.
  if v_n_awal >= 3 and v_n_akhir >= 3 then
    v_selisih_berat := v_berat_akhir - v_berat_awal;
  end if;
  v_arah_berat := public.arah_metrik(v_selisih_berat, public.ambang_berat_evaluasi());

  -- Pinggang: pencatatan pertama vs terakhir di dalam periode.
  select count(*) into v_n_pinggang
    from public.body_measurements
   where user_id = v_user_id and tanggal between v_dari and v_sampai
     and pinggang_cm is not null;

  if v_n_pinggang >= 2 then
    select pinggang_cm into v_pinggang_awal from public.body_measurements
     where user_id = v_user_id and tanggal between v_dari and v_sampai
       and pinggang_cm is not null
     order by tanggal asc limit 1;
    select pinggang_cm into v_pinggang_akhir from public.body_measurements
     where user_id = v_user_id and tanggal between v_dari and v_sampai
       and pinggang_cm is not null
     order by tanggal desc limit 1;
    v_selisih_pinggang := v_pinggang_akhir - v_pinggang_awal;
  end if;
  v_arah_pinggang := public.arah_metrik(v_selisih_pinggang, public.ambang_pinggang_evaluasi());

  -- Pekan yang punya setidaknya satu timbangan.
  select count(distinct public.awal_minggu(tanggal)) into v_pekan_data
    from public.daily_logs
   where user_id = v_user_id and tanggal between v_dari and v_sampai
     and berat_pagi_kg is not null;

  -- Kekuatan: e1RM tiap gerakan yang diulang, sesi pertama vs terakhir di
  -- dalam periode (sama dengan arahKekuatan + ringkasArahKekuatan di TS).
  v_kekuatan := public.arah_kekuatan_periode(v_dari, v_sampai);
  v_arah_kekuatan := v_kekuatan ->> 'arah';

  v_verdict := public.kode_evaluasi(
    v_fase, v_arah_berat, v_arah_pinggang, v_arah_kekuatan, v_pekan_data);

  return jsonb_build_object(
    'periode_dari', v_dari,
    'periode_sampai', v_sampai,
    'fase', v_fase,
    'pekan_data', v_pekan_data,
    'sumbu', jsonb_build_object(
      'berat', jsonb_build_object(
        'arah', v_arah_berat,
        'awal_kg', v_berat_awal,
        'akhir_kg', v_berat_akhir,
        'selisih_kg', v_selisih_berat,
        'ambang_kg', public.ambang_berat_evaluasi(),
        'jumlah_timbangan', jsonb_build_array(v_n_awal, v_n_akhir)
      ),
      'pinggang', jsonb_build_object(
        'arah', v_arah_pinggang,
        'awal_cm', v_pinggang_awal,
        'akhir_cm', v_pinggang_akhir,
        'selisih_cm', v_selisih_pinggang,
        'ambang_cm', public.ambang_pinggang_evaluasi(),
        'jumlah_pencatatan', v_n_pinggang
      ),
      'kekuatan', v_kekuatan
    ),
    'kode', v_verdict ->> 'kode',
    'penentu', v_verdict ->> 'penentu',
    'keyakinan', v_verdict ->> 'keyakinan'
  );
end;
$$;

comment on function public.evaluasi_4_mingguan(date) is
  'Evaluasi empat pekan terakhir yang sudah selesai: sumbu berat, pinggang, dan kekuatan '
  'diturunkan dari data (kekuatan dari e1RM gerakan yang diulang), lalu verdict dari kode_evaluasi.';
