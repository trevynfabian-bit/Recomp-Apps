-- =============================================================================
-- Endpoint e1RM per gerakan
--
-- Layar Latihan dan Coach butuh jawaban "gerakan mana yang makin kuat" tanpa
-- memuat seluruh set lalu menghitung sendiri. Endpoint ini mengembalikan, untuk
-- pengguna yang masuk dan rentang tanggal yang diminta, setiap gerakan dengan
-- titik e1RM-nya (satu per kemunculan di satu sesi, e1RM set terbaik), ujung
-- awal & akhir, selisih, e1RM terbaik, dan arahnya.
--
-- Aturannya SAMA dengan `arahKekuatan` (@recomp/logika), dan
-- `arah_kekuatan_periode` (sumbu kekuatan evaluasi) kini diturunkan dari sini,
-- jadi hanya ada satu aturan di database:
--   • kemunculan tanpa e1RM (berat badan, > 12 repetisi) dilewati;
--   • arah hanya untuk gerakan dengan minimal dua titik; gerakan satu titik
--     tetap dikirim (titiknya berguna di layar) dengan arah null;
--   • urutan waktu: waktu mulai sesi (cadangan: tanggal), lalu urutan latihan;
--   • datar bila |selisih| < 2% dari awal, dalam persepuluhan kg.
--
-- Masukan: tanggal wajib (22004), awal ≤ akhir (22007), paling panjang 400
-- hari (22003) — sama dengan `tren_berat_7_hari`. Aman dijalankan ulang.
-- =============================================================================

create or replace function public.e1rm_per_gerakan(p_dari date, p_sampai date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_gerakan jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_dari is null or p_sampai is null then
    raise exception 'Rentang tanggal tidak boleh kosong' using errcode = '22004';
  end if;
  if p_dari > p_sampai then
    raise exception 'Tanggal awal % melewati tanggal akhir %', p_dari, p_sampai using errcode = '22007';
  end if;
  if p_sampai - p_dari + 1 > 400 then
    raise exception 'Rentang paling panjang 400 hari; diminta % hari', p_sampai - p_dari + 1 using errcode = '22003';
  end if;

  with titik as (
    select ws.latihan,
           w.tanggal,
           coalesce(w.waktu_mulai, w.tanggal::timestamp at time zone 'Asia/Jakarta') as waktu,
           w.id as sesi_id,
           ws.latihan_ke,
           max(ws.e1rm_kg) as e1rm
      from public.workouts w
      join public.workout_sets ws on ws.workout_id = w.id
     where w.user_id = v_user_id
       and w.tanggal between p_dari and p_sampai
     group by ws.latihan, w.tanggal, waktu, w.id, ws.latihan_ke
    having max(ws.e1rm_kg) is not null
  ),
  urut as (
    select t.*,
           row_number() over (partition by latihan order by waktu, sesi_id, latihan_ke) as ke,
           count(*) over (partition by latihan) as n
      from titik t
  ),
  per as (
    select latihan,
           max(e1rm) filter (where ke = 1) as awal,
           max(e1rm) filter (where ke = n) as akhir,
           max(e1rm) as terbaik,
           max(n)::integer as n,
           jsonb_agg(jsonb_build_object('tanggal', tanggal, 'e1rm_kg', e1rm) order by ke) as deret
      from urut
     group by latihan
  ),
  berarah as (
    select p.*,
           case
             when n < 2 then null
             when abs(round(akhir * 10) - round(awal * 10)) * 50 < round(awal * 10) then 'datar'
             when akhir > awal then 'naik'
             else 'turun'
           end as arah
      from per p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'latihan', latihan,
           'arah', arah,
           'awal_kg', awal,
           'akhir_kg', akhir,
           'selisih_kg', case when n >= 2 then akhir - awal end,
           'terbaik_kg', terbaik,
           'jumlah_sesi', n,
           'titik', deret
         ) order by case arah when 'naik' then 0 when 'turun' then 1 when 'datar' then 2 else 3 end, lower(latihan), latihan),
         '[]'::jsonb)
    into v_gerakan
    from berarah;

  return jsonb_build_object(
    'periode_dari', p_dari,
    'periode_sampai', p_sampai,
    'gerakan', v_gerakan,
    'naik', (select count(*) from jsonb_array_elements(v_gerakan) g where g->>'arah' = 'naik'),
    'turun', (select count(*) from jsonb_array_elements(v_gerakan) g where g->>'arah' = 'turun'),
    'datar', (select count(*) from jsonb_array_elements(v_gerakan) g where g->>'arah' = 'datar')
  );
end;
$$;

comment on function public.e1rm_per_gerakan(date, date) is
  'e1RM per gerakan dalam rentang tanggal: titik per sesi, awal/akhir/terbaik, selisih, arah. '
  'Kembaran TS: arahKekuatan (dijaga cek:paritas).';

-- Sumbu kekuatan evaluasi: satu aturan, diturunkan dari endpoint di atas.
create or replace function public.arah_kekuatan_periode(p_dari date, p_sampai date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  r jsonb := public.e1rm_per_gerakan(p_dari, p_sampai);
  v_naik integer := (r->>'naik')::integer;
  v_turun integer := (r->>'turun')::integer;
  v_datar integer := (r->>'datar')::integer;
  v_jumlah integer := v_naik + v_turun + v_datar;
begin
  return jsonb_build_object(
    'arah', case when v_jumlah = 0 then 'belum jelas'
                 when v_naik > v_turun then 'naik'
                 when v_turun > v_naik then 'turun'
                 else 'datar' end,
    'naik', v_naik,
    'turun', v_turun,
    'datar', v_datar,
    'jumlah_gerakan', v_jumlah,
    'sebab', case when v_jumlah = 0 then 'belum ada gerakan berbeban yang diulang dalam periode ini' end
  );
end;
$$;

revoke all on function public.e1rm_per_gerakan(date, date) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.e1rm_per_gerakan(date, date) to authenticated';
  end if;
end $$;
