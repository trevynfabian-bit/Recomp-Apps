-- =============================================================================
-- Endpoint koneksi sumber data: sambung (jalur server) & putus (pengguna)
--
-- Tabel koneksi & rahasianya sudah ada, tetapi belum ada jalan resmi untuk
-- MENYAMBUNGKAN sumber ber-token (WHOOP, Strava, Hevy) atau MEMUTUSKANNYA:
-- pengguna hanya boleh menulis baris Apple Health, dan tabel rahasia hanya
-- untuk service role. Dua fungsi di sini menutupnya:
--
-- • `simpan_koneksi_sumber` — HANYA service role (Edge Function
--   `hubungkan-sumber`, setelah kode OAuth ditukar atau kunci Hevy diperiksa).
--   Koneksi dan rahasianya ditulis dalam SATU transaksi: tidak pernah ada
--   koneksi "terhubung" tanpa token, atau token tanpa koneksi.
-- • `putuskan_sumber` — pengguna yang masuk, untuk koneksinya sendiri. Status
--   menjadi `terputus` (pemicu yang sudah ada menghapus rahasianya), dan bila
--   diminta, data dari sumber itu ikut dihapus. Mengembalikan jumlah yang
--   dihapus supaya layar bisa mengatakannya.
--
-- Akun luar yang sudah terhubung ke pengguna lain ditolak indeks unik yang
-- sudah ada (23505). Aman dijalankan ulang.
-- =============================================================================

create or replace function public.simpan_koneksi_sumber(
  p_user_id uuid,
  p_sumber text,
  p_akun_eksternal text,
  p_access_token text,
  p_refresh_token text,
  p_kedaluwarsa_pada timestamptz,
  p_cakupan text[],
  p_kunci_api text
)
returns public.health_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_koneksi public.health_connections;
begin
  if p_user_id is null then
    raise exception 'Pengguna tidak boleh kosong' using errcode = '22004';
  end if;
  if p_sumber is null or p_sumber not in ('whoop', 'strava', 'hevy') then
    raise exception 'Sumber % tidak disambungkan lewat jalur ini', p_sumber using errcode = '22023';
  end if;
  if p_sumber = 'hevy' and (p_kunci_api is null or p_access_token is not null) then
    raise exception 'Hevy disambungkan dengan kunci API' using errcode = '22023';
  end if;
  if p_sumber <> 'hevy' and (p_access_token is null or p_akun_eksternal is null or p_kunci_api is not null) then
    raise exception '% disambungkan dengan token OAuth dan id akun', p_sumber using errcode = '22023';
  end if;

  insert into public.health_connections (user_id, sumber, status, akun_eksternal)
  values (p_user_id, p_sumber, 'terhubung', p_akun_eksternal)
  on conflict (user_id, sumber) do update
    set status = 'terhubung',
        akun_eksternal = excluded.akun_eksternal,
        galat_terakhir = null,
        galat_pada = null
  returning * into v_koneksi;

  insert into public.health_connection_secrets
    (connection_id, access_token, refresh_token, kedaluwarsa_pada, kunci_api, cakupan)
  values (v_koneksi.id, p_access_token, p_refresh_token, p_kedaluwarsa_pada, p_kunci_api, coalesce(p_cakupan, '{}'))
  on conflict (connection_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        kedaluwarsa_pada = excluded.kedaluwarsa_pada,
        kunci_api = excluded.kunci_api,
        cakupan = excluded.cakupan,
        updated_at = now();

  return v_koneksi;
end;
$$;

comment on function public.simpan_koneksi_sumber(uuid, text, text, text, text, timestamptz, text[], text) is
  'Sambungkan WHOOP/Strava (token OAuth + id akun) atau Hevy (kunci API) untuk satu pengguna, atomik. Hanya service role.';

create or replace function public.putuskan_sumber(p_sumber text, p_hapus_data boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_koneksi public.health_connections;
  v_data integer := 0;
  v_latihan integer := 0;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_sumber is null or p_sumber not in ('apple_health', 'whoop', 'strava', 'hevy') then
    raise exception 'Sumber % tidak dikenal', p_sumber using errcode = '22023';
  end if;

  update public.health_connections
     set status = 'terputus'
   where user_id = v_user and sumber = p_sumber
  returning * into v_koneksi;
  if v_koneksi.id is null then
    raise exception 'Sumber % belum pernah dihubungkan', p_sumber using errcode = 'P0002';
  end if;

  if coalesce(p_hapus_data, false) then
    delete from public.health_data where user_id = v_user and sumber = p_sumber;
    get diagnostics v_data = row_count;
    delete from public.workouts
     where user_id = v_user
       and sumber = (case p_sumber when 'apple_health' then 'healthkit' else p_sumber end)::public.sumber_workout;
    get diagnostics v_latihan = row_count;
  end if;

  return jsonb_build_object(
    'sumber', p_sumber,
    'status', v_koneksi.status,
    'diputus_pada', v_koneksi.diputus_pada,
    'data_dihapus', v_data,
    'latihan_dihapus', v_latihan
  );
end;
$$;

comment on function public.putuskan_sumber(text, boolean) is
  'Putuskan satu sumber data milik pengguna (rahasia ikut dihapus pemicu); opsional hapus datanya. Mengembalikan jumlah yang dihapus.';

revoke all on function public.simpan_koneksi_sumber(uuid, text, text, text, text, timestamptz, text[], text) from public, anon, authenticated;
revoke all on function public.putuskan_sumber(text, boolean) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.simpan_koneksi_sumber(uuid, text, text, text, text, timestamptz, text[], text) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.putuskan_sumber(text, boolean) to authenticated';
  end if;
end $$;
