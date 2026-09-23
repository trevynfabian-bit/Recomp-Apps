-- ---------------------------------------------------------------------------
-- Anti-dobel antar sumber (source_priority) dan agregasi harian.
--
-- Janji di layar Sumber data: "Kalau dua perangkat mencatat olahraga yang
-- sama, hanya sumber dengan prioritas tertinggi yang dihitung untuk olahraga
-- itu di hari itu. Langkah dan energi aktif memakai total dari satu sumber
-- saja, tidak pernah dijumlahkan antar perangkat." Berkas ini yang
-- menepatinya.
--
-- Contoh yang dicegah: lari pagi direkam Apple Watch, terunggah ke Strava,
-- dan juga tertangkap strap WHOOP. Tiga baris untuk SATU lari. Menjumlahkan
-- energinya membuat TDEE naik ~800 kcal dari satu sesi; menghitung sesinya
-- membuat ringkasan mingguan berkata "3 sesi lari".
--
-- Aturannya satu, untuk semua jenis:
--   per (hari, olahraga/jenis) → SATU sumber: yang peringkatnya tertinggi di
--   antara sumber yang punya data hari itu. Di dalam sumber itu → SATU asal
--   (perangkat): total gabungan HealthKit bila ada, kalau tidak yang
--   totalnya terbesar (untuk angka yang dijumlah) atau sampelnya terbanyak
--   (untuk angka rata-rata seperti HR istirahat). Tidak ada angka yang
--   pernah dijumlahkan antar sumber ATAU antar perangkat.
--
-- Dihitung SAAT DIBACA, tidak disimpan sebagai kolom `dihitung`. Kolom yang
-- disimpan harus dihitung ulang setiap kali data baru masuk ATAU pengguna
-- mengubah urutan prioritas — dan kolom yang lupa dihitung ulang adalah
-- angka basi yang terlihat benar. `data_kesehatan_terhitung` memberi jejak
-- audit yang sama (peringkat + dihitung per baris) tanpa bisa basi.
-- ---------------------------------------------------------------------------

-- --- Peringkat bawaan -------------------------------------------------------
-- Makin tinggi makin diutamakan. Alasannya, per kelompok:
--   • `manual` menang untuk latihan: pengguna mengetiknya dengan sengaja.
--   • Angkat beban: Hevy adalah catatan latihan resminya (PRD).
--   • Lari: Strava (GPS, app khusus) lalu jam tangan.
--   • Padel & lainnya: sensor detak jantung yang dipakai sepanjang sesi.
--   • Energi aktif harian: Apple Health dulu. Strava TERAKHIR — ia hanya
--     tahu energi aktivitas yang direkam, bukan sepanjang hari; menang atas
--     jam tangan berarti hari itu kehilangan semua gerak di luar lari.
--   • Tidur, HR istirahat, HRV: WHOOP (strap yang dipakai tidur).
-- Pengguna bisa mengubah urutan per olahraga (`atur_prioritas_sumber`).
create or replace function public.rank_bawaan(p_olahraga text, p_sumber text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case p_olahraga
      when 'angkat_beban' then
        case p_sumber when 'manual' then 50 when 'hevy' then 40 when 'whoop' then 30
                      when 'apple_health' then 20 when 'strava' then 10 end
      when 'lari' then
        case p_sumber when 'manual' then 50 when 'strava' then 40 when 'apple_health' then 30
                      when 'whoop' then 20 when 'hevy' then 10 end
      when 'padel' then
        case p_sumber when 'manual' then 50 when 'whoop' then 40 when 'apple_health' then 30
                      when 'strava' then 20 when 'hevy' then 10 end
      when 'lainnya' then
        case p_sumber when 'manual' then 50 when 'apple_health' then 40 when 'whoop' then 30
                      when 'strava' then 20 when 'hevy' then 10 end
      when 'kalori_aktif' then
        case p_sumber when 'apple_health' then 40 when 'whoop' then 30 when 'strava' then 20 end
      when 'langkah' then
        case p_sumber when 'apple_health' then 40 when 'whoop' then 30 when 'strava' then 20 end
      when 'tidur' then
        case p_sumber when 'whoop' then 40 when 'apple_health' then 30 end
      when 'hr_istirahat' then
        case p_sumber when 'whoop' then 40 when 'apple_health' then 30 end
      when 'hrv' then
        case p_sumber when 'whoop' then 40 when 'apple_health' then 30 end
      when 'recovery' then
        case p_sumber when 'whoop' then 40 end
      when 'strain' then
        case p_sumber when 'whoop' then 40 end
    end,
    -- Kombinasi yang tidak terduga tetap bisa dipakai bila hanya itu yang
    -- ada, tapi tidak pernah mengalahkan sumber yang dikenal.
    0);
$$;

comment on function public.rank_bawaan(text, text) is
  'Peringkat bawaan sumber per olahraga/jenis; makin tinggi makin diutamakan.';

/** Olahraga latihan (tabel workouts) — berbeda dari jenis angka (health_data). */
create or replace function public.olahraga_latihan()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['angkat_beban', 'lari', 'padel', 'lainnya'] $$;

/** Angka yang DIJUMLAH dalam sehari (bukan dirata-rata). */
create or replace function public.jenis_kesehatan_aditif()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['kalori_aktif', 'langkah', 'tidur'] $$;

-- --- Urutan pilihan pengguna ------------------------------------------------
create table if not exists public.source_priority (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  olahraga text not null,
  sumber text not null,
  rank integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint source_priority_olahraga_sah check (olahraga in (
    'angkat_beban', 'lari', 'padel', 'lainnya',
    'kalori_aktif', 'langkah', 'tidur', 'hr_istirahat', 'hrv', 'recovery', 'strain')),
  constraint source_priority_sumber_sah
    check (sumber in ('apple_health', 'whoop', 'strava', 'hevy', 'manual')),
  -- Manual & Hevy hanya membawa latihan, bukan langkah atau tidur.
  constraint source_priority_sumber_cocok
    check (sumber not in ('manual', 'hevy')
           or olahraga in ('angkat_beban', 'lari', 'padel', 'lainnya')),
  constraint source_priority_rank_wajar check (rank between 1 and 99),
  constraint source_priority_satu_per_sumber unique (user_id, olahraga, sumber),
  -- Dua sumber dengan peringkat sama = urutan yang tidak memutuskan apa pun.
  constraint source_priority_rank_unik unique (user_id, olahraga, rank)
);

comment on table public.source_priority is
  'Urutan sumber pilihan pengguna per olahraga/jenis. Tanpa baris: urutan bawaan (rank_bawaan).';

drop trigger if exists source_priority_set_updated_at on public.source_priority;
create trigger source_priority_set_updated_at
  before update on public.source_priority
  for each row execute function public.set_updated_at();

alter table public.source_priority enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'source_priority' and policyname = 'prioritas_milik_sendiri'
  ) then
    create policy prioritas_milik_sendiri on public.source_priority
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on public.source_priority to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.source_priority from anon';
  end if;
end $$;

/**
 * Peringkat efektif satu sumber untuk satu olahraga.
 *
 * Bila pengguna menyusun urutan untuk olahraga itu, urutannya MENANG atas
 * semua bawaan (+1000), dan sumber yang tidak ia sebut berada di bawahnya
 * dalam urutan bawaan. Mencampur keduanya pada skala yang sama akan membuat
 * sumber yang tidak disebut bisa mengalahkan pilihan eksplisit pengguna.
 */
create or replace function public.rank_efektif(p_user_id uuid, p_olahraga text, p_sumber text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when exists (select 1 from public.source_priority sp
                         where sp.user_id = p_user_id and sp.olahraga = p_olahraga)
           then coalesce(
                  (select 1000 + sp.rank from public.source_priority sp
                    where sp.user_id = p_user_id and sp.olahraga = p_olahraga and sp.sumber = p_sumber),
                  public.rank_bawaan(p_olahraga, p_sumber))
           else public.rank_bawaan(p_olahraga, p_sumber)
         end;
$$;

/** Urutan efektif sumber untuk satu olahraga, dari yang paling diutamakan. */
create or replace function public.urutan_prioritas(p_olahraga text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(s order by public.rank_efektif(public.pengguna_efektif(null), p_olahraga, s) desc, s)
    from unnest(case when p_olahraga = any (public.olahraga_latihan())
                     then array['manual', 'hevy', 'strava', 'whoop', 'apple_health']
                     else array['strava', 'whoop', 'apple_health'] end) as s
   where public.rank_bawaan(p_olahraga, s) > 0
      or exists (select 1 from public.source_priority sp
                  where sp.user_id = public.pengguna_efektif(null)
                    and sp.olahraga = p_olahraga and sp.sumber = s);
$$;

/**
 * Susun ulang urutan sumber untuk satu olahraga. `p_urutan` dari yang paling
 * diutamakan; array kosong = kembali ke urutan bawaan. Satu transaksi: urutan
 * lama tidak pernah setengah terganti.
 */
create or replace function public.atur_prioritas_sumber(p_olahraga text, p_urutan text[])
returns text[]
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(null);
  v_n integer := coalesce(cardinality(p_urutan), 0);
begin
  -- Sama dengan CHECK source_priority_olahraga_sah; diperiksa di sini juga
  -- karena urutan KOSONG (reset) tidak menyisipkan apa pun untuk ditolak CHECK.
  if p_olahraga is null or p_olahraga not in (
       'angkat_beban', 'lari', 'padel', 'lainnya',
       'kalori_aktif', 'langkah', 'tidur', 'hr_istirahat', 'hrv', 'recovery', 'strain') then
    raise exception 'Olahraga tidak dikenal: %', p_olahraga using errcode = '22023';
  end if;
  if v_n <> (select count(distinct s) from unnest(coalesce(p_urutan, '{}')) as s) then
    raise exception 'Urutan memuat sumber yang sama dua kali' using errcode = '22023';
  end if;
  if v_n > 5 then
    raise exception 'Urutan terlalu panjang' using errcode = '22023';
  end if;

  delete from public.source_priority where user_id = v_user and olahraga = p_olahraga;

  -- Yang pertama mendapat peringkat tertinggi. CHECK tabel yang menolak
  -- olahraga/sumber yang tidak sah.
  insert into public.source_priority (user_id, olahraga, sumber, rank)
  select v_user, p_olahraga, s, v_n - i + 1
    from unnest(coalesce(p_urutan, '{}')) with ordinality as u (s, i);

  return public.urutan_prioritas(p_olahraga);
end;
$$;

-- ---------------------------------------------------------------------------
-- Data kesehatan: jejak per baris & agregasi harian
-- ---------------------------------------------------------------------------
create or replace function public.periksa_rentang_agregasi(p_dari date, p_sampai date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_dari is null or p_sampai is null or p_dari > p_sampai then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  -- Setahun cukup untuk layar & coach; lebih dari itu hampir pasti salah panggil.
  if p_sampai - p_dari > 366 then
    raise exception 'Rentang lebih dari setahun' using errcode = '22023';
  end if;
end;
$$;

/**
 * Setiap baris health_data dalam rentang, dengan peringkat sumbernya dan
 * apakah ia DIHITUNG. Untuk audit & penjelasan ("kenapa langkah Watch yang
 * dipakai"), bukan untuk dijumlah ulang — agregasinya ada di bawah.
 */
create or replace function public.data_kesehatan_terhitung(
  p_dari date,
  p_sampai date,
  p_user_id uuid default null
)
returns table (
  id uuid,
  tanggal date,
  jenis text,
  sumber text,
  asal text,
  nilai numeric,
  satuan text,
  source_priority_rank integer,
  dihitung boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
begin
  perform public.periksa_rentang_agregasi(p_dari, p_sampai);

  return query
  with d as (
    select h.id, h.tanggal, h.jenis, h.sumber, h.asal, h.nilai, h.satuan,
           public.rank_efektif(v_user, h.jenis, h.sumber) as rank
      from public.health_data h
     where h.user_id = v_user
       and h.tanggal between p_dari and p_sampai
  ),
  per_asal as (
    select d.tanggal, d.jenis, d.sumber, d.asal, d.rank,
           case when d.jenis = any (public.jenis_kesehatan_aditif()) then sum(d.nilai) else avg(d.nilai) end as nilai,
           count(*) as n
      from d
     group by d.tanggal, d.jenis, d.sumber, d.asal, d.rank
  ),
  pemenang as (
    select distinct on (p.tanggal, p.jenis) p.tanggal, p.jenis, p.sumber, p.asal
      from per_asal p
     order by p.tanggal, p.jenis,
              p.rank desc, p.sumber,
              -- Total gabungan HealthKit (asal kosong) sudah didedup iOS sendiri.
              (p.asal is null) desc,
              case when p.jenis = any (public.jenis_kesehatan_aditif()) then p.nilai end desc nulls last,
              p.n desc,
              p.asal
  )
  select d.id, d.tanggal, d.jenis, d.sumber, d.asal, d.nilai, d.satuan, d.rank,
         (w.sumber is not null) as dihitung
    from d
    left join pemenang w
      on w.tanggal = d.tanggal and w.jenis = d.jenis
     and w.sumber = d.sumber and w.asal is not distinct from d.asal
   order by d.tanggal, d.jenis, d.rank desc, d.sumber, d.asal;
end;
$$;

/**
 * Satu angka per (hari, jenis): total dari SATU sumber dan SATU perangkat,
 * beserta sumber lain yang punya data tapi tidak dihitung.
 */
create or replace function public.agregat_kesehatan_harian(
  p_dari date,
  p_sampai date,
  p_user_id uuid default null
)
returns table (
  tanggal date,
  jenis text,
  nilai numeric,
  satuan text,
  sumber text,
  asal text,
  -- Sumber LAIN yang punya data hari itu tapi tidak dihitung.
  sumber_diabaikan text[]
)
language sql
stable
set search_path = ''
as $$
  with t as (
    select * from public.data_kesehatan_terhitung(p_dari, p_sampai, p_user_id)
  ),
  -- Baris yang dihitung selalu satu (sumber, asal) per (hari, jenis).
  hitung as (
    select w.tanggal, w.jenis,
           round(case when w.jenis = any (public.jenis_kesehatan_aditif())
                      then sum(w.nilai) else avg(w.nilai) end, 2) as nilai,
           min(w.satuan) as satuan,
           min(w.sumber) as sumber,
           min(w.asal) as asal
      from t w
     where w.dihitung
     group by w.tanggal, w.jenis
  )
  select h.tanggal, h.jenis, h.nilai, h.satuan, h.sumber, h.asal,
         coalesce((select array_agg(distinct o.sumber order by o.sumber)
                     from t o
                    where o.tanggal = h.tanggal and o.jenis = h.jenis and o.sumber <> h.sumber),
                  '{}')
    from hitung h
   order by h.tanggal, h.jenis;
$$;

comment on function public.agregat_kesehatan_harian(date, date, uuid) is
  'Angka kesehatan per hari per jenis dari satu sumber & satu perangkat (anti-dobel). '
  'Tidak pernah menjumlah antar sumber atau antar perangkat.';

-- ---------------------------------------------------------------------------
-- Latihan: per (hari, olahraga) hanya sumber teratas yang dihitung
-- ---------------------------------------------------------------------------
/** Nama sumber latihan dalam kosakata koneksi (`healthkit` → `apple_health`). */
create or replace function public.sumber_koneksi_latihan(p_sumber public.sumber_workout)
returns text
language sql
immutable
set search_path = ''
as $$ select case p_sumber when 'healthkit' then 'apple_health' else p_sumber::text end $$;

create or replace function public.latihan_terhitung(
  p_dari date,
  p_sampai date,
  p_user_id uuid default null
)
returns table (
  id uuid,
  tanggal date,
  nama text,
  jenis public.jenis_olahraga,
  sumber public.sumber_workout,
  durasi_menit integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
begin
  perform public.periksa_rentang_agregasi(p_dari, p_sampai);

  return query
  with w as (
    select x.*, public.rank_efektif(v_user, x.jenis::text, public.sumber_koneksi_latihan(x.sumber)) as rank
      from public.workouts x
     where x.user_id = v_user
       and x.tanggal between p_dari and p_sampai
  ),
  teratas as (
    select w.tanggal, w.jenis, max(w.rank) as rank
      from w
     group by w.tanggal, w.jenis
  )
  -- Semua sesi dari sumber teratas ikut: dua lari Strava di hari yang sama
  -- tetap dua sesi. Yang dibuang hanya salinan dari sumber lain.
  select w.id, w.tanggal, w.nama, w.jenis, w.sumber, w.durasi_menit
    from w
    join teratas t on t.tanggal = w.tanggal and t.jenis = w.jenis and t.rank = w.rank
   order by w.tanggal, w.jenis, w.created_at;
end;
$$;

comment on function public.latihan_terhitung(date, date, uuid) is
  'Sesi latihan setelah anti-dobel: per (hari, olahraga) hanya sumber berperingkat tertinggi.';

-- ---------------------------------------------------------------------------
-- Hak EXECUTE. Semua INVOKER: pengguna diturunkan dari sesi (atau disebut
-- eksplisit oleh service role) lewat pengguna_efektif, dan RLS tetap berlaku.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rank_bawaan(text, text)',
    'public.olahraga_latihan()',
    'public.jenis_kesehatan_aditif()',
    'public.rank_efektif(uuid, text, text)',
    'public.urutan_prioritas(text)',
    'public.atur_prioritas_sumber(text, text[])',
    'public.periksa_rentang_agregasi(date, date)',
    'public.data_kesehatan_terhitung(date, date, uuid)',
    'public.agregat_kesehatan_harian(date, date, uuid)',
    'public.sumber_koneksi_latihan(public.sumber_workout)',
    'public.latihan_terhitung(date, date, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Ringkasan mingguan menghitung SESI setelah anti-dobel.
--
-- Satu lari yang tercatat di Strava dan WHOOP sebelumnya terhitung dua sesi.
-- Fungsi di bawah sama persis dengan versi 20260922003200 kecuali dua
-- hitungan latihan, yang sekarang membaca `latihan_terhitung`.
-- ---------------------------------------------------------------------------
create or replace function public.poin_ringkasan_mingguan(
  p_minggu_mulai date default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_dari date;
  v_sampai date;
  v_fase public.fase_program;
  v_poin jsonb := '[]'::jsonb;
  v_kurang text[] := '{}';
  -- berat
  v_rata numeric;
  v_n integer;
  v_n_manual integer;
  v_n_sinkron integer;
  v_rata_lalu numeric;
  v_n_lalu integer;
  v_delta numeric;
  v_arah text;
  -- asupan & protein
  v_hari integer;
  v_kalori integer;
  v_target_kalori integer;
  v_hari_target integer;
  v_protein integer;
  v_target_protein integer;
  v_f_manual integer;
  v_f_estimasi integer;
  v_sumber_makan public.jenis_sumber;
  v_delta_int integer;
  -- pinggang
  v_p numeric;
  v_p_tgl date;
  v_p_lalu numeric;
  v_p_tgl_lalu date;
  -- latihan
  v_latihan integer;
  v_latihan_sinkron integer;
  v_latihan_lalu integer;
begin
  v_dari := public.awal_minggu(coalesce(p_minggu_mulai, v_hari_ini - 7));
  v_sampai := v_dari + 6;
  if v_sampai >= v_hari_ini then
    raise exception 'Pekan % – % belum selesai; ringkasannya dibuat setelah Minggu berlalu',
      v_dari, v_sampai
      using errcode = '22023';
  end if;

  -- Fase pekan itu: snapshot hari terakhir yang tercatat, lalu riwayat fase,
  -- lalu fase aktif. Fase hari INI bisa saja sudah berganti sejak Minggu.
  select l.fase into v_fase
    from public.daily_logs l
   where l.user_id = v_user
     and l.tanggal between v_dari and v_sampai
     and l.fase is not null
   order by l.tanggal desc
   limit 1;
  if v_fase is null then
    select case when f.selesai_tanggal is null then pr.fase_aktif else f.fase end
      into v_fase
      from public.fase_periode f
      join public.profiles pr on pr.user_id = f.user_id
     where f.user_id = v_user
       and f.mulai_tanggal <= v_sampai
       and (f.selesai_tanggal is null or f.selesai_tanggal >= v_sampai)
     order by f.mulai_tanggal desc
     limit 1;
  end if;
  if v_fase is null then
    select pr.fase_aktif into v_fase from public.profiles pr where pr.user_id = v_user;
  end if;

  -- --- Berat: rata-rata pekan vs rata-rata pekan sebelumnya ---------------
  -- Pada hari Minggu, ini PERSIS rata-rata 7 hari dan perubahannya di layar
  -- Tren (pembulatan dan ambangnya sama); uji SQL-nya membandingkan keduanya.
  select round(avg(l.berat_pagi_kg), 2),
         count(*)::integer,
         (count(*) filter (where l.sumber_berat = 'manual'))::integer,
         (count(*) filter (where l.sumber_berat = 'healthkit'))::integer
    into v_rata, v_n, v_n_manual, v_n_sinkron
    from public.daily_logs l
   where l.user_id = v_user
     and l.berat_pagi_kg is not null
     and l.tanggal between v_dari and v_sampai;

  select round(avg(l.berat_pagi_kg), 2), count(*)::integer
    into v_rata_lalu, v_n_lalu
    from public.daily_logs l
   where l.user_id = v_user
     and l.berat_pagi_kg is not null
     and l.tanggal between v_dari - 7 and v_dari - 1;

  if v_rata is not null then
    if v_rata_lalu is not null then
      v_delta := round(v_rata - v_rata_lalu, 2);
      v_arah := case
                  when abs(v_delta) < public.ambang_berat_pekanan() then 'datar'
                  when v_delta > 0 then 'naik'
                  else 'turun'
                end;
    end if;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'berat_rata',
      'nilai', v_rata,
      'unit', 'kg',
      'delta', v_delta,
      'pembanding', 'pekan_lalu',
      'arah_nilai', v_arah,
      'arah', public.arah_tujuan('berat', v_arah, v_fase),
      'sumber', public.sumber_gabungan(
        (case when v_n_sinkron > 0 then array['sinkron'] else '{}'::text[] end)
        || (case when v_n_manual > 0 then array['manual'] else '{}'::text[] end)
      ),
      'dasar', jsonb_build_object(
        'jumlah_timbangan', v_n,
        'jumlah_timbangan_lalu', coalesce(v_n_lalu, 0),
        'rata_lalu', v_rata_lalu,
        'ambang', public.ambang_berat_pekanan()
      )
    );
  else
    v_kurang := v_kurang || 'berat'::text;
  end if;

  -- --- Asupan & protein: rata-rata hari yang BENAR-BENAR dicatat ----------
  -- Hari tanpa satu pun catatan makan dilewati, bukan dihitung nol: "rata-rata
  -- 1.200 kcal" karena tiga hari lupa mencatat adalah angka yang menyesatkan.
  --
  -- Target hari itu: snapshot baris harian bila ada, bila tidak target tipe
  -- harinya (atau tipe bawaan) pada fase hari itu — urutan cadangan yang SAMA
  -- dengan `ambil_target_harian`. Snapshot protein baru terisi saat tipe hari
  -- disetel, jadi tanpa cadangan ini selisih protein hampir selalu kosong.
  with hari as (
    select l.kalori,
           l.protein_g,
           coalesce(l.target_kalori, t.target_kalori) as target_kalori,
           coalesce(l.target_protein_g, t.target_protein_g) as target_protein_g
      from public.daily_logs l
      -- Hari tanpa tipe hari memakai tipe bawaan, seperti ambil_target_harian.
      left join public.day_types d
        on d.user_id = v_user
       and d.id = coalesce(
             l.day_type_id,
             (select d2.id from public.day_types d2
               where d2.user_id = v_user and d2.is_default
               limit 1))
      left join public.day_type_targets t
        on t.day_type_id = d.id
       and t.user_id = v_user
       and t.fase = coalesce(l.fase, v_fase)
     where l.user_id = v_user
       and l.tanggal between v_dari and v_sampai
       and exists (
         select 1 from public.food_logs f
          where f.daily_log_id = l.id and f.user_id = v_user
       )
  )
  select count(*)::integer,
         round(avg(h.kalori))::integer,
         round(avg(h.target_kalori))::integer,
         count(h.target_kalori)::integer,
         round(avg(h.protein_g))::integer,
         round(avg(h.target_protein_g))::integer
    into v_hari, v_kalori, v_target_kalori, v_hari_target, v_protein, v_target_protein
    from hari h;

  select (count(*) filter (where f.sumber = 'manual'))::integer,
         (count(*) filter (where f.sumber = 'foto_ai'))::integer
    into v_f_manual, v_f_estimasi
    from public.food_logs f
    join public.daily_logs l on l.id = f.daily_log_id
   where f.user_id = v_user
     and l.user_id = v_user
     and l.tanggal between v_dari and v_sampai;

  -- Satu porsi yang ditaksir AI membuat rata-ratanya taksiran.
  v_sumber_makan := public.sumber_gabungan(
    (case when v_f_estimasi > 0 then array['estimasi'] else '{}'::text[] end)
    || (case when v_f_manual > 0 then array['manual'] else '{}'::text[] end)
  );

  if v_hari > 0 then
    v_delta_int := v_kalori - v_target_kalori;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'asupan_rata',
      'nilai', v_kalori,
      'unit', 'kcal',
      'delta', v_delta_int,
      'pembanding', 'target',
      'arah_nilai', null,
      'arah', case
                when v_delta_int is null then null
                when abs(v_delta_int) <= public.ambang_asupan_harian() then 'sesuai'
                else 'berlawanan'
              end,
      'sumber', v_sumber_makan,
      'dasar', jsonb_build_object(
        'hari_tercatat', v_hari,
        'hari_bertarget', v_hari_target,
        'rata_target', v_target_kalori,
        'entri_manual', v_f_manual,
        'entri_estimasi', v_f_estimasi,
        'ambang', public.ambang_asupan_harian()
      )
    );

    v_delta_int := v_protein - v_target_protein;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'protein_rata',
      'nilai', v_protein,
      'unit', 'g',
      'delta', v_delta_int,
      'pembanding', 'target',
      'arah_nilai', null,
      -- Protein lebih dari target bukan masalah; yang dijaga kekurangannya.
      'arah', case
                when v_delta_int is null then null
                when v_delta_int >= -public.ambang_protein_harian() then 'sesuai'
                else 'berlawanan'
              end,
      'sumber', v_sumber_makan,
      'dasar', jsonb_build_object(
        'hari_tercatat', v_hari,
        'rata_target', v_target_protein,
        'ambang', public.ambang_protein_harian()
      )
    );
  else
    v_kurang := v_kurang || 'asupan'::text;
  end if;

  -- --- Pinggang: pengukuran terakhir pekan itu vs pengukuran sebelumnya ----
  select m.pinggang_cm, m.tanggal
    into v_p, v_p_tgl
    from public.body_measurements m
   where m.user_id = v_user
     and m.pinggang_cm is not null
     and m.tanggal between v_dari and v_sampai
   order by m.tanggal desc
   limit 1;

  if v_p is not null then
    select m.pinggang_cm, m.tanggal
      into v_p_lalu, v_p_tgl_lalu
      from public.body_measurements m
     where m.user_id = v_user
       and m.pinggang_cm is not null
       and m.tanggal < v_p_tgl
       and m.tanggal >= v_p_tgl - public.jendela_pembanding_pinggang()
     order by m.tanggal desc
     limit 1;

    v_delta := case when v_p_lalu is null then null else round(v_p - v_p_lalu, 1) end;
    v_arah := case
                when v_delta is null then null
                else public.arah_metrik(v_delta, public.ambang_pinggang_pekanan())
              end;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'pinggang',
      'nilai', v_p,
      'unit', 'cm',
      'delta', v_delta,
      'pembanding', 'pengukuran_sebelumnya',
      'arah_nilai', v_arah,
      'arah', public.arah_tujuan('pinggang', v_arah, v_fase),
      -- Ukuran tubuh selalu diketik tangan; tidak ada perangkat yang mengirimnya.
      'sumber', 'manual',
      'dasar', jsonb_build_object(
        'tanggal', v_p_tgl,
        'tanggal_pembanding', v_p_tgl_lalu,
        'nilai_pembanding', v_p_lalu,
        'ambang', public.ambang_pinggang_pekanan()
      )
    );
  else
    v_kurang := v_kurang || 'pinggang'::text;
  end if;

  -- --- Latihan: jumlah sesi, bukan tujuan --------------------------------
  -- Setelah anti-dobel: satu lari di Strava + WHOOP adalah satu sesi.
  select count(*)::integer, (count(*) filter (where w.sumber <> 'manual'))::integer
    into v_latihan, v_latihan_sinkron
    from public.latihan_terhitung(v_dari, v_sampai, v_user) w;

  select count(*)::integer
    into v_latihan_lalu
    from public.latihan_terhitung(v_dari - 7, v_dari - 1, v_user) w;

  if v_latihan > 0 or v_latihan_lalu > 0 then
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'latihan',
      'nilai', v_latihan,
      'unit', 'sesi',
      'delta', v_latihan - v_latihan_lalu,
      'pembanding', 'pekan_lalu',
      'arah_nilai', null,
      -- Jumlah sesi tidak punya arah "benar"; deload juga pekan yang sah.
      'arah', 'netral',
      'sumber', public.sumber_gabungan(
        (case when v_latihan_sinkron > 0 then array['sinkron'] else '{}'::text[] end)
        || (case when v_latihan - v_latihan_sinkron > 0 then array['manual'] else '{}'::text[] end)
      ),
      'dasar', jsonb_build_object('jumlah_lalu', v_latihan_lalu)
    );
  end if;

  return jsonb_build_object(
    'periode', jsonb_build_object('dari', v_dari, 'sampai', v_sampai),
    'fase', v_fase,
    'poin', v_poin,
    -- Pekan tanpa timbangan DAN tanpa catatan makan tidak diringkas: laporan
    -- yang isinya "tidak ada data" hanya terasa seperti teguran.
    'cukup', v_rata is not null or v_hari > 0,
    'kurang', to_jsonb(v_kurang)
  );
end;
$$;
