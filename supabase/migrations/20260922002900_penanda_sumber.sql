-- ---------------------------------------------------------------------------
-- Penanda data asli vs estimasi.
--
-- PRD menuntut coach membedakan data mentah dari estimasi. Sampai sekarang
-- penandanya benar untuk angka yang jelas: TDEE dan body fat ditandai
-- `estimasi`, timbangan ditandai `manual`. Tapi ada satu kelompok yang
-- penandanya SALAH, dan salahnya sistematis:
--
--   Sisa budget kalori ditandai `manual` apa adanya. Padahal kalori hari itu
--   bisa berasal dari foto makanan yang ditaksir AI (`food_logs.sumber =
--   'foto_ai'`). Satu porsi yang ditaksir membuat total hari itu — dan sisa
--   budget sepekan — tidak lagi murni data mentah. Menandainya `manual` berarti
--   coach akan menyebut angka taksiran dengan nada yang sama seperti angka
--   timbangan, dan pengguna kehilangan satu-satunya cara membedakannya.
--
-- Berkas ini memperbaiki itu dengan menurunkan penanda angka AGREGAT dari
-- penanda masukannya, memakai aturan MATA RANTAI TERLEMAH: estimasi mengalahkan
-- sinkron, sinkron mengalahkan manual. Satu porsi taksiran cukup untuk membuat
-- totalnya taksiran — itu memang maksudnya. Angka yang setengah pasti lebih
-- berbahaya daripada angka yang jelas-jelas taksiran, karena yang pertama
-- terbaca seperti fakta.
--
-- Selain itu, penanda tidak lagi bergantung pada kebaikan pemanggil: kolom
-- `rujukan` dan `widget` di `pesan_coach` sekarang MENOLAK elemen yang tidak
-- membawa asal angkanya. Kartu angka tanpa asal adalah tepat hal yang PRD
-- larang, dan melarangnya di baris jauh lebih kuat daripada mengingatkannya di
-- prompt.
-- ---------------------------------------------------------------------------

-- --- Jenis sumber, sebagai tipe ---------------------------------------------
-- Sama dengan JenisSumber di @/types/domain. Sebagai enum, salah ketik
-- ('estimasti') ditolak database alih-alih diam-diam tersimpan lalu dirender
-- sebagai penanda yang tidak dikenal UI.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'jenis_sumber') then
    create type public.jenis_sumber as enum ('manual', 'sinkron', 'estimasi');
  end if;
end $$;

/**
 * Peringkat "keraguan" sebuah sumber. Dipakai memilih mata rantai terlemah.
 */
create or replace function public.peringkat_sumber(p_sumber text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_sumber
           when 'estimasi' then 3
           when 'sinkron' then 2
           else 1            -- manual
         end;
$$;

/**
 * Gabungkan beberapa sumber menjadi satu: yang PALING diragukan menang.
 *
 * Daftar kosong berarti tidak ada masukan sama sekali; jawabannya `manual`
 * bukan karena optimisme, tapi karena angka tanpa masukan (mis. sisa budget di
 * pekan yang belum dimulai) seluruhnya berasal dari target yang diketik
 * pengguna sendiri.
 */
create or replace function public.sumber_gabungan(p_sumber text[])
returns public.jenis_sumber
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select s::public.jenis_sumber
       from unnest(p_sumber) as s
      order by public.peringkat_sumber(s) desc
      limit 1),
    'manual'::public.jenis_sumber
  );
$$;

comment on function public.sumber_gabungan(text[]) is
  'Sumber gabungan menurut mata rantai terlemah: estimasi > sinkron > manual. '
  'Satu masukan taksiran membuat agregatnya taksiran.';

-- ---------------------------------------------------------------------------
-- Sumber angka agregat, per periode.
-- ---------------------------------------------------------------------------

/** Sumber angka BERAT dalam satu rentang: manual, sinkron (HealthKit), atau campurannya. */
create or replace function public.sumber_berat_periode(p_dari date, p_sampai date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_manual integer;
  v_sinkron integer;
begin
  select
    count(*) filter (where l.sumber_berat = 'manual'),
    count(*) filter (where l.sumber_berat = 'healthkit')
    into v_manual, v_sinkron
    from public.daily_logs l
   where l.user_id = v_user_id
     and l.tanggal between p_dari and p_sampai
     and l.berat_pagi_kg is not null;

  return jsonb_build_object(
    'sumber', public.sumber_gabungan(
      (case when v_sinkron > 0 then array['sinkron'] else '{}'::text[] end)
      || (case when v_manual > 0 then array['manual'] else '{}'::text[] end)
    ),
    'rincian', jsonb_build_object('manual', v_manual, 'sinkron', v_sinkron)
  );
end;
$$;

/**
 * Sumber angka KALORI dalam satu rentang.
 *
 * Satu entri `foto_ai` membuat seluruh totalnya taksiran. Jumlah entri tiap
 * jenis ikut dilaporkan, supaya UI bisa jujur soal SEBERAPA banyak yang
 * ditaksir — "1 dari 23 entri" dan "20 dari 23" adalah dua keadaan yang sangat
 * berbeda meski penandanya sama.
 */
create or replace function public.sumber_kalori_periode(p_dari date, p_sampai date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_manual integer;
  v_estimasi integer;
begin
  select
    count(*) filter (where f.sumber = 'manual'),
    count(*) filter (where f.sumber = 'foto_ai')
    into v_manual, v_estimasi
    from public.food_logs f
    join public.daily_logs l on l.id = f.daily_log_id
   where f.user_id = v_user_id
     and l.tanggal between p_dari and p_sampai;

  return jsonb_build_object(
    'sumber', public.sumber_gabungan(
      (case when v_estimasi > 0 then array['estimasi'] else '{}'::text[] end)
      || (case when v_manual > 0 then array['manual'] else '{}'::text[] end)
    ),
    'rincian', jsonb_build_object(
      'entri_manual', v_manual,
      'entri_estimasi', v_estimasi,
      'total_entri', v_manual + v_estimasi
    )
  );
end;
$$;

comment on function public.sumber_kalori_periode(date, date) is
  'Sumber angka kalori satu rentang. Satu entri foto_ai membuat totalnya '
  'estimasi; jumlah entri tiap jenis ikut dilaporkan agar UI bisa jujur soal '
  'seberapa banyak yang ditaksir.';

-- ---------------------------------------------------------------------------
-- `pesan_coach`: kartu angka WAJIB membawa asalnya.
--
-- Ditegakkan di baris, bukan diingatkan di prompt. Model bisa lupa; kolom tidak
-- bisa menerima elemen yang tidak lolos CHECK.
-- ---------------------------------------------------------------------------
-- CHECK tidak boleh memuat subquery, dan `jsonb_array_elements` adalah salah
-- satunya. Pemeriksaannya karena itu dipindah ke fungsi IMMUTABLE — yang juga
-- membuat aturannya punya satu nama dan bisa diuji sendiri.
create or replace function public.rujukan_bersumber(p_rujukan jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_rujukan is null or (
    jsonb_typeof(p_rujukan) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_rujukan) as r
       where jsonb_typeof(r) <> 'object'
          or (r ->> 'label') is null
          or (r ->> 'nilai') is null
          -- `is null` HARUS disebut terpisah: `null not in (...)` bernilai NULL,
          -- bukan true, jadi baris tanpa `jenis` akan lolos tanpa penjagaan ini.
          or (r ->> 'jenis') is null
          or (r ->> 'jenis') not in ('manual', 'sinkron', 'estimasi')
    )
  );
$$;

comment on function public.rujukan_bersumber(jsonb) is
  'true bila tiap rujukan membawa label, nilai, dan jenis sumber yang dikenal. '
  'Angka tanpa asal adalah tepat hal yang PRD larang.';

create or replace function public.widget_bersumber(p_widget jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_widget is null or (
    jsonb_typeof(p_widget) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(p_widget) as w
       where jsonb_typeof(w) <> 'object'
          or (w ->> 'sumber') is null
          or (w ->> 'sumber') not in ('manual', 'sinkron', 'estimasi')
    )
  );
$$;

comment on function public.widget_bersumber(jsonb) is
  'true bila tiap kartu angka membawa sumber yang dikenal.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pesan_rujukan_bersumber'
  ) then
    alter table public.pesan_coach
      add constraint pesan_rujukan_bersumber check (public.rujukan_bersumber(rujukan));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pesan_widget_bersumber'
  ) then
    alter table public.pesan_coach
      add constraint pesan_widget_bersumber check (public.widget_bersumber(widget));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- `konteks_coach` dibuat ulang: penanda angka agregat diturunkan dari
-- masukannya, bukan dipatok.
-- ---------------------------------------------------------------------------
create or replace function public.konteks_coach(
  p_tanggal date default null,
  p_persen_lemak numeric default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_profil public.profiles;
  v_usia integer;
  v_tren jsonb;
  v_budget jsonb;
  v_tdee jsonb;
  v_bf jsonb;
  v_ukuran jsonb;
  v_target record;
  v_evaluasi public.evaluasi_periodik;
  v_ringkasan public.ringkasan_mingguan;
  v_angka jsonb := '[]'::jsonb;
  v_rata numeric;
  v_n_timbangan integer;
  v_senin date;
  v_s_berat jsonb;
  v_s_berat_pekan jsonb;
  v_s_kalori jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_profil from public.profiles where user_id = v_user_id;
  if v_profil.tanggal_lahir is not null then
    v_usia := extract(year from age(v_hari_ini, v_profil.tanggal_lahir))::integer;
  end if;

  v_tren := public.tren_berat_7_hari(v_hari_ini, 28);
  v_budget := public.budget_mingguan(v_hari_ini, v_hari_ini);
  v_tdee := public.estimasi_tdee(v_hari_ini, 14, p_persen_lemak);
  v_bf := public.estimasi_body_fat(v_hari_ini);
  v_ukuran := public.riwayat_ukuran(v_hari_ini, 8, 4);
  select * into v_target from public.ambil_target_harian(v_hari_ini);

  select * into v_evaluasi from public.evaluasi_periodik
   where user_id = v_user_id order by periode_dari desc limit 1;
  select * into v_ringkasan from public.ringkasan_mingguan
   where user_id = v_user_id order by periode_dari desc limit 1;

  v_rata := (v_tren -> 'rata_rata' ->> 'rata_rata_kg')::numeric;
  v_n_timbangan := (v_tren -> 'rata_rata' ->> 'jumlah_timbangan')::integer;
  v_senin := (v_budget ->> 'minggu_mulai')::date;

  -- Penanda diturunkan dari MASUKANNYA, per rentang yang benar-benar dipakai
  -- angka itu. Memakai satu rentang untuk semua akan menandai rata-rata 7 hari
  -- dengan sumber timbangan dari tiga pekan lalu.
  v_s_berat := public.sumber_berat_periode(v_hari_ini - 6, v_hari_ini);
  v_s_berat_pekan := public.sumber_berat_periode(v_hari_ini - 13, v_hari_ini);
  v_s_kalori := public.sumber_kalori_periode(v_senin, v_senin + 6);

  if v_rata is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'berat_rata_7_hari',
      'nilai', v_rata,
      'unit', 'kg',
      'sumber', v_s_berat ->> 'sumber',
      'dasar', jsonb_build_object(
        'jumlah_timbangan', v_n_timbangan,
        'jendela_hari', 7,
        'sumber_rincian', v_s_berat -> 'rincian'
      )
    );
  end if;

  if (v_tren -> 'arah' ->> 'perubahan_kg') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'perubahan_berat_sepekan',
      'nilai', (v_tren -> 'arah' ->> 'perubahan_kg')::numeric,
      'unit', 'kg',
      'sumber', v_s_berat_pekan ->> 'sumber',
      'dasar', jsonb_build_object(
        'arah', v_tren -> 'arah' ->> 'arah',
        'ambang_kg', v_tren -> 'arah' -> 'ambang_kg',
        'sumber_rincian', v_s_berat_pekan -> 'rincian'
      )
    );
  end if;

  -- Sisa budget: satu porsi yang ditaksir AI membuat totalnya taksiran.
  v_angka := v_angka || jsonb_build_object(
    'kunci', 'sisa_budget_pekan',
    'nilai', (v_budget ->> 'sisa')::integer,
    'unit', 'kcal',
    'sumber', v_s_kalori ->> 'sumber',
    'dasar', jsonb_build_object(
      'hari_tersisa', v_budget -> 'hari_tersisa',
      'budget_total', v_budget -> 'budget_total',
      'status_laju', v_budget -> 'laju' ->> 'status',
      'sumber_rincian', v_s_kalori -> 'rincian'
    )
  );

  -- Target adalah SETELAN yang diketik pengguna, bukan pengukuran: sumbernya
  -- manual apa pun isi catatan makannya.
  if v_target.target_kalori is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'target_kalori_hari_ini',
      'nilai', v_target.target_kalori,
      'unit', 'kcal',
      'sumber', 'manual',
      'dasar', jsonb_build_object('tipe_hari', v_target.nama_tipe_hari, 'fase', v_target.fase)
    );
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'target_protein_hari_ini',
      'nilai', v_target.target_protein_g,
      'unit', 'g',
      'sumber', 'manual',
      'dasar', jsonb_build_object('tipe_hari', v_target.nama_tipe_hari)
    );
  end if;

  -- TDEE memakai asupan DAN berat, jadi keraguan keduanya ikut menular — tapi
  -- ia estimasi apa pun masukannya, dan estimasi sudah peringkat tertinggi.
  if (v_tdee ->> 'tengah') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'tdee',
      'nilai', (v_tdee ->> 'tengah')::integer,
      'unit', 'kcal',
      'sumber', 'estimasi',
      'dasar', jsonb_build_object(
        'rentang', jsonb_build_array(v_tdee -> 'min', v_tdee -> 'maks'),
        'keyakinan', v_tdee ->> 'keyakinan',
        'jumlah_metode', jsonb_array_length(v_tdee -> 'metode'),
        'sumber_masukan', jsonb_build_object(
          'berat', public.sumber_berat_periode(v_hari_ini - 13, v_hari_ini) -> 'sumber',
          'kalori', public.sumber_kalori_periode(v_hari_ini - 13, v_hari_ini) -> 'sumber'
        )
      )
    );
  end if;

  if (v_bf ->> 'persen') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'body_fat_persen',
      'nilai', (v_bf ->> 'persen')::numeric,
      'unit', '%',
      'sumber', 'estimasi',
      'dasar', jsonb_build_object(
        'metode', v_bf ->> 'metode',
        'rentang', v_bf -> 'rentang',
        'ketidakpastian', v_bf -> 'ketidakpastian'
      )
    );
  end if;

  -- Ukuran tubuh selalu diketik tangan; tidak ada perangkat yang mengirimnya.
  if (v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'nilai') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'pinggang_terakhir',
      'nilai', (v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'nilai')::numeric,
      'unit', 'cm',
      'sumber', 'manual',
      'dasar', jsonb_build_object(
        'tanggal', v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'tanggal',
        'laju_per_pekan', v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'laju_terkini'
      )
    );
  end if;

  return jsonb_build_object(
    'hari_ini', v_hari_ini,
    'fase', public.fase_pada_tanggal(v_hari_ini),
    'profil', jsonb_build_object(
      'tinggi_cm', v_profil.tinggi_cm,
      'jenis_kelamin', v_profil.jenis_kelamin,
      'usia_tahun', v_usia,
      'satuan', v_profil.satuan,
      'batas_pinggang_cm', v_profil.batas_pinggang_cm,
      'batas_bawah_kalori', v_profil.batas_bawah_kalori
    ),
    'angka', v_angka,
    'tren', jsonb_build_object(
      'dari', v_tren ->> 'dari',
      'sampai', v_tren ->> 'sampai',
      'rata_rata', v_tren -> 'rata_rata',
      'sepekan_lalu', v_tren -> 'sepekan_lalu',
      'arah', v_tren -> 'arah',
      'kecukupan', v_tren -> 'kecukupan',
      'status_koridor', v_tren -> 'status_koridor',
      'deret', v_tren -> 'deret'
    ),
    'budget', jsonb_build_object(
      'minggu_mulai', v_budget ->> 'minggu_mulai',
      'budget_total', v_budget -> 'budget_total',
      'terpakai', v_budget -> 'terpakai',
      'sisa', v_budget -> 'sisa',
      'hari_tersisa', v_budget -> 'hari_tersisa',
      'sisa_per_hari', v_budget -> 'sisa_per_hari',
      'laju', v_budget -> 'laju',
      'rincian', v_budget -> 'rincian'
    ),
    'target_hari_ini', case when v_target.day_type_id is null then null
      else jsonb_build_object(
        'nama_tipe_hari', v_target.nama_tipe_hari,
        'fase', v_target.fase,
        'target_kalori', v_target.target_kalori,
        'target_protein_g', v_target.target_protein_g,
        'target_lemak_g', v_target.target_lemak_g,
        'batas_sat_fat_g', v_target.batas_sat_fat_g
      ) end,
    'ukuran', jsonb_build_object(
      'jumlah', v_ukuran -> 'jumlah',
      'bagian', v_ukuran -> 'bagian',
      'batas_pinggang', v_ukuran -> 'batas_pinggang'
    ),
    'body_fat', v_bf,
    'tdee', v_tdee,
    'evaluasi_terakhir', case when v_evaluasi.id is null then null else jsonb_build_object(
      'periode_dari', v_evaluasi.periode_dari,
      'periode_sampai', v_evaluasi.periode_sampai,
      'kode', v_evaluasi.kode,
      'judul', v_evaluasi.judul,
      'ringkas', v_evaluasi.ringkas,
      'rekomendasi', v_evaluasi.rekomendasi,
      'keyakinan', v_evaluasi.keyakinan,
      'arah', jsonb_build_object(
        'berat', v_evaluasi.arah_berat,
        'pinggang', v_evaluasi.arah_pinggang,
        'kekuatan', v_evaluasi.arah_kekuatan
      )
    ) end,
    'ringkasan_terakhir', case when v_ringkasan.id is null then null else jsonb_build_object(
      'periode_dari', v_ringkasan.periode_dari,
      'periode_sampai', v_ringkasan.periode_sampai,
      'poin', v_ringkasan.poin,
      'bacaan', v_ringkasan.bacaan
    ) end,
    'aturan', jsonb_build_object(
      'wajib_rata_rata_7_hari', true,
      'berat_harian_tidak_dikutip', true,
      'setiap_angka_bersumber', true,
      -- Penanda agregat diturunkan dari masukannya; satu masukan taksiran
      -- membuat agregatnya taksiran.
      'sumber_mata_rantai_terlemah', true,
      'dosis_obat_ditolak_di_klien', true,
      'sumber_dikenal', jsonb_build_array('manual', 'sinkron', 'estimasi')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
-- `rujukan_bersumber` dan `widget_bersumber` SENGAJA tidak dicabut dari public.
-- Keduanya dipakai di dalam CHECK constraint, dan hak EXECUTE-nya diperiksa
-- terhadap pengguna yang menulis barisnya: mencabutnya akan membuat setiap
-- INSERT ke `pesan_coach` gagal dengan "permission denied for function" —
-- pesan yang tidak akan pernah dihubungkan orang dengan penanda sumber.
-- Keduanya murni memeriksa jsonb dan tidak menyentuh satu tabel pun.
revoke all on function public.peringkat_sumber(text) from public;
revoke all on function public.sumber_gabungan(text[]) from public;
revoke all on function public.sumber_berat_periode(date, date) from public;
revoke all on function public.sumber_kalori_periode(date, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.peringkat_sumber(text) to authenticated';
    execute 'grant execute on function public.sumber_gabungan(text[]) to authenticated';
    execute 'grant execute on function public.sumber_berat_periode(date, date) to authenticated';
    execute 'grant execute on function public.sumber_kalori_periode(date, date) to authenticated';
  end if;
end $$;
