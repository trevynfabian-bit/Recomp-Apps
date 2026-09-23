-- =============================================================================
-- Pengerasan hak EXECUTE fungsi.
--
-- Supabase memberi EXECUTE atas setiap fungsi baru di skema `public` kepada
-- `anon`, `authenticated`, dan `service_role` SECARA LANGSUNG lewat default
-- privileges — bukan lewat PUBLIC. Akibatnya pola yang dipakai migrasi-migrasi
-- sebelumnya, `revoke all on function ... from public`, TIDAK mencabut apa pun
-- dari `anon` di produksi. Harness lokal dulu tidak meniru default itu, jadi
-- setiap uji "anon tidak boleh menjalankan X" lulus di sini dan bohong di sana.
--
-- Dua hal yang diperbaiki:
--
-- 1. `anon` kehilangan EXECUTE atas SEMUA fungsi publik, sekarang dan ke
--    depan. Tidak ada satu pun RPC di app ini yang masuk akal tanpa sesi;
--    pengunci yang sama dengan tabel (lihat migrasi seed, bagian 4).
--
-- 2. Fungsi SECURITY DEFINER yang menerima id pengguna/baris sebagai argumen
--    dicabut juga dari `authenticated`. Fungsi-fungsi itu melewati RLS dan
--    mempercayai argumennya, jadi pengguna yang login bisa menjalankannya atas
--    data orang lain: menyiapkan data awal untuk id siapa pun, menghitung ulang
--    total makro log orang lain, atau menjalankan auto-deteksi tipe hari atas
--    nama pengguna lain. Semuanya hanya dipanggil pemicu atau fungsi DEFINER
--    lain (yang berjalan sebagai pemiliknya), jadi tidak ada klien yang
--    kehilangan apa pun.
--
-- PUBLIC juga dicabut: fungsi yang tidak pernah mencabutnya masih bisa
-- dijalankan `anon` lewat PUBLIC, dan yang dibutuhkan `authenticated` sudah
-- diberikan langsung oleh default privileges Supabase. Validator CHECK
-- (`rujukan_bersumber`, `widget_bersumber`) diberikan ULANG secara eksplisit ke
-- `authenticated`, karena CHECK memanggilnya dengan hak pengguna yang menyisipkan
-- baris — kalau haknya hilang, pesan coach tidak bisa disimpan sama sekali.
-- =============================================================================

-- 1. Cabut dari anon dan PUBLIC, untuk fungsi yang sudah ada.
revoke execute on all functions in schema public from public, anon;

-- 2. ...dan untuk fungsi yang akan dibuat migrasi berikutnya. Default anon di
-- Supabase didaftarkan PER SKEMA, jadi dicabut per skema. Default PUBLIC adalah
-- bawaan Postgres yang GLOBAL; ia hanya bisa dicabut tanpa `in schema`.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

-- 3. Fungsi DEFINER yang mempercayai argumen id: hanya untuk pemicu & server.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.siapkan_data_awal_pengguna(uuid)',
    'public.hitung_ulang_total_makro(uuid)',
    'public.terapkan_auto_deteksi(date, uuid)',
    -- Fungsi pemicu tidak bisa dipanggil langsung, tapi hak yang tidak
    -- dibutuhkan tetap dicabut supaya daftar DEFINER yang terbuka tetap pendek.
    'public.tangani_pengguna_baru()',
    'public.trigger_total_makro()',
    'public.trigger_auto_deteksi()',
    'public.siapkan_periode_fase_awal()'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
end $$;

-- 4. Validator CHECK wajib bisa dijalankan pengguna yang menyimpan pesan.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.rujukan_bersumber(jsonb) to authenticated';
    execute 'grant execute on function public.widget_bersumber(jsonb) to authenticated';
  end if;
end $$;
