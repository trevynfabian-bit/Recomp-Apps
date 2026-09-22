-- =============================================================================
-- Tipe hari & target harian
--
-- Target harian SELALU turunan dari (tipe hari x fase aktif) di
-- `day_type_targets` — nilai absolut, tanpa faktor pengali. Yang disimpan di
-- `daily_logs.target_kalori` hanyalah SNAPSHOT-nya, supaya riwayat lama tidak
-- ikut berubah ketika pengguna mengedit targetnya hari ini.
--
-- Catatan cakupan: auto-deteksi tipe hari DARI WORKOUT baru mungkin di Fase 2,
-- saat tabel `workouts` ada. Yang "otomatis" di sini adalah targetnya: begitu
-- tipe hari atau fase berubah, target ikut tanpa perlu diketik ulang.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- View: tipe hari milik pengguna beserta target untuk FASE AKTIF-nya
--
-- `security_invoker` wajib: tanpa itu view berjalan sebagai pemiliknya dan
-- melewati RLS tabel dasarnya — seluruh isolasi data akan bocor lewat view.
-- ---------------------------------------------------------------------------
create or replace view public.v_tipe_hari_aktif
with (security_invoker = true) as
select
  d.id            as day_type_id,
  d.user_id,
  d.nama,
  d.auto_detect,
  d.is_default,
  d.urutan,
  p.fase_aktif    as fase,
  t.id            as target_id,
  t.target_kalori,
  t.target_protein_g,
  t.target_lemak_g,
  t.batas_sat_fat_g
from public.day_types d
join public.profiles p
  on p.user_id = d.user_id
left join public.day_type_targets t
  on t.day_type_id = d.id
 and t.fase = p.fase_aktif;

comment on view public.v_tipe_hari_aktif is
  'Tipe hari pengguna beserta target absolut untuk fase yang sedang aktif. '
  'security_invoker: RLS tabel dasar tetap berlaku.';

-- ---------------------------------------------------------------------------
-- Setel tipe hari untuk satu tanggal
--
-- Seperti simpan_berat_pagi, ini fungsi database supaya kolom lain di baris
-- hari itu (berat, makro, catatan) tidak ikut tertimpa.
-- ---------------------------------------------------------------------------
create or replace function public.setel_tipe_hari(
  p_tanggal date,
  p_day_type_id uuid,
  -- true = pilihan manual pengguna, false = mengikuti auto-deteksi.
  p_override boolean default true
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_fase public.fase_program;
  v_target_kalori integer;
  v_baris public.daily_logs;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  -- Tipe hari harus milik pengguna ini. RLS sudah menyembunyikan milik orang
  -- lain, jadi baris yang tak terlihat otomatis dianggap tidak ada.
  if not exists (
    select 1 from public.day_types where id = p_day_type_id and user_id = v_user_id
  ) then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  select fase_aktif into v_fase from public.profiles where user_id = v_user_id;
  if v_fase is null then
    raise exception 'Profil belum punya fase aktif' using errcode = '23502';
  end if;

  -- Target diambil dari kombinasi (tipe hari x fase aktif); null bila memang
  -- belum ada targetnya, dan itu bukan kesalahan fatal.
  select target_kalori into v_target_kalori
    from public.day_type_targets
   where day_type_id = p_day_type_id and fase = v_fase;

  insert into public.daily_logs (user_id, tanggal, day_type_id, day_type_override, target_kalori)
  values (v_user_id, p_tanggal, p_day_type_id, p_override, v_target_kalori)
  on conflict (user_id, tanggal) do update
    -- Hanya tipe hari + snapshot targetnya; berat, makro, catatan dibiarkan.
    set day_type_id       = excluded.day_type_id,
        day_type_override = excluded.day_type_override,
        target_kalori     = excluded.target_kalori
  returning * into v_baris;

  return v_baris;
end;
$$;

comment on function public.setel_tipe_hari(date, uuid, boolean) is
  'Menyetel tipe hari satu tanggal dan menyegarkan snapshot target_kalori dari '
  '(tipe hari x fase aktif). Kolom lain di baris hari itu tidak disentuh.';

-- ---------------------------------------------------------------------------
-- Target efektif satu tanggal
--
-- Memakai tipe hari yang tercatat di daily_logs; bila hari itu belum punya
-- tipe hari, jatuh ke tipe hari bawaan pengguna.
-- ---------------------------------------------------------------------------
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
  select
    v.day_type_id,
    v.nama,
    v.fase,
    coalesce(l.day_type_override, false),
    v.target_kalori,
    v.target_protein_g,
    v.target_lemak_g,
    v.batas_sat_fat_g
  from public.v_tipe_hari_aktif v
  left join public.daily_logs l
    on l.user_id = v.user_id and l.tanggal = p_tanggal
  where v.user_id = (select auth.uid())
    -- Tipe hari yang tercatat hari itu; kalau belum ada, pakai yang bawaan.
    and v.day_type_id = coalesce(
      (select day_type_id from public.daily_logs
        where user_id = (select auth.uid()) and tanggal = p_tanggal),
      (select id from public.day_types
        where user_id = (select auth.uid()) and is_default
        order by urutan limit 1)
    )
  limit 1;
$$;

comment on function public.ambil_target_harian(date) is
  'Target absolut yang berlaku untuk satu tanggal. Memakai tipe hari yang '
  'tercatat hari itu, atau tipe hari bawaan bila belum ditentukan.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.setel_tipe_hari(date, uuid, boolean) from public;
revoke all on function public.ambil_target_harian(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.setel_tipe_hari(date, uuid, boolean) to authenticated';
    execute 'grant execute on function public.ambil_target_harian(date) to authenticated';
    execute 'grant select on public.v_tipe_hari_aktif to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.v_tipe_hari_aktif from anon';
  end if;
end $$;
