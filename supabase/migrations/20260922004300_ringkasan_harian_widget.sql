-- ---------------------------------------------------------------------------
-- Service ringkasan harian untuk widget (daily_summaries).
--
-- PRD: widget layar kunci membaca `daily_summaries` yang DIHITUNG SERVER —
-- WidgetKit tidak bisa menjalankan paket TypeScript, jadi angkanya harus
-- sudah jadi sebelum sampai ke iPhone.
--
-- Kapan dihitung ulang: SETIAP kali harinya berubah, oleh pemicu, bukan oleh
-- jadwal. Yang mengubah angka sisa hari ini semuanya menyentuh daily_logs:
-- makanan (total makro dijaga pemicu food_logs), berat, tipe hari (termasuk
-- auto-deteksi dari latihan yang masuk lewat webhook), redistribusi target.
-- Target per tipe hari yang diubah pengguna menghitung ulang HARI INI.
-- Jadwal hanya akan membuat angka basi di antara dua putaran.
--
-- Satu hal yang harus dipecahkan: fungsi target yang ada (`ambil_target_harian`,
-- `fase_pada_tanggal`) membaca pengguna dari auth.uid(). Saat webhook Strava
-- (service role) mengubah tipe hari, auth.uid() kosong. Maka di sini ada
-- kembarannya yang menerima pengguna sebagai argumen — dan uji paritas
-- memastikan keduanya memberi jawaban yang SAMA untuk setiap keadaan.
-- ---------------------------------------------------------------------------

-- --- Kembaran berargumen pengguna -------------------------------------------------
create or replace function public.fase_pada_tanggal_pengguna(p_user_id uuid, p_tanggal date)
returns public.fase_program
language sql
stable
set search_path = ''
as $$
  with periode as (
    select f.fase, f.selesai_tanggal
      from public.fase_periode f
     where f.user_id = p_user_id
       and f.mulai_tanggal <= p_tanggal
       and (f.selesai_tanggal is null or f.selesai_tanggal >= p_tanggal)
     order by f.mulai_tanggal desc
     limit 1
  )
  select coalesce(
    (select case when p.selesai_tanggal is null
                 then (select pr.fase_aktif from public.profiles pr where pr.user_id = p_user_id)
                 else p.fase end
       from periode p),
    (select p.fase_aktif from public.profiles p where p.user_id = p_user_id)
  );
$$;

create or replace function public.target_harian_pengguna(p_user_id uuid, p_tanggal date)
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
        (select l.day_type_id from public.daily_logs l where l.user_id = p_user_id and l.tanggal = p_tanggal),
        (select d.id from public.day_types d where d.user_id = p_user_id and d.is_default limit 1)
      ) as day_type_id,
      (select l.fase from public.daily_logs l where l.user_id = p_user_id and l.tanggal = p_tanggal) as fase_snapshot
  )
  select
    dt.id,
    dt.nama,
    coalesce(pl.fase_snapshot, public.fase_pada_tanggal_pengguna(p_user_id, p_tanggal)),
    coalesce(l.day_type_override, false),
    coalesce(l.target_kalori, t.target_kalori),
    coalesce(l.target_protein_g, t.target_protein_g),
    coalesce(l.target_lemak_g, t.target_lemak_g),
    coalesce(l.batas_sat_fat_g, t.batas_sat_fat_g)
  from pilih pl
  join public.day_types dt on dt.id = pl.day_type_id and dt.user_id = p_user_id
  left join public.daily_logs l on l.user_id = dt.user_id and l.tanggal = p_tanggal
  left join public.day_type_targets t
    on t.day_type_id = dt.id
   and t.fase = coalesce(pl.fase_snapshot, public.fase_pada_tanggal_pengguna(p_user_id, p_tanggal));
$$;

comment on function public.target_harian_pengguna(uuid, date) is
  'Kembaran ambil_target_harian untuk jalur server (tanpa auth.uid()). Dijaga sama oleh uji paritas.';

-- --- Tabel ----------------------------------------------------------------------------
create table if not exists public.daily_summaries (
  user_id uuid not null references auth.users (id) on delete cascade,
  tanggal date not null,
  nama_tipe_hari text,
  target_kalori integer,
  target_protein_g numeric(6, 1),
  kalori integer not null default 0,
  protein_g numeric(6, 1) not null default 0,
  -- Boleh negatif (sudah di atas target); null bila target tidak ada.
  sisa_kalori integer,
  sisa_protein_g numeric(6, 1),
  -- manual | estimasi (ada entri foto AI) — penanda yang sama dengan layar.
  sumber public.jenis_sumber not null default 'manual',
  dihitung_pada timestamptz not null default now(),
  primary key (user_id, tanggal),

  constraint daily_summaries_sisa_konsisten check (
    (target_kalori is null) = (sisa_kalori is null)
    and (target_protein_g is null) = (sisa_protein_g is null))
);

comment on table public.daily_summaries is
  'Sisa kalori & protein per hari, dihitung server setiap kali harinya berubah. Dibaca widget layar kunci.';

alter table public.daily_summaries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'daily_summaries' and policyname = 'ringkasan_harian_baca_sendiri'
  ) then
    -- Hanya baca: angka ini milik server. Klien yang bisa menulisnya bisa
    -- membuat widget berkata apa saja.
    create policy ringkasan_harian_baca_sendiri on public.daily_summaries
      for select using (user_id = (select auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.daily_summaries from authenticated';
    execute 'grant select on public.daily_summaries to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.daily_summaries from anon';
  end if;
end $$;

-- --- Hitung satu hari -------------------------------------------------------------------
create or replace function public.hitung_ringkasan_harian(p_user_id uuid, p_tanggal date)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_tgt record;
  v_log public.daily_logs;
  v_estimasi boolean;
begin
  -- Akun yang sedang dihapus: penghapusan berantai (fase, target) memicu
  -- hitung ulang untuk pengguna yang sudah tidak ada. Tidak ada yang dihitung.
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return;
  end if;
  select * into v_tgt from public.target_harian_pengguna(p_user_id, p_tanggal) limit 1;
  select * into v_log from public.daily_logs where user_id = p_user_id and tanggal = p_tanggal;
  select exists (select 1 from public.food_logs f where f.daily_log_id = v_log.id and f.sumber = 'foto_ai')
    into v_estimasi;

  insert into public.daily_summaries (
    user_id, tanggal, nama_tipe_hari, target_kalori, target_protein_g, kalori, protein_g,
    sisa_kalori, sisa_protein_g, sumber, dihitung_pada)
  values (
    p_user_id, p_tanggal, v_tgt.nama_tipe_hari, v_tgt.target_kalori, v_tgt.target_protein_g,
    coalesce(v_log.kalori, 0), coalesce(v_log.protein_g, 0),
    v_tgt.target_kalori - coalesce(v_log.kalori, 0),
    v_tgt.target_protein_g - coalesce(v_log.protein_g, 0),
    case when v_estimasi then 'estimasi' else 'manual' end::public.jenis_sumber,
    now())
  on conflict (user_id, tanggal) do update
    set nama_tipe_hari = excluded.nama_tipe_hari,
        target_kalori = excluded.target_kalori,
        target_protein_g = excluded.target_protein_g,
        kalori = excluded.kalori,
        protein_g = excluded.protein_g,
        sisa_kalori = excluded.sisa_kalori,
        sisa_protein_g = excluded.sisa_protein_g,
        sumber = excluded.sumber,
        dihitung_pada = excluded.dihitung_pada;
end;
$$;

/**
 * Pemicu: daily_logs berubah → ringkasan hari itu dihitung ulang.
 *
 * SECURITY DEFINER karena daily_summaries tidak bisa ditulis klien. Aman:
 * pengguna diturunkan dari BARIS yang memicu (yang sudah lolos RLS-nya
 * sendiri), bukan dari argumen, dan fungsi ini dicabut dari klien.
 */
create or replace function public.pemicu_ringkasan_harian()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.daily_summaries where user_id = old.user_id and tanggal = old.tanggal;
    return old;
  end if;
  perform public.hitung_ringkasan_harian(new.user_id, new.tanggal);
  return new;
end;
$$;

drop trigger if exists daily_logs_ringkasan_harian on public.daily_logs;
create trigger daily_logs_ringkasan_harian
  after insert or update or delete on public.daily_logs
  for each row execute function public.pemicu_ringkasan_harian();

/** Target per tipe hari diubah → ringkasan HARI INI pemiliknya dihitung ulang. */
create or replace function public.pemicu_ringkasan_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select d.user_id into v_user from public.day_types d where d.id = coalesce(new.day_type_id, old.day_type_id);
  if v_user is not null then
    perform public.hitung_ringkasan_harian(v_user, (now() at time zone 'Asia/Jakarta')::date);
  end if;
  return null;
end;
$$;

drop trigger if exists day_type_targets_ringkasan_harian on public.day_type_targets;
create trigger day_type_targets_ringkasan_harian
  after insert or update or delete on public.day_type_targets
  for each row execute function public.pemicu_ringkasan_target();

/** Fase diganti (periode baru/ditutup) → target HARI INI ikut berubah. */
create or replace function public.pemicu_ringkasan_fase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.hitung_ringkasan_harian(coalesce(new.user_id, old.user_id), (now() at time zone 'Asia/Jakarta')::date);
  return null;
end;
$$;

drop trigger if exists fase_periode_ringkasan_harian on public.fase_periode;
create trigger fase_periode_ringkasan_harian
  after insert or update or delete on public.fase_periode
  for each row execute function public.pemicu_ringkasan_fase();

drop trigger if exists profiles_ringkasan_harian on public.profiles;
create trigger profiles_ringkasan_harian
  after update of fase_aktif on public.profiles
  for each row when (old.fase_aktif is distinct from new.fase_aktif)
  execute function public.pemicu_ringkasan_fase();

-- Hari yang sudah ada saat migrasi ini dijalankan.
do $$
declare r record;
begin
  for r in select l.user_id, l.tanggal from public.daily_logs l
            where not exists (select 1 from public.daily_summaries s where s.user_id = l.user_id and s.tanggal = l.tanggal)
  loop
    perform public.hitung_ringkasan_harian(r.user_id, r.tanggal);
  end loop;
end $$;

-- --- Bacaan widget ---------------------------------------------------------------------
/**
 * Semua yang dibutuhkan widget dalam satu panggilan, berbentuk masukan
 * `siapkanWidget` di @recomp/logika:
 *   { tanggal, masuk: true, tampilkanAngka,
 *     ringkasan: { tanggal, sisaKalori, sisaProteinG, targetKalori, targetProteinG, dihitungPada } | null,
 *     target:    { kalori, proteinG } | null }
 * `ringkasan` null = hari ini belum punya ringkasan (hari baru); `target`
 * tetap dikirim supaya widget bisa berkata "Target 3.100 kcal" alih-alih kosong.
 */
create or replace function public.ringkasan_widget()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_s public.daily_summaries;
  v_t record;
  v_pref public.settings_notifications;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  select * into v_s from public.daily_summaries where user_id = v_user and tanggal = v_hari;
  -- Jalur sesi: ambil_target_harian (sama dengan kembarannya, dijaga uji paritas).
  select * into v_t from public.ambil_target_harian(v_hari) limit 1;
  v_pref := public.pengaturan_notifikasi();

  return jsonb_build_object(
    'tanggal', v_hari,
    'masuk', true,
    'tampilkanAngka', v_pref.widget_aktif,
    'ringkasan', case when v_s.user_id is null then null else jsonb_build_object(
      'tanggal', v_s.tanggal,
      'sisaKalori', v_s.sisa_kalori,
      'sisaProteinG', v_s.sisa_protein_g,
      'targetKalori', v_s.target_kalori,
      'targetProteinG', v_s.target_protein_g,
      'dihitungPada', v_s.dihitung_pada) end,
    'target', case when v_t.target_kalori is null then null
                   else jsonb_build_object('kalori', v_t.target_kalori, 'proteinG', v_t.target_protein_g) end
  );
end;
$$;

comment on function public.ringkasan_widget() is
  'Masukan widget hari ini (bentuk siapkanWidget): ringkasan server, target, dan preferensi angka.';

-- --- Hak -------------------------------------------------------------------------------
revoke execute on function public.pemicu_ringkasan_harian() from public, anon, authenticated;
revoke execute on function public.pemicu_ringkasan_target() from public, anon, authenticated;
revoke execute on function public.pemicu_ringkasan_fase() from public, anon, authenticated;

do $$
declare
  f text;
begin
  -- Menerima pengguna sebagai argumen: hanya server (dan pemicu di atas).
  foreach f in array array[
    'public.fase_pada_tanggal_pengguna(uuid, date)',
    'public.target_harian_pengguna(uuid, date)',
    'public.hitung_ringkasan_harian(uuid, date)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;

  execute 'revoke all on function public.ringkasan_widget() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.ringkasan_widget() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ringkasan_widget() to authenticated';
  end if;
end $$;

-- Widget diperbarui begitu server menghitung ulang, bukan saat app kebetulan dibuka.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'daily_summaries') then
    alter publication supabase_realtime add table public.daily_summaries;
  end if;
end $$;
