-- ---------------------------------------------------------------------------
-- Logika rule-based evaluasi 4 mingguan.
--
-- Dua bagian yang sifatnya berbeda:
--
-- 1. POHON KEPUTUSAN verdict (`kode_evaluasi`). Ini salinan SQL dari
--    `evaluasi4Mingguan` di @recomp/logika, dan hanya bagian yang menentukan
--    KODE, PENENTU-nya, dan KEYAKINAN. Kalimatnya (judul, ringkas, rekomendasi)
--    tetap milik TypeScript — dua penyusun kalimat pasti berbeda tanda
--    bacanya. `npm run cek:paritas` menjalankan SELURUH 960 kombinasi masukan
--    lewat kedua sisi dan membandingkannya satu per satu.
--
-- 2. PENURUNAN SUMBU dari data (`evaluasi_4_mingguan`). Ini yang sebelumnya
--    tidak ada di mana pun: TypeScript menerima arah berat/pinggang/kekuatan
--    sebagai masukan, tapi tidak ada yang menghitungnya dari catatan.
--
-- Tiga keputusan pada bagian 2 yang layak dicatat:
--
-- • Periodenya EMPAT PEKAN YANG SUDAH SELESAI, bukan empat pekan terakhir yang
--   memuat hari ini. Mengevaluasi pekan yang baru setengah jalan membuat
--   verdict berubah-ubah dari hari ke hari, dan verdict yang berubah Selasa
--   lalu berubah lagi Kamis tidak akan dipercaya siapa pun.
-- • Ambang "datar" diskalakan ke panjang periodenya. Tren harian memakai
--   0,2 kg per PEKAN; di sini periodenya empat pekan, jadi ambangnya 0,8 kg —
--   kepekaan per pekan yang sama, bukan kepekaan yang empat kali lebih tajam.
--   Pinggang memakai 0,5 cm: meteran kain punya ketelitian 0,1 cm, tapi
--   penempatannya bisa bergeser ±0,3 cm antar pengukuran.
-- • Sumbu KEKUATAN selalu `belum jelas`, dan itu dinyatakan, bukan disamarkan.
--   Tabel `workouts` hanya mencatat JENIS latihan, tanpa beban maupun
--   repetisi; kekuatan baru bisa dibaca setelah sinkronisasi Hevy membawa
--   datanya. Akibatnya keyakinan tidak pernah bisa 'tinggi' untuk sekarang —
--   dan itu jawaban yang jujur, bukan kekurangan yang perlu ditutupi.
-- ---------------------------------------------------------------------------

/** Ambang "datar" berat selama periode evaluasi, dalam kg. */
create or replace function public.ambang_berat_evaluasi()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.8::numeric; $$;

/** Ambang "datar" lingkar pinggang selama periode evaluasi, dalam cm. */
create or replace function public.ambang_pinggang_evaluasi()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.5::numeric; $$;

/** Arah sebuah selisih terhadap ambangnya; `belum jelas` bila datanya tidak ada. */
create or replace function public.arah_metrik(p_selisih numeric, p_ambang numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_selisih is null then 'belum jelas'
           when p_selisih > p_ambang then 'naik'
           when p_selisih < -p_ambang then 'turun'
           else 'datar'
         end;
$$;

-- ---------------------------------------------------------------------------
-- Pohon keputusan verdict. Urutan cabangnya SAMA PERSIS dengan TypeScript;
-- menukar dua cabang saja sudah cukup mengubah verdict untuk sebagian
-- kombinasi, dan cek:paritas akan menemukannya.
-- ---------------------------------------------------------------------------
create or replace function public.kode_evaluasi(
  p_fase public.fase_program,
  p_arah_berat text,
  p_arah_pinggang text,
  p_arah_kekuatan text,
  p_pekan_data integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_belum_jelas integer;
  v_keyakinan text;
  v_kode text;
  v_penentu text;
begin
  -- Tanpa arah berat, dua sumbu sisanya tidak bisa ditafsirkan: pinggang turun
  -- berarti hal berbeda saat berat naik dan saat berat turun. Keyakinannya
  -- DIPATOK rendah, sama seperti di TypeScript.
  if p_arah_berat = 'belum jelas' then
    return jsonb_build_object(
      'kode', 'data-kurang',
      'penentu', 'Data berat belum cukup',
      'keyakinan', 'rendah'
    );
  end if;

  v_belum_jelas :=
    (case when p_arah_berat = 'belum jelas' then 1 else 0 end)
    + (case when p_arah_pinggang = 'belum jelas' then 1 else 0 end)
    + (case when p_arah_kekuatan = 'belum jelas' then 1 else 0 end);

  v_keyakinan := case
    when p_pekan_data >= public.pekan_evaluasi() and v_belum_jelas = 0 then 'tinggi'
    when p_pekan_data >= public.pekan_evaluasi() - 1 and v_belum_jelas <= 1 then 'sedang'
    else 'rendah'
  end;

  if p_fase = 'Lean Gain' then
    if p_arah_berat = 'turun' then
      v_kode := 'lg-belum-surplus';
      v_penentu := 'Berat turun saat fase menargetkan naik';
    elsif p_arah_berat = 'datar' then
      if p_arah_kekuatan = 'naik' then
        v_kode := 'lg-rekomposisi';
        v_penentu := 'Kekuatan naik sementara berat datar';
      else
        v_kode := 'lg-stagnan';
        v_penentu := 'Berat dan kekuatan sama-sama datar';
      end if;
    elsif p_arah_pinggang = 'naik' then
      if p_arah_kekuatan = 'naik' then
        v_kode := 'lg-naik-campur';
        v_penentu := 'Pinggang ikut naik bersama berat';
      else
        v_kode := 'lg-lemak-dominan';
        v_penentu := 'Pinggang naik tanpa kenaikan kekuatan';
      end if;
    elsif p_arah_kekuatan = 'naik' then
      v_kode := 'lg-bersih';
      v_penentu := 'Berat & kekuatan naik tanpa pinggang naik';
    else
      v_kode := 'lg-naik-tanpa-kekuatan';
      v_penentu := 'Kekuatan belum naik meski berat naik';
    end if;

  elsif p_fase = 'Cut' then
    if p_arah_berat = 'naik' then
      v_kode := 'cut-belum-defisit';
      v_penentu := 'Berat naik saat fase menargetkan turun';
    elsif p_arah_berat = 'datar' then
      v_kode := 'cut-defisit-tipis';
      v_penentu := 'Berat datar selama fase Cut';
    elsif p_arah_kekuatan = 'turun' then
      v_kode := 'cut-terlalu-agresif';
      v_penentu := 'Kekuatan turun bersama berat';
    elsif p_arah_pinggang = 'turun' then
      v_kode := 'cut-berjalan';
      v_penentu := 'Berat & pinggang turun, kekuatan bertahan';
    else
      v_kode := 'cut-pinggang-belum-ikut';
      v_penentu := 'Pinggang belum mengikuti berat';
    end if;

  else  -- Maintenance
    if p_arah_berat = 'naik' then
      v_kode := 'mt-melayang-naik';
      v_penentu := 'Berat naik saat fase menargetkan datar';
    elsif p_arah_berat = 'turun' then
      v_kode := 'mt-melayang-turun';
      v_penentu := 'Berat turun saat fase menargetkan datar';
    elsif p_arah_pinggang = 'turun' and p_arah_kekuatan = 'naik' then
      v_kode := 'mt-rekomposisi';
      v_penentu := 'Pinggang turun & kekuatan naik pada berat datar';
    elsif p_arah_kekuatan = 'turun' then
      v_kode := 'mt-kekuatan-turun';
      v_penentu := 'Kekuatan turun pada berat datar';
    else
      v_kode := 'mt-stabil';
      v_penentu := 'Ketiga sumbu bertahan';
    end if;
  end if;

  return jsonb_build_object('kode', v_kode, 'penentu', v_penentu, 'keyakinan', v_keyakinan);
end;
$$;

comment on function public.kode_evaluasi(public.fase_program, text, text, text, integer) is
  'Pohon keputusan verdict evaluasi 4 mingguan: kode, penentu, keyakinan. '
  'Identik dengan evaluasi4Mingguan di @recomp/logika; kalimatnya disusun di sana.';

-- ---------------------------------------------------------------------------
-- Evaluasi dari data.
-- ---------------------------------------------------------------------------
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
  v_arah_kekuatan text := 'belum jelas';
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
      'kekuatan', jsonb_build_object(
        'arah', v_arah_kekuatan,
        -- Dinyatakan, bukan disamarkan: tanpa beban & repetisi, kekuatan
        -- memang tidak bisa dibaca.
        'sebab', 'belum ada data beban latihan'
      )
    ),
    'kode', v_verdict ->> 'kode',
    'penentu', v_verdict ->> 'penentu',
    'keyakinan', v_verdict ->> 'keyakinan'
  );
end;
$$;

comment on function public.evaluasi_4_mingguan(date) is
  'Evaluasi empat pekan terakhir yang sudah selesai: sumbu berat & pinggang '
  'diturunkan dari data, sumbu kekuatan dinyatakan belum jelas sampai data '
  'beban tersedia, lalu verdict dari kode_evaluasi.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.ambang_berat_evaluasi() from public;
revoke all on function public.ambang_pinggang_evaluasi() from public;
revoke all on function public.arah_metrik(numeric, numeric) from public;
revoke all on function public.kode_evaluasi(public.fase_program, text, text, text, integer) from public;
revoke all on function public.evaluasi_4_mingguan(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ambang_berat_evaluasi() to authenticated';
    execute 'grant execute on function public.ambang_pinggang_evaluasi() to authenticated';
    execute 'grant execute on function public.arah_metrik(numeric, numeric) to authenticated';
    execute 'grant execute on function public.kode_evaluasi(public.fase_program, text, text, text, integer) to authenticated';
    execute 'grant execute on function public.evaluasi_4_mingguan(date) to authenticated';
  end if;
end $$;
