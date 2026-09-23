-- ---------------------------------------------------------------------------
-- Skema percakapan AI Coach.
--
-- Dipisah per UTAS, bukan satu gulungan tanpa ujung, karena jawaban coach
-- berisi angka yang BERLAKU PADA SAAT ITU: "rata-rata 7 hari Anda 74,5 kg" dari
-- dua pekan lalu bukan informasi yang sama dengan kalimat serupa hari ini. Batas
-- utas membuat konteks itu ikut terbaca.
--
-- Tiga jaminan STRUKTURAL yang jadi alasan tabel ini berbentuk seperti ini:
--
-- 1. HANYA pesan coach yang boleh membawa rujukan, widget, ringkasan, evaluasi,
--    atau penolakan. PRD menuntut coach membedakan data mentah dari estimasi,
--    dan jaminan itu runtuh kalau pesan yang MENGAKU dari pengguna bisa
--    membawa kartu angka: pembaca tidak punya cara membedakan angka yang
--    dihitung app dari angka yang diketik orang.
-- 2. Pesan tidak bisa ditempelkan ke percakapan milik ORANG LAIN. RLS menjaga
--    barisnya, tapi tidak menjaga `percakapan_id`: kunci asing tetap
--    menyelesaikan referensi ke baris yang tidak terlihat oleh penulisnya.
--    Karena itu ada pemicu yang membandingkan pemiliknya.
-- 3. Urutan pesan memakai kolom MONOTON, bukan `waktu`. Dua pesan dalam satu
--    transaksi — pertanyaan pengguna dan jawaban coach yang disimpan bersama —
--    mendapat `now()` yang sama persis, dan urutannya jadi tidak tertentu.
--    Gelembung yang bertukar tempat membuat percakapan tidak bisa dibaca.
--
-- Gelembung KOSONG juga dicegah: pesan harus punya teks, KECUALI ia memang
-- membawa kartu (ringkasan, evaluasi, atau penolakan) yang dirender sebagai
-- kartu alih-alih gelembung.
-- ---------------------------------------------------------------------------

/** Panjang maksimal judul percakapan; sama dengan MAKS_JUDUL di @recomp/logika. */
create or replace function public.maks_judul_percakapan()
returns integer
language sql
immutable
set search_path = ''
as $$ select 48; $$;

create table if not exists public.percakapan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /* Diturunkan dari pertanyaan pertama oleh `judulPercakapan` di klien. */
  judul text not null,
  /* Waktu pesan terakhir; dipakai mengurutkan daftar riwayat. */
  diperbarui_pada timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- 48 karakter + satu elipsis. Batasnya sama dengan MAKS_JUDUL di TypeScript;
  -- kesamaannya dijaga `npm run cek:percakapan`.
  constraint percakapan_judul_wajar
    check (char_length(judul) between 1 and 49)
);

create index if not exists percakapan_user_diperbarui_idx
  on public.percakapan (user_id, diperbarui_pada desc);

comment on table public.percakapan is
  'Satu utas percakapan AI Coach. Dipisah per utas karena jawaban coach memuat '
  'angka yang berlaku pada saat itu.';

create table if not exists public.pesan_coach (
  id uuid primary key default gen_random_uuid(),
  -- Urutan MONOTON. Lihat jaminan 3 di atas: `waktu` tidak cukup karena dua
  -- pesan dalam satu transaksi mendapat now() yang sama persis.
  urutan bigint generated always as identity,
  percakapan_id uuid not null references public.percakapan (id) on delete cascade,
  /* Didenormalisasi agar kebijakan RLS-nya sesederhana tabel lain. */
  user_id uuid not null references auth.users (id) on delete cascade,
  peran text not null,
  teks text not null default '',
  waktu timestamptz not null default now(),
  /* Angka yang dipakai jawaban ini beserta asalnya; array. */
  rujukan jsonb,
  /* Kartu hasil function calling; array. Dirender app, bukan diketik model. */
  widget jsonb,
  /* Laporan berkala yang dibuat coach sendiri; objek. */
  ringkasan jsonb,
  /* Verdict evaluasi 4 mingguan; objek. */
  evaluasi jsonb,
  /* Penolakan batas medis; objek. Bukan pendapat coach, melainkan batas. */
  penolakan jsonb,
  created_at timestamptz not null default now(),

  constraint pesan_peran_dikenal check (peran in ('pengguna', 'coach')),
  constraint pesan_teks_wajar check (char_length(teks) <= 8000),

  -- Gelembung kosong bukan pesan. Yang boleh tanpa teks hanyalah pesan yang
  -- memang dirender sebagai KARTU.
  constraint pesan_ada_isinya check (
    char_length(btrim(teks)) > 0
    or ringkasan is not null or evaluasi is not null or penolakan is not null
  ),

  -- Jaminan 1: pesan pengguna tidak punya tempat untuk membawa kartu angka.
  constraint pesan_pengguna_tanpa_kartu check (
    peran = 'coach'
    or (rujukan is null and widget is null and ringkasan is null
        and evaluasi is null and penolakan is null)
  ),

  -- Bentuk JSON-nya ikut dijaga: array yang ditulis sebagai objek (atau
  -- sebaliknya) baru terlihat salah saat dirender, yaitu jauh dari tempat
  -- kesalahannya dibuat.
  constraint pesan_rujukan_array check (rujukan is null or jsonb_typeof(rujukan) = 'array'),
  constraint pesan_widget_array check (widget is null or jsonb_typeof(widget) = 'array'),
  constraint pesan_ringkasan_objek check (ringkasan is null or jsonb_typeof(ringkasan) = 'object'),
  constraint pesan_evaluasi_objek check (evaluasi is null or jsonb_typeof(evaluasi) = 'object'),
  constraint pesan_penolakan_objek check (penolakan is null or jsonb_typeof(penolakan) = 'object')
);

create index if not exists pesan_coach_percakapan_urutan_idx
  on public.pesan_coach (percakapan_id, urutan);
create index if not exists pesan_coach_user_waktu_idx
  on public.pesan_coach (user_id, waktu desc);

comment on table public.pesan_coach is
  'Satu pesan dalam percakapan AI Coach. Hanya pesan coach yang boleh membawa '
  'rujukan/widget/ringkasan/evaluasi/penolakan — pesan pengguna tidak punya '
  'tempat untuk mengaku mengutip data.';

comment on column public.pesan_coach.urutan is
  'Urutan monoton dalam satu percakapan. Dipakai mengurutkan, BUKAN `waktu`: '
  'dua pesan dalam satu transaksi punya waktu yang sama persis.';

-- ---------------------------------------------------------------------------
-- Jaminan 2: pesan hanya boleh masuk ke percakapan milik penulisnya.
-- ---------------------------------------------------------------------------
-- Pemicunya SECURITY INVOKER (bawaan), jadi RLS ikut berlaku di dalamnya. Itu
-- disengaja dan penting: percakapan milik orang lain TIDAK TERLIHAT dari sini,
-- sehingga yang keluar adalah "percakapan tidak ditemukan" — bukan "milik
-- pengguna lain", yang akan mengonfirmasi bahwa utas dengan id itu ada.
-- Pemeriksaan kepemilikan di bawahnya tetap ditulis sebagai lapis kedua, untuk
-- pemanggil SECURITY DEFINER di masa depan yang tidak terbatasi RLS.
create or replace function public.jaga_pemilik_pesan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pemilik uuid;
begin
  select user_id into v_pemilik from public.percakapan where id = new.percakapan_id;
  if v_pemilik is null then
    raise exception 'Percakapan tidak ditemukan' using errcode = '23503';
  end if;
  if v_pemilik <> new.user_id then
    raise exception 'Pesan tidak boleh masuk ke percakapan milik pengguna lain'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists pesan_coach_pemilik_sama on public.pesan_coach;
create trigger pesan_coach_pemilik_sama
  before insert or update on public.pesan_coach
  for each row execute function public.jaga_pemilik_pesan();

-- ---------------------------------------------------------------------------
-- `diperbarui_pada` mengikuti pesan terakhir, bukan diurus pemanggil.
--
-- Kalau pemanggil yang mengurusnya, satu jalur yang lupa akan membuat utas itu
-- tenggelam di daftar riwayat — dan gejalanya ("percakapan saya hilang") tidak
-- pernah bisa dihubungkan dengan sebabnya.
-- ---------------------------------------------------------------------------
create or replace function public.segarkan_percakapan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.percakapan p
     set diperbarui_pada = greatest(p.diperbarui_pada, new.waktu)
   where p.id = new.percakapan_id;
  return new;
end;
$$;

drop trigger if exists pesan_coach_segarkan_percakapan on public.pesan_coach;
create trigger pesan_coach_segarkan_percakapan
  after insert or update of waktu on public.pesan_coach
  for each row execute function public.segarkan_percakapan();

-- ---------------------------------------------------------------------------
-- RLS — isi percakapan termasuk data kesehatan, jadi isolasinya syarat.
-- ---------------------------------------------------------------------------
alter table public.percakapan enable row level security;
alter table public.pesan_coach enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'percakapan' and policyname = 'percakapan_milik_sendiri'
  ) then
    create policy percakapan_milik_sendiri on public.percakapan
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pesan_coach' and policyname = 'pesan_coach_milik_sendiri'
  ) then
    create policy pesan_coach_milik_sendiri on public.pesan_coach
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.maks_judul_percakapan() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.maks_judul_percakapan() to authenticated';
    execute 'grant select, insert, update, delete on public.percakapan to authenticated';
    execute 'grant select, insert, update, delete on public.pesan_coach to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.percakapan from anon';
    execute 'revoke all on public.pesan_coach from anon';
  end if;
end $$;
