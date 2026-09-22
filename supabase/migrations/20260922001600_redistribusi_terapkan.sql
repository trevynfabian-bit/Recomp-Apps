-- ---------------------------------------------------------------------------
-- Perhitungan & penerapan redistribusi kalori mingguan.
--
-- Skema tabelnya sudah menjamin dua hal (lihat 001400): kalori tidak bisa
-- hilang tanpa keterangan, dan protein tidak punya kolom untuk ikut dipotong.
-- Yang ditegakkan di berkas ini adalah aturan PRD yang tidak bisa dijamin oleh
-- bentuk tabel:
--
--   • MENGHITUNG dan MENERAPKAN dipisah jadi dua fungsi. PRD menuntut
--     penerapan selalu keputusan pengguna, dan memisahkannya membuat pratinjau
--     memakai jalur yang SAMA dengan penerapan — yang dilihat pengguna sebelum
--     menekan persis yang ia dapat sesudahnya.
--   • maksimal SEKALI per pekan.
--   • tiap target baru dibulatkan ke 50 kkal.
--   • batas bawah kalori harian tidak pernah dilanggar. Batasnya dibaca dari
--     PROFIL, bukan dari argumen: batas yang dikirim pemanggil bukan batas sama
--     sekali — klien bisa mengirim nol.
--   • hanya hari yang BELUM berjalan yang disentuh. Menulis ulang target hari
--     yang sudah lewat berarti menilai ulang hari yang sudah dijalani.
--   • target ASLI hari itu disimpan, supaya budget pekan tidak ikut mengecil
--     dan redistribusinya tidak membatalkan dirinya sendiri.
--
-- Aturan angkanya harus sama persis dengan `hitungRedistribusi` di
-- @recomp/logika; kesamaannya dijaga mesin lewat `npm run cek:paritas`.
-- ---------------------------------------------------------------------------

-- --- Batas bawah kalori harian, per pengguna -------------------------------
alter table public.profiles
  add column if not exists batas_bawah_kalori integer not null default 1800;

comment on column public.profiles.batas_bawah_kalori is
  'Kalori harian yang tidak boleh dilewati ke bawah oleh redistribusi. '
  'Disimpan di profil, bukan diminta dari pemanggil: batas yang dikirim klien '
  'bukan batas sama sekali.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_batas_bawah_masuk_akal'
  ) then
    alter table public.profiles
      add constraint profiles_batas_bawah_masuk_akal
      check (batas_bawah_kalori between 1000 and 5000);
  end if;
end $$;

-- --- Kelipatan pembulatan --------------------------------------------------
-- Dituliskan sebagai fungsi bernama supaya angkanya punya SATU tempat dan
-- bisa dibandingkan langsung dengan KELIPATAN_KCAL di TypeScript.
create or replace function public.kelipatan_redistribusi_kcal()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50; $$;

-- ---------------------------------------------------------------------------
-- 1. Menghitung tawaran. Tidak menulis apa pun.
-- ---------------------------------------------------------------------------
create or replace function public.hitung_redistribusi(
  p_tanggal date default null,
  p_opsi public.opsi_redistribusi default 'sebar_rata',
  p_tanggal_tumpuk date default null,
  p_hari_ini date default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_budget jsonb;
  v_mendatang jsonb;
  v_hari jsonb := '[]'::jsonb;
  v_batas integer;
  v_kelipatan integer := public.kelipatan_redistribusi_kcal();
  v_perlu integer;
  v_n integer;
  v_sasaran date;
  v_terserap integer := 0;
  v_dibatasi_lantai boolean := false;
  v_sebab text;
  r record;
  v_bagian float8;
  v_mentah float8;
  v_bulat integer;
  v_baru integer;
  v_kena_lantai boolean;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select batas_bawah_kalori into v_batas
    from public.profiles where user_id = v_user_id;
  if v_batas is null then
    raise exception 'Profil belum punya batas bawah kalori' using errcode = '23502';
  end if;

  v_budget := public.budget_mingguan(p_tanggal, p_hari_ini);

  -- Yang dipindah adalah selisih antara sisa jatah dan rencana hari-hari yang
  -- belum berjalan. Negatif berarti kelebihan yang sudah terjadi harus
  -- ditutup; positif berarti ada jatah menganggur yang boleh dipakai.
  v_perlu := (v_budget->>'sisa')::integer - (v_budget->>'target_mendatang')::integer;

  select coalesce(jsonb_agg(h order by h->>'tanggal'), '[]'::jsonb)
    into v_mendatang
    from jsonb_array_elements(v_budget->'rincian') as h
   where h->>'status' = 'mendatang';
  v_n := jsonb_array_length(v_mendatang);

  v_sebab := case
               when p_opsi = 'abaikan' then 'abaikan'
               when v_n = 0 then 'tanpa hari tersisa'
               when v_perlu = 0 then 'sudah pas'
             end;

  if v_sebab is null and p_opsi = 'tumpuk_satu_hari' then
    -- Tanpa sasaran, kelebihan ditumpuk ke hari TERAKHIR pekan.
    v_sasaran := coalesce(p_tanggal_tumpuk, (v_mendatang->-1->>'tanggal')::date);
  end if;

  for r in
    select (h->>'tanggal')::date as tanggal,
           h->>'nama_tipe_hari' as nama_tipe_hari,
           (h->>'target_kalori')::integer as target_lama
      from jsonb_array_elements(v_mendatang) as h
     order by 1
  loop
    if v_sebab is not null then
      v_bagian := 0;
    elsif p_opsi = 'sebar_rata' then
      v_bagian := v_perlu::float8 / v_n;
    elsif r.tanggal = v_sasaran then
      v_bagian := v_perlu::float8;
    else
      v_bagian := 0;
    end if;

    v_mentah := r.target_lama::float8 + v_bagian;
    -- floor(x + 0,5), BUKAN round(). `Math.round` di JavaScript membulatkan
    -- setengah ke arah plus tak hingga; `round()` di Postgres menjauhi nol.
    -- Bagian yang dipindah sering negatif, jadi bedanya bukan kasus khayalan.
    v_bulat := (floor(v_mentah / v_kelipatan::float8 + 0.5) * v_kelipatan)::integer;
    -- Bulatkan dulu, baru tegakkan lantai — supaya lantai tidak ikut
    -- terbulatkan ke bawah dan justru dilanggar.
    v_baru := greatest(v_bulat, v_batas);
    v_kena_lantai := v_baru > v_bulat;
    if v_kena_lantai then v_dibatasi_lantai := true; end if;
    v_terserap := v_terserap + (v_baru - r.target_lama);

    v_hari := v_hari || jsonb_build_object(
      'tanggal', r.tanggal,
      'nama_tipe_hari', r.nama_tipe_hari,
      'target_lama', r.target_lama,
      'target_baru', v_baru,
      'selisih', v_baru - r.target_lama,
      'kena_lantai', v_kena_lantai
    );
  end loop;

  return jsonb_build_object(
    'minggu_mulai', v_budget->>'minggu_mulai',
    'hari_ini', v_budget->>'hari_ini',
    'opsi', p_opsi,
    'perlu_dipindah', v_perlu,
    'terserap', v_terserap,
    -- Yang TIDAK terserap karena pembulatan atau lantai; dinyatakan
    -- terang-terangan, bukan disembunyikan.
    'tersisa', v_perlu - v_terserap,
    'dibatasi_lantai', v_dibatasi_lantai,
    'batas_bawah_kalori', v_batas,
    'kelipatan_kcal', v_kelipatan,
    -- Kode, bukan kalimat: kalimatnya disusun @recomp/logika supaya angka di
    -- dalamnya diformat sama dengan angka di seluruh app.
    'sebab', v_sebab,
    'hari', v_hari
  );
end;
$$;

comment on function public.hitung_redistribusi(date, public.opsi_redistribusi, date, date) is
  'Menghitung tawaran redistribusi kalori pekan itu tanpa menulis apa pun. '
  'Angkanya identik dengan hitungRedistribusi di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- 2. Menerapkan tawaran.
--
-- Kuota "sekali per pekan" ditegakkan di sini, bukan lewat indeks unik:
-- tabelnya memang menyimpan SATU BARIS PER PENERAPAN supaya pembatalan nanti
-- bisa dicatat sebagai barisnya sendiri, dan indeks unik akan menghalangi itu.
-- ---------------------------------------------------------------------------
create or replace function public.terapkan_redistribusi(
  p_tanggal date default null,
  p_opsi public.opsi_redistribusi default 'sebar_rata',
  p_tanggal_tumpuk date default null,
  p_hari_ini date default null,
  p_alasan text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hasil jsonb;
  v_senin date;
  v_id uuid;
  v_bawaan uuid;
  v_berubah integer := 0;
  r record;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  v_hasil := public.hitung_redistribusi(p_tanggal, p_opsi, p_tanggal_tumpuk, p_hari_ini);
  v_senin := (v_hasil->>'minggu_mulai')::date;

  select count(*) into v_berubah
    from jsonb_array_elements(v_hasil->'hari') as h
   where (h->>'selisih')::integer <> 0 or (h->>'kena_lantai')::boolean;

  -- Tidak ada yang berubah → tidak ada yang dicatat, dan kuota pekan ini TIDAK
  -- ikut terpakai. Menghanguskan satu-satunya kesempatan pekan itu untuk
  -- penerapan yang tidak mengubah apa pun jelas bukan yang diinginkan.
  if v_hasil->>'sebab' is not null or v_berubah = 0 then
    return v_hasil || jsonb_build_object(
      'diterapkan', false,
      'redistribusi_id', null,
      'sebab', coalesce(v_hasil->>'sebab', 'tidak ada perubahan')
    );
  end if;

  if exists (
    select 1 from public.redistribusi_mingguan
     where user_id = v_user_id and minggu_mulai = v_senin
  ) then
    raise exception 'Redistribusi pekan ini sudah dipakai' using errcode = '23505';
  end if;

  insert into public.redistribusi_mingguan (
    user_id, minggu_mulai, opsi, perlu_dipindah, terserap, tersisa,
    dibatasi_lantai, alasan
  )
  values (
    v_user_id, v_senin, p_opsi,
    (v_hasil->>'perlu_dipindah')::integer,
    (v_hasil->>'terserap')::integer,
    (v_hasil->>'tersisa')::integer,
    (v_hasil->>'dibatasi_lantai')::boolean,
    p_alasan
  )
  returning id into v_id;

  select id into v_bawaan
    from public.day_types
   where user_id = v_user_id and is_default
   limit 1;

  for r in
    select (h->>'tanggal')::date as tanggal,
           (h->>'target_lama')::integer as target_lama,
           (h->>'target_baru')::integer as target_baru,
           (h->>'selisih')::integer as selisih,
           (h->>'kena_lantai')::boolean as kena_lantai
      from jsonb_array_elements(v_hasil->'hari') as h
     where (h->>'selisih')::integer <> 0 or (h->>'kena_lantai')::boolean
     order by 1
  loop
    insert into public.redistribusi_hari (
      redistribusi_id, user_id, tanggal, target_lama, target_baru, kena_lantai
    )
    values (v_id, v_user_id, r.tanggal, r.target_lama, r.target_baru, r.kena_lantai);

    if r.selisih = 0 then
      continue;  -- tertahan lantai tepat di target lama: dicatat, tidak ditulis
    end if;

    -- Hari yang belum punya baris dibuatkan lewat `setel_tipe_hari` supaya
    -- snapshot targetnya lengkap dan konsisten dengan jalur biasa. Hari yang
    -- SUDAH punya baris tidak dilewatkan ke sana: itu akan menyetel ulang
    -- `day_type_override` dan menghapus pilihan manual pengguna.
    if not exists (
      select 1 from public.daily_logs
       where user_id = v_user_id and tanggal = r.tanggal
    ) then
      if v_bawaan is null then
        raise exception 'Pengguna belum punya tipe hari bawaan' using errcode = '23503';
      end if;
      perform public.setel_tipe_hari(r.tanggal, v_bawaan, false);
    end if;

    update public.daily_logs
       set target_kalori = r.target_baru,
           -- Rencana SEMULA disimpan sekali; penerapan berikutnya tidak
           -- menimpanya dengan target yang sudah dipotong.
           target_asli_kalori = coalesce(target_asli_kalori, r.target_lama)
     where user_id = v_user_id and tanggal = r.tanggal;
  end loop;

  return v_hasil || jsonb_build_object('diterapkan', true, 'redistribusi_id', v_id);
end;
$$;

comment on function public.terapkan_redistribusi(date, public.opsi_redistribusi, date, date, text) is
  'Menerapkan tawaran redistribusi: menulis target baru hari-hari yang belum '
  'berjalan beserta jejaknya. Maksimal sekali per pekan; protein tidak '
  'tersentuh karena hanya kolom kalori yang ditulis.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.kelipatan_redistribusi_kcal() from public;
revoke all on function public.hitung_redistribusi(date, public.opsi_redistribusi, date, date) from public;
revoke all on function public.terapkan_redistribusi(date, public.opsi_redistribusi, date, date, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.kelipatan_redistribusi_kcal() to authenticated';
    execute 'grant execute on function public.hitung_redistribusi(date, public.opsi_redistribusi, date, date) to authenticated';
    execute 'grant execute on function public.terapkan_redistribusi(date, public.opsi_redistribusi, date, date, text) to authenticated';
  end if;
end $$;
