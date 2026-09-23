-- ---------------------------------------------------------------------------
-- Estimasi TDEE dari tiga metode.
--
-- Satu angka TDEE selalu bohong: ia hasil rumus yang meleset 10–15% pada
-- individu, atau hasil data yang masih berisik. Karena itu yang dikembalikan
-- adalah RENTANG dari metode-metode yang benar-benar bisa dihitung, beserta
-- tingkat keyakinannya.
--
-- Pembagian tugas dengan @recomp/logika disengaja dan bukan duplikasi:
--   • SQL MENGUMPULKAN masukannya dari data (rata-rata 7 hari, asupan, tipe
--     hari yang dijalani, profil) dan MENGHITUNG angkanya, karena widget lock
--     screen dan AI coach membaca TDEE tanpa bisa menjalankan TypeScript.
--   • Kalimatnya — `dasar` tiap metode dan `alasan_keyakinan` — TIDAK disusun
--     di sini. Kalimat itu memuat angka berformat Indonesia, dan dua penyusun
--     kalimat pasti berbeda tanda bacanya. Server mengirim masukan + angka;
--     `estimasiTdee` di @recomp/logika menyusun kalimatnya dari masukan yang
--     SAMA, dan `npm run cek:paritas` membuktikan angkanya identik.
--
-- Metode berbasis DATA NYATA mengalahkan rumus mana pun begitu datanya cukup,
-- karena ia mengukur tubuh orang ini, bukan rata-rata populasi. Itu sebabnya
-- keyakinan tidak pernah 'tinggi' tanpa metode itu.
-- ---------------------------------------------------------------------------

-- --- Konstanta bersama -----------------------------------------------------
-- Energi per kg perubahan berat badan; angka lazim untuk jaringan campuran.
create or replace function public.kcal_per_kg()
returns integer
language sql
immutable
set search_path = ''
as $$ select 7700; $$;

-- Pengali aktivitas per tipe hari. Tipe hari yang tidak dikenal memakai 1,5 —
-- sama dengan PENGALI_AKTIVITAS di @recomp/logika, termasuk cadangannya.
create or replace function public.pengali_aktivitas(p_nama text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case p_nama
           when 'Rest' then 1.35
           when 'Angkat Beban' then 1.55
           when 'Beban+Lari' then 1.7
           when 'Padel' then 1.65
           else 1.5
         end::double precision;
$$;

comment on function public.pengali_aktivitas(text) is
  'Pengali aktivitas satu tipe hari. Sama dengan PENGALI_AKTIVITAS di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Estimasi TDEE
--
-- @param p_sampai      hari terakhir periode; null = hari ini Asia/Jakarta.
-- @param p_hari        panjang periode data.
-- @param p_persen_lemak persen lemak tubuh bila diketahui. Diminta sebagai
--   argumen karena estimasi body fat belum punya tabel di server; begitu
--   tabel ukuran ada, nilainya diambil dari sana dan argumen ini jadi
--   penimpa saja.
-- ---------------------------------------------------------------------------
create or replace function public.estimasi_tdee(
  p_sampai date default null,
  p_hari integer default 14,
  p_persen_lemak numeric default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sampai date := coalesce(p_sampai, (now() at time zone 'Asia/Jakarta')::date);
  v_dari date;
  v_profil public.profiles;
  v_berat float8;
  v_berat_awal float8;
  v_usia integer;
  v_pengali float8;
  v_tipe_hari text[];
  v_hari_tercatat integer;
  v_hari_data integer;
  v_asupan float8;
  v_perubahan float8;
  v_pertama date;
  v_terakhir date;
  v_metode jsonb := '[]'::jsonb;
  v_nilai integer[] := '{}';
  v_bmr float8;
  v_lbm float8;
  v_energi float8;
  v_min integer;
  v_maks integer;
  v_tengah integer;
  v_ada_data boolean := false;
  v_keyakinan text;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_hari is null or p_hari < 7 or p_hari > 180 then
    raise exception 'Periode data harus 7–180 hari' using errcode = '22003';
  end if;

  v_dari := v_sampai - (p_hari - 1);

  select * into v_profil from public.profiles where user_id = v_user_id;

  -- Berat yang dipakai rumus adalah RATA-RATA 7 HARI, bukan timbangan hari itu.
  -- Rumus yang berangkat dari angka harian mewarisi goyangan air sebagai
  -- dasarnya, dan BMR-nya ikut bergoyang tanpa ada yang berubah pada tubuh.
  select r.rata_rata_kg::float8 into v_berat
    from public.rata_rata_berat_7_hari(v_sampai) as r;

  if v_profil.tanggal_lahir is not null then
    v_usia := extract(year from age(v_sampai, v_profil.tanggal_lahir))::integer;
  end if;

  -- Tipe hari yang BENAR-BENAR dijalani dalam periode; hari tanpa catatan tidak
  -- dihitung sebagai Rest, karena "tidak dicatat" bukan berarti "istirahat".
  select array_agg(dt.nama order by l.tanggal)
    into v_tipe_hari
    from public.daily_logs l
    join public.day_types dt on dt.id = l.day_type_id
   where l.user_id = v_user_id and l.tanggal between v_dari and v_sampai;
  v_tipe_hari := coalesce(v_tipe_hari, '{}');

  -- Sama dengan pengaliRataRata: rata-rata dari tipe hari yang ada, 1,5 bila
  -- tidak ada satu pun.
  if array_length(v_tipe_hari, 1) is null then
    v_pengali := 1.5;
  else
    select sum(public.pengali_aktivitas(n)) / count(*) into v_pengali
      from unnest(v_tipe_hari) as n;
  end if;

  -- --- Cakupan data asupan -------------------------------------------------
  select count(*)::integer, min(l.tanggal), max(l.tanggal), avg(l.kalori)::float8
    into v_hari_tercatat, v_pertama, v_terakhir, v_asupan
    from public.daily_logs l
   where l.user_id = v_user_id
     and l.tanggal between v_dari and v_sampai
     and coalesce(l.kalori, 0) > 0;

  -- Periode data adalah RENTANG antara catatan pertama dan terakhir, supaya
  -- energi per hari dibagi dengan rentang yang sama dengan rentang perubahan
  -- beratnya. Membaginya dengan panjang periode yang diminta akan mencampur
  -- dua rentang berbeda, dan hasilnya tidak berarti apa pun.
  if v_hari_tercatat >= 7 then
    v_hari_data := (v_terakhir - v_pertama) + 1;
    select r.rata_rata_kg::float8 into v_berat_awal
      from public.rata_rata_berat_7_hari(v_pertama) as r;
    if v_berat_awal is not null then
      select r.rata_rata_kg::float8 into v_perubahan
        from public.rata_rata_berat_7_hari(v_terakhir) as r;
      v_perubahan := v_perubahan - v_berat_awal;
    end if;
  else
    -- Kurang dari tujuh hari tercatat: masukan metode data DIKOSONGKAN, supaya
    -- aturan ambangnya tetap satu tempat (di @recomp/logika) dan tidak ada
    -- jalan bagi catatan yang jarang untuk lolos lewat rentang yang panjang.
    v_hari_data := v_hari_tercatat;
    v_asupan := null;
  end if;

  -- --- Metode 1: Mifflin-St Jeor × pengali aktivitas -----------------------
  if v_berat is not null and v_usia is not null
     and v_profil.tinggi_cm is not null and v_profil.jenis_kelamin is not null then
    v_bmr := 10 * v_berat
           + 6.25 * v_profil.tinggi_cm::float8
           - 5 * v_usia::float8
           + case when v_profil.jenis_kelamin = 'pria' then 5 else -161 end;
    v_metode := v_metode || jsonb_build_object(
      'nama', 'Mifflin-St Jeor',
      'nilai', floor(v_bmr * v_pengali + 0.5)::integer,
      'berbasis_data', false,
      'bmr', round(v_bmr::numeric, 4),
      'pengali', round(v_pengali::numeric, 6)
    );
    v_nilai := v_nilai || floor(v_bmr * v_pengali + 0.5)::integer;
  end if;

  -- --- Metode 2: Katch-McArdle × pengali aktivitas -------------------------
  -- Memakai massa tanpa lemak, jadi lebih baik daripada Mifflin bila body fat
  -- diketahui — dan lebih buruk bila body fat-nya sendiri hanya tebakan.
  if v_berat is not null and p_persen_lemak is not null then
    v_lbm := v_berat * (1 - p_persen_lemak::float8 / 100);
    v_bmr := 370 + 21.6 * v_lbm;
    v_metode := v_metode || jsonb_build_object(
      'nama', 'Katch-McArdle',
      'nilai', floor(v_bmr * v_pengali + 0.5)::integer,
      'berbasis_data', false,
      'lbm_kg', round(v_lbm::numeric, 4),
      'bmr', round(v_bmr::numeric, 4),
      'pengali', round(v_pengali::numeric, 6)
    );
    v_nilai := v_nilai || floor(v_bmr * v_pengali + 0.5)::integer;
  end if;

  -- --- Metode 3: dari data nyata ------------------------------------------
  -- TDEE = rata-rata asupan + energi yang tersimpan/terpakai sebagai berat.
  -- Satu-satunya metode yang mengukur tubuh orang INI.
  if v_hari_data >= 7 and v_asupan is not null and v_perubahan is not null then
    v_energi := (v_perubahan * public.kcal_per_kg()::float8) / v_hari_data;
    v_metode := v_metode || jsonb_build_object(
      'nama', 'Dari data Anda',
      'nilai', floor(v_asupan - v_energi + 0.5)::integer,
      'berbasis_data', true,
      'energi_berat_kcal_per_hari', round(v_energi::numeric, 4)
    );
    v_nilai := v_nilai || floor(v_asupan - v_energi + 0.5)::integer;
    v_ada_data := true;
  end if;

  if array_length(v_nilai, 1) is null then
    v_keyakinan := 'rendah';
  else
    select min(n), max(n), floor(sum(n)::float8 / count(*) + 0.5)::integer
      into v_min, v_maks, v_tengah
      from unnest(v_nilai) as n;

    -- Dua hal menentukan keyakinan: apakah metode berbasis data ikut
    -- terhitung, dan seberapa lebar rentangnya. Rentang lebar berarti
    -- metode-metodenya tidak sepakat, dan itu sendiri sebuah informasi.
    if not v_ada_data then
      v_keyakinan := 'rendah';
    elsif v_hari_data >= 14 and (v_maks - v_min) <= 400 then
      v_keyakinan := 'tinggi';
    else
      v_keyakinan := 'sedang';
    end if;
  end if;

  return jsonb_build_object(
    'dari', v_dari,
    'sampai', v_sampai,
    'masukan', jsonb_build_object(
      'berat_kg', v_berat,
      'tinggi_cm', v_profil.tinggi_cm,
      'usia_tahun', v_usia,
      'jenis_kelamin', v_profil.jenis_kelamin,
      'persen_lemak', p_persen_lemak,
      'tipe_hari_minggu', to_jsonb(v_tipe_hari),
      'hari_data', v_hari_data,
      'rata_asupan_kalori', v_asupan,
      'perubahan_berat_kg', case when v_asupan is null then null
                                 else round(v_perubahan::numeric, 2) end
    ),
    'hari_tercatat', v_hari_tercatat,
    'pengali_aktivitas', round(v_pengali::numeric, 6),
    'kcal_per_kg', public.kcal_per_kg(),
    'metode', v_metode,
    'min', v_min,
    'maks', v_maks,
    'tengah', v_tengah,
    'lebar', case when v_min is null then null else v_maks - v_min end,
    'keyakinan', v_keyakinan
  );
end;
$$;

comment on function public.estimasi_tdee(date, integer, numeric) is
  'Estimasi TDEE sebagai rentang dari metode yang bisa dihitung, beserta '
  'masukan yang dipakai. Angkanya identik dengan estimasiTdee di '
  '@recomp/logika; kalimat penjelasnya disusun di sana, bukan di sini.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.kcal_per_kg() from public;
revoke all on function public.pengali_aktivitas(text) from public;
revoke all on function public.estimasi_tdee(date, integer, numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.kcal_per_kg() to authenticated';
    execute 'grant execute on function public.pengali_aktivitas(text) to authenticated';
    execute 'grant execute on function public.estimasi_tdee(date, integer, numeric) to authenticated';
  end if;
end $$;
