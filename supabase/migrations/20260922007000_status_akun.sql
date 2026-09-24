-- =============================================================================
-- Endpoint status akun
--
-- Setelan perlu fakta akun yang hanya ada di `auth.users` (tanggal bergabung,
-- email terkonfirmasi, masuk terakhir) dan beberapa kesimpulan dari tabel app
-- (profil lengkap untuk body fat, data awal sudah disiapkan, sumber yang
-- terhubung). `auth.users` tidak terbaca klien, jadi fungsinya DEFINER; ia
-- hanya membaca baris milik `auth.uid()` dan tidak menerima id pengguna dari
-- pemanggil. Tanpa endpoint ini Setelan menampilkan tanggal bergabung tiruan
-- untuk akun sungguhan. Aman dijalankan ulang.
-- =============================================================================

create or replace function public.status_akun_saya()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_akun auth.users;
  v_profil public.profiles;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  select * into v_akun from auth.users where id = v_user;
  if v_akun.id is null then
    raise exception 'Akun tidak ditemukan' using errcode = 'P0002';
  end if;
  select * into v_profil from public.profiles where user_id = v_user;

  return jsonb_build_object(
    'email', v_akun.email,
    'email_terkonfirmasi', v_akun.email_confirmed_at is not null,
    'bergabung_pada', v_akun.created_at,
    'masuk_terakhir', v_akun.last_sign_in_at,
    'profil', jsonb_build_object(
      'ada', v_profil.user_id is not null,
      'nama', v_profil.nama,
      'fase_aktif', v_profil.fase_aktif,
      -- Tinggi & jenis kelamin dibutuhkan estimasi lemak tubuh (Navy).
      'lengkap', v_profil.tinggi_cm is not null and v_profil.jenis_kelamin is not null
    ),
    'data_awal_siap', exists (select 1 from public.day_types where user_id = v_user),
    'sumber_terhubung', coalesce((
      select jsonb_agg(sumber order by sumber) from public.health_connections
       where user_id = v_user and status = 'terhubung'), '[]'::jsonb)
  );
end;
$$;

comment on function public.status_akun_saya() is
  'Status akun pengguna yang masuk: email & konfirmasi, tanggal bergabung, masuk terakhir, kelengkapan profil, data awal, sumber terhubung.';

revoke all on function public.status_akun_saya() from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.status_akun_saya() to authenticated';
  end if;
end $$;
