-- =============================================================================
-- Seed target bawaan: setiap akun yang memakai app punya 4 tipe hari x 3 fase
--
-- Pengguna BARU disiapkan pemicu `pengguna_baru_disiapkan` di auth.users
-- (migrasi seed_pengguna_baru_dan_rls): profil, empat tipe hari, dan 12
-- target absolut. Tetapi proyek Supabase-nya dipakai bersama web: akun yang
-- sudah ada SEBELUM migrasi itu dipasang tidak pernah melewati pemicunya, dan
-- saat membuka app untuk pertama kali ia tidak punya tipe hari maupun target
-- — app tidak punya satu pun angka untuk ditampilkan.
--
-- Penyiapannya kini juga terjadi saat pertama kali dibutuhkan: `muat_target`
-- memanggil `siapkan_data_awal_saya()` lebih dulu. Hanya akun yang BELUM
-- punya tipe hari sama sekali yang disiapkan, jadi:
--   • akun web yang tidak pernah membuka app tidak ditulisi apa pun;
--   • tipe hari yang sudah diganti nama atau dihapus pengguna tidak pernah
--     dimunculkan kembali oleh migrasi atau pemanggilan berikutnya.
-- Nilainya satu sumber: `siapkan_data_awal_pengguna`, yang juga dipakai pemicu.
-- =============================================================================

create or replace function public.siapkan_data_awal_saya()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if exists (select 1 from public.day_types where user_id = v_user_id) then
    return false;
  end if;
  perform public.siapkan_data_awal_pengguna(v_user_id);
  return true;
end;
$$;

comment on function public.siapkan_data_awal_saya() is
  'Siapkan profil, 4 tipe hari, dan 12 target bawaan untuk akun yang masuk, HANYA bila akun itu '
  'belum punya tipe hari sama sekali. true bila baru disiapkan. Pengguna diturunkan dari auth.uid().';

revoke all on function public.siapkan_data_awal_saya() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.siapkan_data_awal_saya() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.siapkan_data_awal_saya() to authenticated';
  end if;
end $$;

-- muat_target: siapkan lebih dulu bila perlu, lalu baca seperti sebelumnya.
-- Tidak lagi STABLE karena bisa menulis pada panggilan pertama sebuah akun.
create or replace function public.muat_target()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  perform public.siapkan_data_awal_saya();

  return jsonb_build_object(
    'tipe_hari', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', d.id, 'nama', d.nama, 'auto_detect', d.auto_detect,
                 'is_default', d.is_default, 'urutan', d.urutan)
               order by d.urutan, d.nama)
        from public.day_types d
       where d.user_id = v_user_id
    ), '[]'::jsonb),
    'target', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', t.id, 'day_type_id', t.day_type_id, 'fase', t.fase,
                 'target_kalori', t.target_kalori, 'target_protein_g', t.target_protein_g,
                 'target_lemak_g', t.target_lemak_g, 'batas_sat_fat_g', t.batas_sat_fat_g,
                 'updated_at', t.updated_at)
               order by t.day_type_id, t.fase)
        from public.day_type_targets t
       where t.user_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.muat_target() is
  'Tipe hari dan seluruh target (tiap tipe hari x tiap fase) milik pengguna, dalam satu snapshot. '
  'Akun yang belum pernah disiapkan (mis. akun web lama) disiapkan dulu dengan nilai bawaan.';
