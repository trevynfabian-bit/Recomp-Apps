-- =============================================================================
-- Kuota pertanyaan AI Coach per hari.
--
-- Setiap pertanyaan ke coach adalah panggilan model yang dibayar pemilik app.
-- Sesi yang dicuri, klien yang macet dalam perulangan, atau skrip yang
-- memanggil endpoint terus-menerus bisa menghabiskan tagihan sebulan dalam
-- semalam — dan tidak ada yang tahu sampai tagihannya datang.
--
-- Tiga keputusan bentuk:
--
-- 1. Batasnya ditegakkan di BARIS, bukan di Edge Function. `coach-chat`
--    menyimpan pertanyaan lebih dulu sebelum memanggil model, jadi pemicu di
--    sini menolak pertanyaan ke-(batas+1) sebelum satu token pun dibayar.
--    Pemeriksaan di kode endpoint bisa dilewati versi endpoint yang lupa
--    memanggilnya; baris tidak bisa.
-- 2. Hitungannya disimpan di tabel PENCACAH sendiri, bukan dihitung dari
--    `pesan_coach`. Pengguna berhak menghapus riwayat chat-nya, dan RLS
--    membolehkan ia mengubah barisnya sendiri — jadi hitungan dari pesan bisa
--    dinolkan cukup dengan menghapus atau memundurkan `waktu` pesan hari ini.
--    Pencacah hanya bisa DIBACA pengguna; yang menulisnya hanya pemicu.
-- 3. `on conflict do update` mengunci baris pencacah, jadi dua pertanyaan yang
--    datang bersamaan tidak bisa sama-sama lolos di angka batas.
--
-- Yang dihitung hanya pesan peran 'pengguna' per hari Asia/Jakarta. Jawaban
-- coach, kartu ringkasan, dan penolakan tidak menghabiskan kuota; pertanyaan
-- yang ditolak batas medis juga tidak, karena tidak pernah disimpan.
-- =============================================================================

/** Batas pertanyaan per hari. Jauh di atas pemakaian wajar satu orang. */
create or replace function public.batas_pertanyaan_coach_harian()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50; $$;

create table if not exists public.pemakaian_coach_harian (
  user_id uuid not null references auth.users (id) on delete cascade,
  /* Hari menurut Asia/Jakarta. */
  tanggal date not null,
  jumlah integer not null default 0,
  primary key (user_id, tanggal),
  constraint pemakaian_jumlah_wajar check (jumlah >= 0)
);

comment on table public.pemakaian_coach_harian is
  'Pencacah pertanyaan coach per hari. Ditulis HANYA oleh pemicu; pengguna '
  'hanya bisa membacanya, jadi menghapus riwayat chat tidak memulihkan kuota.';

alter table public.pemakaian_coach_harian enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'pemakaian_coach_harian' and policyname = 'pemakaian_baca_sendiri'
  ) then
    -- Hanya SELECT. Tidak ada kebijakan tulis sama sekali: tanpa kebijakan,
    -- RLS menolak setiap insert/update/delete dari pengguna.
    create policy pemakaian_baca_sendiri on public.pemakaian_coach_harian
      for select using (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Pemicu pencacah.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER karena menulis tabel yang sengaja tidak bisa ditulis
-- pengguna. Aman karena dua hal:
--   • ia fungsi PEMICU — tidak bisa dipanggil langsung, dan hak EXECUTE-nya
--     dicabut dari semua peran klien di bawah;
--   • baris yang BUKAN milik sesi yang sedang berjalan tidak dicacah sama
--     sekali. Kebijakan RLS `with check` dievaluasi SESUDAH pemicu BEFORE, jadi
--     sisipan atas nama orang lain tetap ditolak RLS — tapi tanpa penjagaan
--     ini, pemicu akan lebih dulu menjawab "kuota orang itu sudah habis" dan
--     membocorkan pemakaian pengguna lain.
create or replace function public.catat_pertanyaan_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jumlah integer;
begin
  if new.user_id is distinct from (select auth.uid()) then
    return new;
  end if;

  insert into public.pemakaian_coach_harian as p (user_id, tanggal, jumlah)
  values (new.user_id, (now() at time zone 'Asia/Jakarta')::date, 1)
  on conflict (user_id, tanggal) do update set jumlah = p.jumlah + 1
  returning p.jumlah into v_jumlah;

  if v_jumlah > public.batas_pertanyaan_coach_harian() then
    -- Kesalahan ini membatalkan transaksinya, termasuk tambahan pencacah di
    -- atas: pertanyaan yang ditolak tidak ikut terhitung.
    raise exception 'Batas % pertanyaan per hari sudah tercapai',
      public.batas_pertanyaan_coach_harian()
      using errcode = '54000';  -- program_limit_exceeded
  end if;
  return new;
end;
$$;

drop trigger if exists pesan_coach_kuota_harian on public.pesan_coach;
create trigger pesan_coach_kuota_harian
  before insert on public.pesan_coach
  for each row
  when (new.peran = 'pengguna')
  execute function public.catat_pertanyaan_coach();

-- ---------------------------------------------------------------------------
-- Sisa kuota, untuk ditampilkan app sebelum pengguna mengetik.
-- ---------------------------------------------------------------------------
create or replace function public.kuota_coach()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_terpakai integer;
  v_batas integer := public.batas_pertanyaan_coach_harian();
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select coalesce(max(p.jumlah), 0) into v_terpakai
    from public.pemakaian_coach_harian p
   where p.user_id = v_user and p.tanggal = v_hari;

  return jsonb_build_object(
    'terpakai', v_terpakai,
    'batas', v_batas,
    'sisa', greatest(v_batas - v_terpakai, 0),
    'pulih_pada', ((v_hari + 1)::timestamp at time zone 'Asia/Jakarta')
  );
end;
$$;

comment on function public.kuota_coach() is
  'Pertanyaan coach yang sudah dipakai hari ini (Asia/Jakarta), batasnya, dan '
  'kapan kuotanya pulih.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.catat_pertanyaan_coach() from public;
revoke all on function public.batas_pertanyaan_coach_harian() from public;
revoke all on function public.kuota_coach() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.catat_pertanyaan_coach() from anon';
    execute 'revoke all on function public.batas_pertanyaan_coach_harian() from anon';
    execute 'revoke all on function public.kuota_coach() from anon';
    execute 'revoke all on public.pemakaian_coach_harian from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Pemicu tidak butuh EXECUTE saat menyala; mencabutnya membuat fungsi
    -- DEFINER ini tidak bisa dijangkau klien sama sekali.
    execute 'revoke all on function public.catat_pertanyaan_coach() from authenticated';
    execute 'grant execute on function public.batas_pertanyaan_coach_harian() to authenticated';
    execute 'grant execute on function public.kuota_coach() to authenticated';
    -- Hanya baca. Default privileges Supabase memberi semua hak tabel; dicabut
    -- dulu supaya tulis tertutup di tingkat HAK, bukan hanya di RLS.
    execute 'revoke all on public.pemakaian_coach_harian from authenticated';
    execute 'grant select on public.pemakaian_coach_harian to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.catat_pertanyaan_coach() from service_role';
    execute 'grant execute on function public.batas_pertanyaan_coach_harian() to service_role';
  end if;
end $$;
