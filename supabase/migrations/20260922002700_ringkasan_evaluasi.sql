-- ---------------------------------------------------------------------------
-- Skema ringkasan mingguan & evaluasi 4 mingguan.
--
-- Keduanya SUDAH bisa muncul di chat lewat kolom jsonb di `pesan_coach`. Tabel
-- ini bukan duplikatnya, dan alasannya penting: laporan berkala tidak boleh
-- ikut hilang saat percakapannya dihapus. Pengguna yang membersihkan riwayat
-- chat tidak sedang berkata "lupakan hasil evaluasi empat pekan saya" — dan
-- tanpa tabel sendiri, itulah yang terjadi. Selain itu "evaluasi terakhir" perlu
-- bisa ditanyakan langsung, tanpa memindai seluruh pesan.
--
-- Empat jaminan STRUKTURAL:
--
-- 1. Periodenya harus periode yang SAH. Ringkasan mingguan selalu Senin–Minggu
--    (tujuh hari), evaluasi selalu 28 hari yang dimulai Senin. Ringkasan yang
--    periodenya bergeser sehari akan menghitung dua kali hari yang sama di dua
--    laporan berbeda, dan angka yang tidak bisa dijumlahkan itu baru terlihat
--    aneh berbulan-bulan kemudian.
-- 2. SATU laporan per periode per pengguna. Dua ringkasan untuk pekan yang sama
--    berarti salah satunya kedaluwarsa, dan tidak ada cara memilih.
-- 3. Kode verdict evaluasi dibatasi ke daftar yang benar-benar dihasilkan
--    `evaluasi4Mingguan`. Kode asing berarti ada jalur yang menulis verdict
--    yang tidak pernah bisa dirender UI-nya — dan UI yang menerima kode tak
--    dikenal hanya bisa diam.
-- 4. Tautan ke pesan yang mengantarkannya bersifat LEPAS (`on delete set null`).
--    Itu konsekuensi langsung dari alasan tabel ini ada: pesannya boleh hilang,
--    laporannya tidak.
-- ---------------------------------------------------------------------------

/** Panjang periode evaluasi dalam pekan; sama dengan PEKAN_EVALUASI di @recomp/logika. */
create or replace function public.pekan_evaluasi()
returns integer
language sql
immutable
set search_path = ''
as $$ select 4; $$;

-- ---------------------------------------------------------------------------
-- Ringkasan mingguan
-- ---------------------------------------------------------------------------
create table if not exists public.ringkasan_mingguan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /* Senin pekan yang diringkas. */
  periode_dari date not null,
  periode_sampai date not null,
  /* Poin angka beserta asalnya; array. Dirender app, bukan diketik model. */
  poin jsonb not null default '[]'::jsonb,
  /* Bacaan naratif: apa yang angka-angka itu berarti bersama-sama. */
  bacaan text not null,
  /* Pertanyaan lanjutan siap pakai; array. Menghemat mengetik. */
  lanjutan jsonb,
  /* Pesan yang mengantarkannya; boleh hilang tanpa membawa laporannya. */
  pesan_id uuid references public.pesan_coach (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint ringkasan_satu_per_pekan unique (user_id, periode_dari),
  -- Senin, dan tepat tujuh hari. Lihat jaminan 1.
  constraint ringkasan_mulai_senin check (extract(isodow from periode_dari) = 1),
  constraint ringkasan_tujuh_hari check (periode_sampai = periode_dari + 6),
  constraint ringkasan_bacaan_wajar check (char_length(btrim(bacaan)) between 1 and 4000),
  constraint ringkasan_poin_array check (jsonb_typeof(poin) = 'array'),
  constraint ringkasan_lanjutan_array check (lanjutan is null or jsonb_typeof(lanjutan) = 'array')
);

create index if not exists ringkasan_user_periode_idx
  on public.ringkasan_mingguan (user_id, periode_dari desc);

comment on table public.ringkasan_mingguan is
  'Laporan berkala mingguan. Punya tabel sendiri supaya tidak ikut hilang saat '
  'percakapan yang mengantarkannya dihapus.';

-- ---------------------------------------------------------------------------
-- Evaluasi 4 mingguan
-- ---------------------------------------------------------------------------
create table if not exists public.evaluasi_periodik (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  periode_dari date not null,
  periode_sampai date not null,
  fase public.fase_program not null,
  /* Ketiga sumbu yang menghasilkan verdict. */
  arah_berat text not null,
  arah_pinggang text not null,
  arah_kekuatan text not null,
  /* Berapa pekan data yang benar-benar ada saat verdict dibuat. */
  pekan_data integer not null,
  /* Kode stabil; dipakai penelusuran & pengujian, bukan untuk ditampilkan. */
  kode text not null,
  judul text not null,
  ringkas text not null,
  rekomendasi text not null,
  /* Sumbu mana yang paling menentukan verdict ini. */
  penentu text not null,
  keyakinan text not null,
  pesan_id uuid references public.pesan_coach (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint evaluasi_satu_per_periode unique (user_id, periode_dari),
  constraint evaluasi_mulai_senin check (extract(isodow from periode_dari) = 1),
  -- 4 pekan × 7 hari, dihitung dari konstanta yang sama dengan TypeScript.
  constraint evaluasi_empat_pekan
    check (periode_sampai = periode_dari + (public.pekan_evaluasi() * 7 - 1)),
  constraint evaluasi_arah_dikenal check (
    arah_berat in ('naik', 'datar', 'turun', 'belum jelas')
    and arah_pinggang in ('naik', 'datar', 'turun', 'belum jelas')
    and arah_kekuatan in ('naik', 'datar', 'turun', 'belum jelas')
  ),
  constraint evaluasi_pekan_data_wajar
    check (pekan_data between 0 and public.pekan_evaluasi()),
  constraint evaluasi_keyakinan_dikenal check (keyakinan in ('rendah', 'sedang', 'tinggi')),
  -- Jaminan 3: hanya kode yang benar-benar dihasilkan `evaluasi4Mingguan`.
  -- Daftarnya sengaja ditulis penuh, bukan diringkas jadi pola `lg-%`: pola
  -- akan menerima kode salah ketik yang UI-nya tidak pernah bisa merender.
  constraint evaluasi_kode_dikenal check (kode in (
    'data-kurang',
    'lg-belum-surplus', 'lg-bersih', 'lg-lemak-dominan', 'lg-naik-campur',
    'lg-naik-tanpa-kekuatan', 'lg-rekomposisi', 'lg-stagnan',
    'cut-belum-defisit', 'cut-berjalan', 'cut-defisit-tipis',
    'cut-pinggang-belum-ikut', 'cut-terlalu-agresif',
    'mt-kekuatan-turun', 'mt-melayang-naik', 'mt-melayang-turun',
    'mt-rekomposisi', 'mt-stabil'
  )),
  constraint evaluasi_teks_wajar check (
    char_length(btrim(judul)) between 1 and 200
    and char_length(btrim(ringkas)) between 1 and 1000
    and char_length(btrim(rekomendasi)) between 1 and 2000
    and char_length(btrim(penentu)) between 1 and 200
  )
);

create index if not exists evaluasi_user_periode_idx
  on public.evaluasi_periodik (user_id, periode_dari desc);

comment on table public.evaluasi_periodik is
  'Verdict evaluasi 4 mingguan beserta ketiga sumbu yang menghasilkannya. '
  'Sumbunya disimpan, bukan hanya verdictnya: tanpa itu, verdict yang terasa '
  'salah tidak bisa ditelusuri ke masukannya.';

comment on column public.evaluasi_periodik.kode is
  'Kode stabil dari evaluasi4Mingguan. Daftarnya dibatasi CHECK supaya kode '
  'yang UI-nya tidak bisa merender tidak pernah tersimpan.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ringkasan_mingguan enable row level security;
alter table public.evaluasi_periodik enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'ringkasan_mingguan' and policyname = 'ringkasan_milik_sendiri'
  ) then
    create policy ringkasan_milik_sendiri on public.ringkasan_mingguan
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'evaluasi_periodik' and policyname = 'evaluasi_milik_sendiri'
  ) then
    create policy evaluasi_milik_sendiri on public.evaluasi_periodik
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pesan yang ditautkan harus milik pengguna yang sama.
--
-- Alasannya sama seperti pada `pesan_coach`: kunci asing menyelesaikan
-- referensi ke baris yang tidak terlihat oleh penulisnya, jadi tanpa pemicu ini
-- laporan bisa menunjuk pesan orang lain.
-- ---------------------------------------------------------------------------
create or replace function public.jaga_pemilik_pesan_tertaut()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pemilik uuid;
begin
  if new.pesan_id is null then
    return new;
  end if;
  select user_id into v_pemilik from public.pesan_coach where id = new.pesan_id;
  if v_pemilik is null then
    raise exception 'Pesan tidak ditemukan' using errcode = '23503';
  end if;
  if v_pemilik <> new.user_id then
    raise exception 'Laporan tidak boleh menunjuk pesan pengguna lain'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ringkasan_pesan_pemilik_sama on public.ringkasan_mingguan;
create trigger ringkasan_pesan_pemilik_sama
  before insert or update of pesan_id on public.ringkasan_mingguan
  for each row execute function public.jaga_pemilik_pesan_tertaut();

drop trigger if exists evaluasi_pesan_pemilik_sama on public.evaluasi_periodik;
create trigger evaluasi_pesan_pemilik_sama
  before insert or update of pesan_id on public.evaluasi_periodik
  for each row execute function public.jaga_pemilik_pesan_tertaut();

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.pekan_evaluasi() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.pekan_evaluasi() to authenticated';
    execute 'grant select, insert, update, delete on public.ringkasan_mingguan to authenticated';
    execute 'grant select, insert, update, delete on public.evaluasi_periodik to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.ringkasan_mingguan from anon';
    execute 'revoke all on public.evaluasi_periodik from anon';
  end if;
end $$;
