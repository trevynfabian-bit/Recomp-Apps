-- ---------------------------------------------------------------------------
-- Koridor target & posisi berat terhadapnya.
--
-- Koridor sebelumnya hanya hidup di `@recomp/logika`, dan itu cukup selama
-- yang menggambarnya app. Dua pemakai lain tidak bisa menjalankan TypeScript
-- sama sekali: widget lock screen (WidgetKit) dan AI coach, yang mengambil
-- angkanya lewat function calling ke database. Kalau koridor hanya ada di
-- klien, keduanya akan menampilkan batas yang dihitung dengan aturan lain.
--
-- Dua salinan aturan berarti dua tempat yang bisa menyimpang. Itu diterima di
-- sini karena tidak ada alternatifnya, TAPI dijaga mesin: `npm run cek:paritas`
-- membandingkan tiap titik koridor SQL dengan koridor TypeScript.
--
-- Aritmetikanya sengaja memakai float8 (bukan numeric) persis seperti
-- JavaScript: laju majemuk `(1 + laju) ^ (hari/7)` dihitung di presisi yang
-- sama, lalu baru dibulatkan ke 2 desimal. Memakai numeric di sini justru
-- membuat SQL LEBIH presisi daripada TypeScript — dan perbedaan presisi
-- adalah cara paling halus untuk menghasilkan dua angka yang tidak sama.
-- ---------------------------------------------------------------------------

-- Laju per minggu sebagai PERSEN BERAT BADAN, bukan kilogram tetap: laju yang
-- wajar bagi orang 60 kg berbeda dari orang 100 kg. Angkanya harus sama persis
-- dengan LAJU_PER_MINGGU di @recomp/logika.
create or replace function public.laju_fase(p_fase public.fase_program)
returns table (min_per_minggu double precision, maks_per_minggu double precision)
language sql
immutable
set search_path = ''
as $$
  select
    case p_fase
      when 'Lean Gain' then 0.0025
      when 'Cut' then -0.01
      else -0.002
    end,
    case p_fase
      when 'Lean Gain' then 0.005
      when 'Cut' then -0.005
      else 0.002
    end;
$$;

comment on function public.laju_fase(public.fase_program) is
  'Laju perubahan berat per minggu (fraksi berat badan) untuk tiap fase. '
  'Harus sama persis dengan LAJU_PER_MINGGU di @recomp/logika.';

-- ---------------------------------------------------------------------------
create or replace function public.koridor_target(
  p_berat_jangkar_kg numeric,
  p_tanggal_jangkar date,
  p_fase public.fase_program,
  p_jumlah_hari integer
)
returns table (tanggal date, bawah_kg numeric, atas_kg numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_min double precision;
  v_maks double precision;
  v_jangkar double precision;
begin
  if p_berat_jangkar_kg is null or p_tanggal_jangkar is null then
    raise exception 'Jangkar koridor tidak boleh kosong' using errcode = '22004';
  end if;
  if p_jumlah_hari is null or p_jumlah_hari < 1 or p_jumlah_hari > 400 then
    raise exception 'Panjang koridor harus 1–400 hari; diminta %', p_jumlah_hari
      using errcode = '22003';
  end if;

  select l.min_per_minggu, l.maks_per_minggu into v_min, v_maks
    from public.laju_fase(p_fase) l;
  v_jangkar := p_berat_jangkar_kg::double precision;

  return query
  select
    p_tanggal_jangkar + h,
    -- min/maks ditentukan NILAINYA, bukan namanya: pada fase Cut keduanya
    -- negatif, sehingga batas "bawah" justru berasal dari laju maks.
    round(least(
      v_jangkar * power(1 + v_min, h / 7.0),
      v_jangkar * power(1 + v_maks, h / 7.0)
    )::numeric, 2),
    round(greatest(
      v_jangkar * power(1 + v_min, h / 7.0),
      v_jangkar * power(1 + v_maks, h / 7.0)
    )::numeric, 2)
  from generate_series(0, p_jumlah_hari - 1) as h;
end;
$$;

comment on function public.koridor_target(numeric, date, public.fase_program, integer) is
  'Koridor target harian dari satu titik jangkar, memakai laju majemuk per '
  'minggu. Identik dengan koridorTarget di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Posisi rata-rata berat terhadap koridor pada satu tanggal.
-- Nadanya deskriptif: "di atas koridor", bukan penilaian atas tubuh.
-- ---------------------------------------------------------------------------
create or replace function public.status_koridor(
  p_berat_jangkar_kg numeric,
  p_tanggal_jangkar date,
  p_fase public.fase_program,
  p_tanggal date,
  p_rata_rata_kg numeric
)
returns table (
  posisi text,
  selisih_kg numeric,
  bawah_kg numeric,
  atas_kg numeric
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hari integer;
  v_bawah numeric;
  v_atas numeric;
begin
  if p_berat_jangkar_kg is null or p_tanggal_jangkar is null
     or p_tanggal is null or p_rata_rata_kg is null then
    return query select 'belum bisa dinilai'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  v_hari := p_tanggal - p_tanggal_jangkar;
  -- Tanggal sebelum jangkar tidak punya titik koridor sama sekali; itu bukan
  -- "di dalam koridor", melainkan tidak bisa dinilai.
  if v_hari < 0 then
    return query select 'belum bisa dinilai'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  select k.bawah_kg, k.atas_kg into v_bawah, v_atas
    from public.koridor_target(p_berat_jangkar_kg, p_tanggal_jangkar, p_fase, v_hari + 1) k
    where k.tanggal = p_tanggal;

  if v_bawah is null then
    return query select 'belum bisa dinilai'::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  if p_rata_rata_kg < v_bawah then
    return query select 'di bawah koridor'::text, round(p_rata_rata_kg - v_bawah, 2), v_bawah, v_atas;
  elsif p_rata_rata_kg > v_atas then
    return query select 'di atas koridor'::text, round(p_rata_rata_kg - v_atas, 2), v_bawah, v_atas;
  else
    return query select 'di dalam koridor'::text, 0::numeric, v_bawah, v_atas;
  end if;
end;
$$;

comment on function public.status_koridor(numeric, date, public.fase_program, date, numeric) is
  'Posisi rata-rata berat terhadap koridor pada satu tanggal. Identik dengan '
  'statusKoridor di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Endpoint gabungan ikut membawa koridornya, supaya layar Tren tetap satu
-- panggilan dan grafik tidak pernah menggambar pita yang berasal dari
-- snapshot berbeda dengan garisnya.
-- ---------------------------------------------------------------------------
create or replace function public.tren_berat_7_hari(
  p_sampai date,
  p_hari integer default 14
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_jendela constant integer := 7;
  v_ambang constant numeric := 0.2;
  v_dari date;
  v_deret jsonb;
  v_rata numeric;
  v_n integer;
  v_rata_lalu numeric;
  v_n_lalu integer;
  v_perubahan numeric;
  v_arah text;
  v_total integer;
  v_pertama date;
  v_hari_lagi integer;
  v_fase public.fase_program;
  v_jangkar_tanggal date;
  v_jangkar_berat numeric;
  v_koridor jsonb;
  v_status jsonb;
  v_panjang integer;
begin
  if p_sampai is null then
    raise exception 'Tanggal akhir tidak boleh kosong' using errcode = '22004';
  end if;
  if p_hari is null or p_hari < 1 or p_hari > 400 then
    raise exception 'Panjang periode harus 1–400 hari; diminta %', p_hari
      using errcode = '22003';
  end if;

  v_dari := p_sampai - (p_hari - 1);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'tanggal', d.tanggal,
               'rata_rata_kg', d.rata_rata_kg,
               'jumlah_timbangan', d.jumlah_timbangan,
               'berat_harian_kg', d.berat_harian_kg
             )
             order by d.tanggal
           ),
           '[]'::jsonb
         )
    into v_deret
    from public.deret_rata_rata_7_hari(v_dari, p_sampai) d;

  select r.rata_rata_kg, r.jumlah_timbangan
    into v_rata, v_n
    from public.rata_rata_berat_7_hari(p_sampai) r;

  select r.rata_rata_kg, r.jumlah_timbangan
    into v_rata_lalu, v_n_lalu
    from public.rata_rata_berat_7_hari(p_sampai - v_jendela) r;

  if v_rata is null or v_rata_lalu is null then
    v_arah := 'belum cukup data';
    v_perubahan := null;
  else
    v_perubahan := round(v_rata - v_rata_lalu, 2);
    if abs(v_perubahan) < v_ambang then
      v_arah := 'datar';
    elsif v_perubahan > 0 then
      v_arah := 'naik';
    else
      v_arah := 'turun';
    end if;
  end if;

  select count(*)::integer, min(l.tanggal)
    into v_total, v_pertama
    from public.daily_logs l
    where l.user_id = (select auth.uid())
      and l.berat_pagi_kg is not null
      and l.tanggal >= v_dari
      and l.tanggal <= p_sampai;

  if v_n > 0 and v_n_lalu > 0 then
    v_hari_lagi := 0;
  elsif v_pertama is null then
    v_hari_lagi := null;
  else
    v_hari_lagi := greatest((v_pertama + v_jendela) - p_sampai, 0);
  end if;

  select p.fase_aktif, p.fase_mulai_tanggal, p.fase_berat_awal_kg
    into v_fase, v_jangkar_tanggal, v_jangkar_berat
    from public.profiles p
    where p.user_id = (select auth.uid());

  if v_jangkar_tanggal is null or v_jangkar_berat is null then
    select l.tanggal, l.berat_pagi_kg
      into v_jangkar_tanggal, v_jangkar_berat
      from public.daily_logs l
      where l.user_id = (select auth.uid())
        and l.berat_pagi_kg is not null
      order by l.tanggal
      limit 1;
  end if;

  -- Koridor hanya dikirim sepanjang rentang yang digambar; mengirim seluruh
  -- 60 hari lalu membuangnya di klien cuma membesarkan muatan tanpa guna.
  if v_jangkar_tanggal is not null and v_jangkar_berat is not null then
    v_panjang := greatest(p_sampai - v_jangkar_tanggal + 1, 1);
    if v_panjang > 400 then
      v_panjang := 400;
    end if;

    select coalesce(
             jsonb_agg(
               jsonb_build_object('tanggal', k.tanggal, 'bawah_kg', k.bawah_kg, 'atas_kg', k.atas_kg)
               order by k.tanggal
             ),
             '[]'::jsonb
           )
      into v_koridor
      from public.koridor_target(v_jangkar_berat, v_jangkar_tanggal, v_fase, v_panjang) k
      where k.tanggal >= v_dari and k.tanggal <= p_sampai;

    select jsonb_build_object(
             'posisi', s.posisi,
             'selisih_kg', s.selisih_kg,
             'bawah_kg', s.bawah_kg,
             'atas_kg', s.atas_kg
           )
      into v_status
      from public.status_koridor(v_jangkar_berat, v_jangkar_tanggal, v_fase, p_sampai, v_rata) s;
  else
    v_koridor := '[]'::jsonb;
    v_status := jsonb_build_object(
      'posisi', 'belum bisa dinilai', 'selisih_kg', null, 'bawah_kg', null, 'atas_kg', null
    );
  end if;

  return jsonb_build_object(
    'dari', v_dari,
    'sampai', p_sampai,
    'deret', v_deret,
    'rata_rata', jsonb_build_object(
      'tanggal', p_sampai,
      'rata_rata_kg', v_rata,
      'jumlah_timbangan', coalesce(v_n, 0)
    ),
    'sepekan_lalu', jsonb_build_object(
      'tanggal', p_sampai - v_jendela,
      'rata_rata_kg', v_rata_lalu,
      'jumlah_timbangan', coalesce(v_n_lalu, 0)
    ),
    'arah', jsonb_build_object(
      'arah', v_arah,
      'perubahan_kg', v_perubahan,
      'ambang_kg', v_ambang
    ),
    'kecukupan', jsonb_build_object(
      'ada_timbangan', coalesce(v_total, 0) > 0,
      'jumlah_total', coalesce(v_total, 0),
      'jumlah_dalam_jendela', coalesce(v_n, 0),
      'cukup_rata_rata', coalesce(v_n, 0) > 0,
      'jendela_penuh', coalesce(v_n, 0) >= v_jendela,
      'cukup_arah', coalesce(v_n, 0) > 0 and coalesce(v_n_lalu, 0) > 0,
      'hari_lagi_untuk_arah', v_hari_lagi
    ),
    'jangkar_fase', case
      when v_jangkar_tanggal is null then null
      else jsonb_build_object(
        'fase', v_fase,
        'tanggal_mulai', v_jangkar_tanggal,
        'berat_awal_kg', v_jangkar_berat
      )
    end,
    'koridor', v_koridor,
    'status_koridor', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.laju_fase(public.fase_program) from public;
revoke all on function public.koridor_target(numeric, date, public.fase_program, integer) from public;
revoke all on function public.status_koridor(numeric, date, public.fase_program, date, numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.laju_fase(public.fase_program) to authenticated';
    execute 'grant execute on function public.koridor_target(numeric, date, public.fase_program, integer) to authenticated';
    execute 'grant execute on function public.status_koridor(numeric, date, public.fase_program, date, numeric) to authenticated';
  end if;
end $$;
