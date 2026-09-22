-- ---------------------------------------------------------------------------
-- Riwayat fase & snapshot target harian yang lengkap.
--
-- Dua lubang yang ditutup migrasi ini punya akibat yang sama: riwayat yang
-- BERUBAH SENDIRI di belakang pengguna.
--
-- 1. Fase hanya tersimpan sebagai `profiles.fase_aktif` — satu nilai, tanpa
--    sejarah. Berpindah dari Lean Gain ke Cut di tengah pekan membuat seluruh
--    hari sebelumnya ikut dibaca sebagai Cut, dan budget mingguan yang sudah
--    berjalan berubah angkanya tanpa satu pun hari diedit.
-- 2. `daily_logs` hanya menyimpan snapshot `target_kalori`. Protein, lemak,
--    dan batas sat fat diambil ulang dari tabel target setiap kali dibaca,
--    jadi mengubah target hari ini juga mengubah "sisa protein" tiga pekan
--    lalu — dan angka yang sudah dilihat pengguna tidak boleh berubah
--    belakangan.
--
-- Keduanya bukan soal ketelitian angka, melainkan soal apakah catatan harian
-- masih bisa dipercaya sebagai catatan.
-- ---------------------------------------------------------------------------

-- --- 1. Riwayat fase -------------------------------------------------------
create table if not exists public.fase_periode (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fase public.fase_program not null,
  mulai_tanggal date not null,
  -- null berarti periode yang sedang berjalan. Tepat satu per pengguna.
  selesai_tanggal date,
  -- Rata-rata 7 hari saat periode dimulai; jangkar koridor target.
  berat_awal_kg numeric(5, 2),
  created_at timestamptz not null default now(),
  constraint fase_periode_urutan_masuk_akal
    check (selesai_tanggal is null or selesai_tanggal >= mulai_tanggal)
);

create index if not exists fase_periode_user_mulai_idx
  on public.fase_periode (user_id, mulai_tanggal desc);

-- Tepat SATU periode berjalan per pengguna. Tanpa ini, dua periode terbuka
-- membuat "fase pada tanggal X" punya dua jawaban yang sama sahnya.
create unique index if not exists fase_periode_satu_berjalan_idx
  on public.fase_periode (user_id)
  where selesai_tanggal is null;

comment on table public.fase_periode is
  'Riwayat fase program. Periode berjalan punya selesai_tanggal null, dan '
  'hanya boleh ada satu per pengguna.';

alter table public.fase_periode enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'fase_periode'
       and policyname = 'fase_periode_milik_sendiri'
  ) then
    create policy fase_periode_milik_sendiri on public.fase_periode
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- --- 2. Snapshot target harian yang lengkap --------------------------------
alter table public.daily_logs add column if not exists target_protein_g numeric(6, 1);
alter table public.daily_logs add column if not exists target_lemak_g numeric(6, 1);
alter table public.daily_logs add column if not exists batas_sat_fat_g numeric(6, 1);
-- Fase yang BERLAKU hari itu, bukan fase hari ini.
alter table public.daily_logs add column if not exists fase public.fase_program;

comment on column public.daily_logs.target_protein_g is
  'Snapshot target protein hari itu; riwayat tidak ikut berubah saat target diedit.';
comment on column public.daily_logs.fase is
  'Fase yang berlaku pada tanggal itu — bukan fase aktif saat baris dibaca.';

-- --- 3. Fase yang berlaku pada satu tanggal --------------------------------
-- Periode yang SUDAH DITUTUP adalah sejarah: fasenya tidak pernah berubah
-- lagi, apa pun yang terjadi pada profil sesudahnya. Periode yang masih
-- BERJALAN mengikuti `profiles.fase_aktif`, karena keduanya ditulis bersamaan
-- oleh `ganti_fase` dan profil adalah pernyataan niat yang paling terakhir
-- untuk periode yang sedang berlangsung.
create or replace function public.fase_pada_tanggal(p_tanggal date)
returns public.fase_program
language sql
stable
set search_path = ''
as $$
  with periode as (
    select f.fase, f.selesai_tanggal
      from public.fase_periode f
     where f.user_id = (select auth.uid())
       and f.mulai_tanggal <= p_tanggal
       and (f.selesai_tanggal is null or f.selesai_tanggal >= p_tanggal)
     order by f.mulai_tanggal desc
     limit 1
  )
  select coalesce(
    (
      select case
               when p.selesai_tanggal is null
                 then (select pr.fase_aktif from public.profiles pr
                        where pr.user_id = (select auth.uid()))
               else p.fase
             end
        from periode p
    ),
    -- Tanggal sebelum periode paling awal, atau pengguna tanpa riwayat sama
    -- sekali: fase aktif adalah tebakan terbaik yang tersedia.
    (select p.fase_aktif from public.profiles p where p.user_id = (select auth.uid()))
  );
$$;

comment on function public.fase_pada_tanggal(date) is
  'Fase yang berlaku pada satu tanggal. Periode yang sudah ditutup memegang '
  'fasenya sendiri selamanya; periode berjalan mengikuti profiles.fase_aktif.';

-- --- 4. Ganti fase ---------------------------------------------------------
-- Menutup periode berjalan dan membuka yang baru, dalam satu transaksi.
-- Jangkar beratnya diambil dari RATA-RATA 7 HARI, bukan timbangan hari itu:
-- koridor yang berangkat dari angka harian akan mewarisi goyangan air sebagai
-- titik nolnya, dan seluruh koridor ikut bergeser karenanya.
create or replace function public.ganti_fase(
  p_fase public.fase_program,
  p_tanggal date default null
)
returns public.fase_periode
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tanggal date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_berat numeric;
  v_berjalan public.fase_periode;
  v_baru public.fase_periode;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_berjalan
    from public.fase_periode
   where user_id = v_user_id and selesai_tanggal is null
   limit 1;

  -- Tanggal mulai tidak boleh masuk ke periode yang sudah DITUTUP; riwayat
  -- yang sudah selesai tidak ditulis ulang.
  if exists (
    select 1 from public.fase_periode
     where user_id = v_user_id and selesai_tanggal is not null
       and v_tanggal <= selesai_tanggal
  ) then
    raise exception 'Tanggal % menabrak periode fase yang sudah ditutup', v_tanggal
      using errcode = '22007';
  end if;

  -- Mengganti ke fase yang sama tidak membuat periode baru; ia hanya akan
  -- memotong riwayat menjadi dua tanpa ada yang berubah.
  if v_berjalan.id is not null and v_berjalan.fase = p_fase
     and v_tanggal >= v_berjalan.mulai_tanggal then
    return v_berjalan;
  end if;

  select r.rata_rata_kg into v_berat
    from public.rata_rata_berat_7_hari(v_tanggal) r;

  if v_berjalan.id is not null and v_tanggal <= v_berjalan.mulai_tanggal then
    -- Fase baru dimulai pada atau sebelum awal periode berjalan: periode itu
    -- tidak pernah benar-benar berjalan sehari pun, jadi ia DIGANTI, bukan
    -- ditutup. Menutupnya akan menghasilkan periode sepanjang nol hari —
    -- baris riwayat yang tidak pernah berlaku untuk tanggal mana pun.
    update public.fase_periode
       set fase = p_fase, mulai_tanggal = v_tanggal, berat_awal_kg = v_berat
     where id = v_berjalan.id
    returning * into v_baru;
  else
    if v_berjalan.id is not null then
      update public.fase_periode
         set selesai_tanggal = v_tanggal - 1
       where id = v_berjalan.id;
    end if;

    insert into public.fase_periode (user_id, fase, mulai_tanggal, berat_awal_kg)
    values (v_user_id, p_fase, v_tanggal, v_berat)
    returning * into v_baru;
  end if;

  update public.profiles
     set fase_aktif = p_fase,
         fase_mulai_tanggal = v_tanggal,
         fase_berat_awal_kg = v_berat
   where user_id = v_user_id;

  -- Hari yang sudah lewat TIDAK disentuh: snapshot targetnya adalah catatan
  -- atas apa yang berlaku saat itu. Hanya hari ini dan sesudahnya disegarkan.
  update public.daily_logs l
     set fase = p_fase,
         target_kalori = t.target_kalori,
         target_protein_g = t.target_protein_g,
         target_lemak_g = t.target_lemak_g,
         batas_sat_fat_g = t.batas_sat_fat_g
    from public.day_type_targets t
   where l.user_id = v_user_id
     and l.tanggal >= v_tanggal
     and l.day_type_id = t.day_type_id
     and t.fase = p_fase;

  return v_baru;
end;
$$;

comment on function public.ganti_fase(public.fase_program, date) is
  'Tutup periode fase berjalan dan buka yang baru. Jangkar berat diambil dari '
  'rata-rata 7 hari. Hari yang sudah lewat tidak disentuh.';

-- --- 5. setel_tipe_hari: snapshot lengkap ----------------------------------
create or replace function public.setel_tipe_hari(
  p_tanggal date,
  p_day_type_id uuid,
  p_override boolean default true
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_fase public.fase_program;
  v_target public.day_type_targets;
  v_baris public.daily_logs;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.day_types where id = p_day_type_id and user_id = v_user_id
  ) then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  -- Fase yang berlaku pada TANGGAL ITU, bukan fase aktif sekarang. Mencatat
  -- ulang tipe hari untuk tanggal lama tidak boleh menariknya ke fase baru.
  v_fase := public.fase_pada_tanggal(p_tanggal);
  if v_fase is null then
    raise exception 'Profil belum punya fase aktif' using errcode = '23502';
  end if;

  select * into v_target
    from public.day_type_targets
   where day_type_id = p_day_type_id and fase = v_fase;

  insert into public.daily_logs (
    user_id, tanggal, day_type_id, day_type_override,
    fase, target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g
  )
  values (
    v_user_id, p_tanggal, p_day_type_id, p_override,
    v_fase, v_target.target_kalori, v_target.target_protein_g,
    v_target.target_lemak_g, v_target.batas_sat_fat_g
  )
  on conflict (user_id, tanggal) do update
    set day_type_id       = excluded.day_type_id,
        day_type_override = excluded.day_type_override,
        fase              = excluded.fase,
        target_kalori     = excluded.target_kalori,
        target_protein_g  = excluded.target_protein_g,
        target_lemak_g    = excluded.target_lemak_g,
        batas_sat_fat_g   = excluded.batas_sat_fat_g
  returning * into v_baris;

  return v_baris;
end;
$$;

-- --- 6. ambil_target_harian: snapshot menang atas tabel target -------------
-- Sengaja TIDAK lewat `v_tipe_hari_aktif`: view itu hanya memuat baris untuk
-- fase yang sedang aktif, sehingga tanggal lama yang fasenya berbeda akan
-- menghilang sama sekali alih-alih mengembalikan snapshotnya sendiri.
create or replace function public.ambil_target_harian(p_tanggal date)
returns table (
  day_type_id uuid,
  nama_tipe_hari text,
  fase public.fase_program,
  override boolean,
  target_kalori integer,
  target_protein_g numeric,
  target_lemak_g numeric,
  batas_sat_fat_g numeric
)
language sql
stable
set search_path = ''
as $$
  with pilih as (
    select
      coalesce(
        (select l.day_type_id from public.daily_logs l
          where l.user_id = (select auth.uid()) and l.tanggal = p_tanggal),
        (select d.id from public.day_types d
          where d.user_id = (select auth.uid()) and d.is_default limit 1)
      ) as day_type_id,
      (select l.fase from public.daily_logs l
        where l.user_id = (select auth.uid()) and l.tanggal = p_tanggal) as fase_snapshot
  )
  select
    dt.id,
    dt.nama,
    coalesce(pl.fase_snapshot, public.fase_pada_tanggal(p_tanggal)),
    coalesce(l.day_type_override, false),
    coalesce(l.target_kalori, t.target_kalori),
    coalesce(l.target_protein_g, t.target_protein_g),
    coalesce(l.target_lemak_g, t.target_lemak_g),
    coalesce(l.batas_sat_fat_g, t.batas_sat_fat_g)
  from pilih pl
  join public.day_types dt
    on dt.id = pl.day_type_id and dt.user_id = (select auth.uid())
  left join public.daily_logs l
    on l.user_id = dt.user_id and l.tanggal = p_tanggal
  left join public.day_type_targets t
    on t.day_type_id = dt.id
   and t.fase = coalesce(pl.fase_snapshot, public.fase_pada_tanggal(p_tanggal));
$$;

-- --- 7. Riwayat periode untuk pengguna yang sudah ada -----------------------
-- Tanpa ini, `fase_pada_tanggal` selamanya jatuh ke cadangan dan riwayatnya
-- tetap bisa berubah saat fase diganti.
insert into public.fase_periode (user_id, fase, mulai_tanggal, berat_awal_kg)
select
  p.user_id,
  p.fase_aktif,
  coalesce(
    p.fase_mulai_tanggal,
    (select min(l.tanggal) from public.daily_logs l where l.user_id = p.user_id),
    current_date
  ),
  p.fase_berat_awal_kg
from public.profiles p
where not exists (
  select 1 from public.fase_periode f where f.user_id = p.user_id
);

-- --- 7b. Pengguna BARU ikut mendapat periode awal --------------------------
-- Tanpa ini, riwayat hanya dimiliki pengguna yang sudah ada saat migrasi
-- dijalankan, dan pengguna baru kembali ke perilaku lama tanpa ada yang tahu.
create or replace function public.siapkan_periode_fase_awal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fase_periode (user_id, fase, mulai_tanggal)
  values (new.user_id, new.fase_aktif, (now() at time zone 'Asia/Jakarta')::date)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_periode_fase_awal on public.profiles;
create trigger profiles_periode_fase_awal
  after insert on public.profiles
  for each row execute function public.siapkan_periode_fase_awal();

-- --- 8. Hak akses ----------------------------------------------------------
revoke all on function public.fase_pada_tanggal(date) from public;
revoke all on function public.ganti_fase(public.fase_program, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fase_pada_tanggal(date) to authenticated';
    execute 'grant execute on function public.ganti_fase(public.fase_program, date) to authenticated';
    execute 'grant select, insert, update, delete on public.fase_periode to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.fase_periode from anon';
  end if;
end $$;
