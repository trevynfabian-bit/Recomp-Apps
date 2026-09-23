-- ---------------------------------------------------------------------------
-- Koneksi sumber data kesehatan: Apple Health, WHOOP, Strava, Hevy.
--
-- Dua tabel, bukan satu, dan itu keputusan utama berkas ini:
--
--   • health_connections        — STATUS koneksi. Dibaca pemiliknya: layar
--                                  Sumber data, indikator sinkron, konteks coach.
--   • health_connection_secrets — token OAuth (Strava, WHOOP) dan kunci API
--                                  Hevy. TIDAK ADA hak klien sama sekali; hanya
--                                  Edge Function (service role) yang membaca.
--
-- Kenapa dipisah: RLS bekerja per BARIS. Token di tabel yang sama berarti
-- setiap sesi yang boleh membaca statusnya sendiri juga membaca refresh
-- token-nya — termasuk JWT dari ponsel yang hilang. Hak per kolom bisa
-- menutupnya, tapi rapuh: `select *` klien langsung gagal, dan kolom baru
-- otomatis mewarisi hak tabel. Tabel terpisah tanpa hak klien tidak punya
-- celah semacam itu, dan aturannya diuji sebagai ATURAN katalog (lihat
-- supabase/tests/rls_koneksi_sumber.sql): tabel publik mana pun yang memuat
-- kolom token/kunci tidak boleh terbaca klien.
--
-- Siapa menulis apa:
--   • Apple Health ditulis PERANGKAT. Izin HealthKit hanya ada di iPhone, jadi
--     hanya perangkat yang tahu apakah koneksinya hidup. Klien boleh menulis
--     baris `apple_health` miliknya sendiri — tidak ada token di sana.
--   • Strava, WHOOP, Hevy ditulis SERVER: callback OAuth, validasi kunci Hevy,
--     webhook, dan cron. Klien hanya membaca. Status "terhubung" untuk sumber
--     ber-token yang bisa ditulis klien adalah status yang bisa berbohong.
--
-- Memutuskan koneksi TIDAK menghapus baris: status menjadi `terputus` dan
-- tokennya dihapus. Barisnya tetap ada supaya layar bisa berkata "terputus
-- sejak 12 September" alih-alih pura-pura sumber itu tidak pernah ada.
-- ---------------------------------------------------------------------------

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sumber text not null,
  -- Diturunkan dari sumber, tidak pernah ditulis: mekanisme yang tidak cocok
  -- dengan sumbernya (Strava lewat cron) hanya bisa terjadi bila kolom ini
  -- boleh diisi bebas.
  mekanisme text generated always as (
    case sumber
      when 'apple_health' then 'healthkit'
      when 'hevy' then 'cron'
      else 'webhook'
    end
  ) stored,
  status text not null default 'terhubung',
  -- Id akun di layanan luar (athlete id Strava, user id WHOOP). Webhook hanya
  -- membawa id ini, jadi dari sinilah kiriman diarahkan ke pengguna.
  akun_eksternal text,
  terhubung_pada timestamptz not null default now(),
  -- Diisi pemicu saat status menjadi `terputus`; dikosongkan saat tersambung lagi.
  diputus_pada timestamptz,
  -- Data terakhir yang BERHASIL masuk; `null` bila belum pernah.
  sinkron_terakhir timestamptz,
  -- Galat terakhir dari layanan, sudah berbahasa Indonesia untuk ditampilkan.
  galat_terakhir text,
  galat_pada timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint health_connections_sumber_sah
    check (sumber in ('apple_health', 'whoop', 'strava', 'hevy')),
  constraint health_connections_status_sah
    check (status in ('terhubung', 'terputus')),
  -- Satu baris per sumber per pengguna: menyambung ulang MEMPERBARUI baris itu.
  constraint health_connections_satu_per_sumber unique (user_id, sumber),
  constraint health_connections_putus_konsisten
    check ((status = 'terputus') = (diputus_pada is not null)),
  -- Apple Health tidak punya akun di luar perangkat; Hevy memakai kunci API,
  -- bukan akun yang dikirim lewat webhook.
  constraint health_connections_akun_eksternal_sah
    check (akun_eksternal is null or sumber in ('whoop', 'strava')),
  constraint health_connections_akun_eksternal_isi
    check (akun_eksternal is null or char_length(akun_eksternal) between 1 and 64),
  -- Pesan untuk layar, bukan tumpukan galat mentah dari layanan luar.
  constraint health_connections_galat_ringkas
    check (galat_terakhir is null or char_length(galat_terakhir) between 1 and 300),
  constraint health_connections_galat_berwaktu
    check ((galat_terakhir is null) = (galat_pada is null))
);

comment on table public.health_connections is
  'Status koneksi sumber data kesehatan per pengguna. Token & kunci ada di health_connection_secrets.';
comment on column public.health_connections.mekanisme is
  'healthkit / webhook / cron — diturunkan dari sumber, tidak bisa ditulis.';
comment on column public.health_connections.akun_eksternal is
  'Id akun Strava/WHOOP untuk mengarahkan webhook ke pengguna yang benar.';

-- Webhook datang membawa (sumber, id akun). Dua pengguna yang sama-sama
-- TERHUBUNG ke satu akun Strava membuat kiriman itu tidak bisa diarahkan —
-- dan diam-diam masuk ke orang yang salah. Setelah salah satunya memutus,
-- akun itu boleh dipakai lagi.
create unique index if not exists health_connections_akun_eksternal_unik
  on public.health_connections (sumber, akun_eksternal)
  where akun_eksternal is not null and status = 'terhubung';

drop trigger if exists health_connections_set_updated_at on public.health_connections;
create trigger health_connections_set_updated_at
  before update on public.health_connections
  for each row execute function public.set_updated_at();

/**
 * Waktu putus & sambung dijaga database, bukan pemanggil: tiga penulis
 * (perangkat, callback OAuth, cron) yang masing-masing wajib ingat mengisi
 * `diputus_pada` adalah tiga kesempatan untuk lupa.
 */
create or replace function public.sesuaikan_waktu_koneksi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'terputus' then
    new.diputus_pada := coalesce(
      case when tg_op = 'UPDATE' and old.status = 'terputus' then old.diputus_pada end,
      now());
  else
    new.diputus_pada := null;
    -- Tersambung LAGI: waktunya ikut diperbarui, supaya "terhubung sejak"
    -- tidak menunjuk ke koneksi lama yang sudah diputus.
    if tg_op = 'UPDATE' and old.status = 'terputus' then
      new.terhubung_pada := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists health_connections_sesuaikan_waktu on public.health_connections;
create trigger health_connections_sesuaikan_waktu
  before insert or update of status on public.health_connections
  for each row execute function public.sesuaikan_waktu_koneksi();

-- ---------------------------------------------------------------------------
-- Rahasia: token & kunci. Hanya service role.
-- ---------------------------------------------------------------------------
create table if not exists public.health_connection_secrets (
  connection_id uuid primary key
    references public.health_connections (id) on delete cascade,
  access_token text,
  refresh_token text,
  kedaluwarsa_pada timestamptz,
  kunci_api text,
  cakupan text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Baris rahasia tanpa rahasia adalah sisa yang lupa dihapus.
  constraint health_connection_secrets_berisi
    check (num_nonnulls(access_token, kunci_api) >= 1),
  -- OAuth dan kunci API tidak dicampur dalam satu koneksi.
  constraint health_connection_secrets_satu_jenis
    check (kunci_api is null or (access_token is null and refresh_token is null and kedaluwarsa_pada is null))
);

comment on table public.health_connection_secrets is
  'Token OAuth & kunci API sumber data. Tanpa hak klien; hanya Edge Function (service role).';

drop trigger if exists health_connection_secrets_set_updated_at on public.health_connection_secrets;
create trigger health_connection_secrets_set_updated_at
  before update on public.health_connection_secrets
  for each row execute function public.set_updated_at();

/**
 * Putus = token dihapus. Token koneksi yang sudah diputus pengguna tidak
 * punya kegunaan sah apa pun, dan setiap token yang disimpan adalah token
 * yang bisa bocor.
 *
 * INVOKER, dan pemicunya hanya untuk sumber BER-TOKEN: baris itu hanya bisa
 * diubah service role, yang memang berhak atas tabel rahasia. Perubahan
 * baris Apple Health oleh perangkat tidak pernah menyentuh tabel rahasia —
 * tanpa hak DEFINER yang akan melewati RLS.
 */
create or replace function public.hapus_rahasia_saat_putus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.health_connection_secrets where connection_id = new.id;
  return new;
end;
$$;

drop trigger if exists health_connections_hapus_rahasia on public.health_connections;
create trigger health_connections_hapus_rahasia
  after update of status on public.health_connections
  for each row
  when (new.status = 'terputus' and old.status is distinct from 'terputus' and new.sumber <> 'apple_health')
  execute function public.hapus_rahasia_saat_putus();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.health_connections enable row level security;
alter table public.health_connection_secrets enable row level security;
-- health_connection_secrets sengaja TANPA kebijakan: tanpa kebijakan, RLS
-- menolak semua baris untuk peran selain service role (yang melewati RLS).

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_connections' and policyname = 'koneksi_baca_milik_sendiri'
  ) then
    create policy koneksi_baca_milik_sendiri on public.health_connections
      for select using (user_id = (select auth.uid()));
  end if;

  -- Perangkat menulis baris Apple Health-nya sendiri; sumber ber-token tidak.
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_connections' and policyname = 'koneksi_perangkat_tambah'
  ) then
    create policy koneksi_perangkat_tambah on public.health_connections
      for insert with check (user_id = (select auth.uid()) and sumber = 'apple_health');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'health_connections' and policyname = 'koneksi_perangkat_ubah'
  ) then
    create policy koneksi_perangkat_ubah on public.health_connections
      for update
      using (user_id = (select auth.uid()) and sumber = 'apple_health')
      with check (user_id = (select auth.uid()) and sumber = 'apple_health');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Tanpa DELETE: memutus = status `terputus`, riwayatnya tetap ada.
    execute 'revoke all on public.health_connections from authenticated';
    execute 'grant select, insert, update on public.health_connections to authenticated';
    execute 'revoke all on public.health_connection_secrets from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.health_connections from anon';
    execute 'revoke all on public.health_connection_secrets from anon';
  end if;
  -- Supabase memberi hak lewat PUBLIC juga di beberapa versi; tutup semuanya.
  execute 'revoke all on public.health_connection_secrets from public';
end $$;

-- Pemicu tidak untuk dipanggil langsung.
revoke execute on function public.sesuaikan_waktu_koneksi() from public, anon, authenticated;
revoke execute on function public.hapus_rahasia_saat_putus() from public, anon, authenticated;
