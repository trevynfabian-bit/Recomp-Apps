-- =============================================================================
-- Query ambil target satu (tipe hari x fase)
--
--   ambil_target(p_day_type_id, p_fase default null)
--
-- Untuk pemakai selain penyedia target di app (yang memuat semuanya sekaligus
-- lewat `muat_target`): web, Edge Function, atau layar yang hanya butuh satu
-- sel matriks. Selalu mengembalikan TEPAT satu baris untuk tipe hari milik
-- pengguna:
--   • `diisi = true`  → angka target, plus sisa karbo yang dihitung dari
--     kalori − protein×4 − lemak×9, dibulatkan ke bawah (sama dengan
--     `karboTersisaG` di @recomp/logika; dijaga `npm run cek:paritas`);
--   • `diisi = false` → angka NULL. Tidak ada cadangan dari tipe hari atau
--     fase lain: angka pinjaman adalah angka salah yang tampak benar, dan
--     pemanggil harus bisa mengatakan "belum diisi".
-- Tanpa `p_fase`, fase yang berlaku hari ini (Asia/Jakarta) yang dipakai.
-- Tipe hari yang bukan milik pengguna ditolak (23503), bukan dijawab kosong.
-- =============================================================================

create or replace function public.ambil_target(
  p_day_type_id uuid,
  p_fase public.fase_program default null
)
returns table (
  day_type_id uuid,
  nama_tipe_hari text,
  fase public.fase_program,
  diisi boolean,
  target_id uuid,
  target_kalori integer,
  target_protein_g numeric,
  target_lemak_g numeric,
  batas_sat_fat_g numeric,
  karbo_g integer,
  diperbarui_pada timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_nama text;
  v_fase public.fase_program;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select d.nama into v_nama
    from public.day_types d
   where d.id = p_day_type_id and d.user_id = v_user_id;
  if v_nama is null then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  v_fase := coalesce(p_fase, public.fase_pada_tanggal((now() at time zone 'Asia/Jakarta')::date));

  return query
  select p_day_type_id,
         v_nama,
         v_fase,
         t.id is not null,
         t.id,
         t.target_kalori,
         t.target_protein_g,
         t.target_lemak_g,
         t.batas_sat_fat_g,
         floor((t.target_kalori - t.target_protein_g * 4 - t.target_lemak_g * 9) / 4)::integer,
         t.updated_at
    from (select 1) as satu
    left join public.day_type_targets t
      on t.day_type_id = p_day_type_id and t.fase = v_fase and t.user_id = v_user_id;
end;
$$;

comment on function public.ambil_target(uuid, public.fase_program) is
  'Target satu (tipe hari x fase) milik pengguna, tepat satu baris; diisi=false tanpa cadangan bila belum diisi. '
  'Tanpa fase: fase yang berlaku hari ini.';

revoke all on function public.ambil_target(uuid, public.fase_program) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.ambil_target(uuid, public.fase_program) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ambil_target(uuid, public.fase_program) to authenticated';
  end if;
end $$;
