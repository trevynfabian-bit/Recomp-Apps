-- ---------------------------------------------------------------------------
-- Data kesehatan tersinkron (health_data) dan kunci dedup-nya.
--
-- Satu baris = satu angka dari satu sumber: total langkah iPhone hari itu,
-- energi aktif satu aktivitas Strava, satu sesi tidur WHOOP. Tiga jaminan
-- dipegang DATABASE, bukan penulisnya:
--
-- 1. KUNCI DEDUP — sinkron berulang tidak pernah menggandakan.
--    HealthKit mengirim ulang sampel setelah app dibuka lagi, webhook Strava
--    bisa terkirim dua kali, cron Hevy menarik jendela yang tumpang tindih.
--    Kuncinya (pengguna, sumber, asal, jenis, id_eksternal) dan penulis
--    memakai `on conflict ... do update`: kiriman kedua MEMPERBARUI, tidak
--    menambah. Total harian yang masih bertambah (langkah pukul 10.00 lalu
--    pukul 21.00) memakai id `total:<tanggal>`, jadi angkanya tumbuh di baris
--    yang sama.
--
--    `asal` adalah pembuat data DI DALAM sumber — bundle id HKSource untuk
--    Apple Health (iPhone, Apple Watch, app WHOOP yang menulis ke Health).
--    Langkah iPhone dan langkah Watch di hari yang sama adalah dua baris
--    berbeda; memilih satu di antaranya (bukan menjumlah) adalah tugas
--    source_priority, dan ia butuh `asal` untuk mengenali data WHOOP yang
--    masuk lewat Apple Health.
--
-- 2. TANGGAL WIB diturunkan dari waktu, tidak ditulis. Strava mengirim UTC;
--    lari pukul 05.30 WIB tercatat 22.30 UTC HARI SEBELUMNYA. Kolom tanggal
--    yang diisi penulis berarti satu penulis yang lupa mengonversi cukup
--    untuk memindahkan lari ke hari yang salah — dan mengubah tipe hari
--    kemarin. Tidur dihitung ke hari BANGUN: tidur 22.50–06.10 adalah tidur
--    malam sebelum hari itu, bukan bagian hari kemarin.
--
-- 3. SATUAN dijaga rentang per jenis. Energi HealthKit bisa datang dalam kJ;
--    salah konversi membuat 3.000 kcal terbaca 12.552 — angka yang mengubah
--    TDEE tanpa terlihat salah di mana pun. Rentang tidak menangkap semua
--    salah satuan, tapi menangkap yang paling merusak.
--
-- Kolom peringkat sumber (`source_priority_rank`, `dihitung`) ditambahkan
-- bersama aturan source_priority; sebelum aturan itu ada, tidak ada angka
-- di tabel ini yang dijumlahkan ke mana pun.
-- ---------------------------------------------------------------------------

create table if not exists public.health_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Koneksi yang membawanya (lihat health_connections).
  sumber text not null,
  -- Pembuat data di dalam sumber: bundle id HKSource untuk Apple Health.
  -- `null` untuk API langsung (Strava, WHOOP, Hevy).
  asal text,
  -- Id di sumbernya: UUID sampel HealthKit, id aktivitas Strava, id siklus/
  -- tidur WHOOP; `total:<YYYY-MM-DD>` untuk total harian.
  id_eksternal text not null,
  jenis text not null,
  -- Diturunkan dari jenis; satu jenis, satu satuan.
  satuan text generated always as (
    case jenis
      when 'kalori_aktif' then 'kcal'
      when 'langkah' then 'langkah'
      when 'tidur' then 'menit'
      when 'hr_istirahat' then 'bpm'
      when 'hrv' then 'ms'
      when 'recovery' then 'persen'
      when 'strain' then 'skor'
    end
  ) stored,
  nilai numeric(10, 2) not null,
  waktu_mulai timestamptz not null,
  waktu_selesai timestamptz,
  tanggal date generated always as (
    (timezone('Asia/Jakarta',
       case when jenis = 'tidur' then coalesce(waktu_selesai, waktu_mulai) else waktu_mulai end))::date
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint health_data_sumber_sah
    check (sumber in ('apple_health', 'whoop', 'strava', 'hevy')),
  -- Tidak ada "lainnya": angka yang tidak diketahui arti dan satuannya tidak
  -- bisa dipakai siapa pun, termasuk coach.
  constraint health_data_jenis_sah
    check (jenis in ('kalori_aktif', 'langkah', 'tidur', 'hr_istirahat', 'hrv', 'recovery', 'strain')),
  -- Recovery & strain adalah skor WHOOP; sumber lain tidak menghitungnya
  -- (atau menghitungnya dengan skala lain).
  constraint health_data_skor_whoop
    check (jenis not in ('recovery', 'strain') or sumber = 'whoop'),
  constraint health_data_asal_hanya_apple_health
    check (asal is null or (sumber = 'apple_health' and char_length(asal) between 1 and 200)),
  constraint health_data_id_eksternal_isi
    check (char_length(id_eksternal) between 1 and 200),
  constraint health_data_rentang_waktu
    check (waktu_selesai is null or (waktu_selesai >= waktu_mulai
                                     and waktu_selesai - waktu_mulai <= interval '36 hours')),
  -- Tidur butuh waktu bangun: tanpa itu, harinya tidak bisa ditentukan.
  constraint health_data_tidur_berujung
    check (jenis <> 'tidur' or waktu_selesai is not null),
  constraint health_data_nilai_wajar check (
    case jenis
      when 'kalori_aktif' then nilai between 0 and 10000
      when 'langkah' then nilai between 0 and 150000 and nilai = trunc(nilai)
      when 'tidur' then nilai between 0 and 1440
      when 'hr_istirahat' then nilai between 25 and 150
      when 'hrv' then nilai between 1 and 300
      when 'recovery' then nilai between 0 and 100
      when 'strain' then nilai between 0 and 21
    end
  ),
  -- KUNCI DEDUP. `nulls not distinct`: dua kiriman API langsung (asal null)
  -- dengan id yang sama adalah kiriman yang sama, bukan dua baris.
  constraint health_data_kunci_dedup
    unique nulls not distinct (user_id, sumber, asal, jenis, id_eksternal)
);

comment on table public.health_data is
  'Angka kesehatan tersinkron per sumber. Kunci dedup: (user_id, sumber, asal, jenis, id_eksternal).';
comment on column public.health_data.tanggal is
  'Tanggal Asia/Jakarta, diturunkan dari waktu (tidur: waktu bangun). Tidak bisa ditulis.';
comment on column public.health_data.asal is
  'Pembuat data di dalam Apple Health (bundle id HKSource). Dibutuhkan source_priority.';

-- Layar & agregasi membaca per (pengguna, tanggal, jenis).
create index if not exists health_data_user_tanggal_jenis_idx
  on public.health_data (user_id, tanggal desc, jenis);

drop trigger if exists health_data_set_updated_at on public.health_data;
create trigger health_data_set_updated_at
  before update on public.health_data
  for each row execute function public.set_updated_at();

/**
 * Data hanya masuk selama sumbernya TERHUBUNG.
 *
 * Memutus koneksi harus berarti berhenti — termasuk untuk tugas latar
 * HealthKit yang masih terjadwal di iPhone, atau webhook yang masih dalam
 * perjalanan. Dijaga di pemicu, bukan di kebijakan RLS, supaya berlaku juga
 * untuk service role yang melewati RLS.
 *
 * INVOKER: pemanggil membaca koneksinya sendiri (RLS) atau semua (service role).
 */
create or replace function public.data_kesehatan_perlu_koneksi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.health_connections c
     where c.user_id = new.user_id and c.sumber = new.sumber and c.status = 'terhubung'
  ) then
    raise exception 'Sumber % tidak terhubung; data tidak disimpan.', new.sumber
      using errcode = 'P0001', hint = 'Hubungkan sumbernya lebih dulu di layar Sumber data.';
  end if;
  return new;
end;
$$;

drop trigger if exists health_data_perlu_koneksi on public.health_data;
create trigger health_data_perlu_koneksi
  before insert or update on public.health_data
  for each row execute function public.data_kesehatan_perlu_koneksi();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Pemilik membaca semua datanya. Perangkat menulis — dan menghapus, saat
-- HealthKit melaporkan sampel yang dihapus pengguna — hanya data Apple
-- Health miliknya. Sumber lain ditulis Edge Function (service role).
-- ---------------------------------------------------------------------------
alter table public.health_data enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_data' and policyname = 'data_kesehatan_baca_milik_sendiri'
  ) then
    create policy data_kesehatan_baca_milik_sendiri on public.health_data
      for select using (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_data' and policyname = 'data_kesehatan_perangkat_tambah'
  ) then
    create policy data_kesehatan_perangkat_tambah on public.health_data
      for insert with check (user_id = (select auth.uid()) and sumber = 'apple_health');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_data' and policyname = 'data_kesehatan_perangkat_ubah'
  ) then
    create policy data_kesehatan_perangkat_ubah on public.health_data
      for update
      using (user_id = (select auth.uid()) and sumber = 'apple_health')
      with check (user_id = (select auth.uid()) and sumber = 'apple_health');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_data' and policyname = 'data_kesehatan_perangkat_hapus'
  ) then
    create policy data_kesehatan_perangkat_hapus on public.health_data
      for delete using (user_id = (select auth.uid()) and sumber = 'apple_health');
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on public.health_data to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.health_data from anon';
  end if;
end $$;

revoke execute on function public.data_kesehatan_perlu_koneksi() from public, anon, authenticated;
