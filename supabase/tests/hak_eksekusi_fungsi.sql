-- =============================================================================
-- Uji hak EXECUTE seluruh fungsi publik — bukan per fungsi, tapi sebagai ATURAN.
--
-- Uji per fungsi ("anon tidak boleh menjalankan X") hanya menjaga fungsi yang
-- kebetulan diingat penulisnya. Celah yang ditutup migrasi pengerasan justru
-- muncul karena setiap fungsi baru otomatis terbuka untuk anon di Supabase,
-- dan tidak ada yang mengingat semuanya. Jadi yang diuji di sini adalah
-- katalognya: fungsi mana pun, termasuk yang ditulis besok.
--
-- Dua aturan:
--   1. anon tidak boleh menjalankan fungsi publik apa pun.
--   2. Fungsi SECURITY DEFINER yang bisa dijalankan pengguna login harus ada
--      di daftar izin. DEFINER melewati RLS, jadi setiap pintu seperti itu
--      harus diputuskan dengan sadar — dan hanya boleh bila ia menurunkan
--      pengguna dari auth.uid(), bukan dari argumen pemanggil.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

create function pg_temp.pelanggaran_hak()
returns table (fungsi text, masalah text)
language sql
stable
as $$
  with fungsi_publik as (
    select p.oid, p.oid::regprocedure::text as nama, p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       -- Fungsi milik ekstensi (mis. pgcrypto lokal) bukan buatan migrasi ini.
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  )
  select nama, 'anon boleh menjalankan'
    from fungsi_publik
   where has_function_privilege('anon', oid, 'execute')
  union all
  select nama, 'DEFINER terbuka untuk authenticated tanpa masuk daftar izin'
    from fungsi_publik
   where prosecdef
     and has_function_privilege('authenticated', oid, 'execute')
     and oid not in (
       -- Menurunkan pengguna dari auth.uid(); argumennya hanya tanggal.
       'public.ikuti_auto_deteksi(date)'::regprocedure
     )
$$;

-- 1. Keadaan setelah semua migrasi: bersih.
do $$
declare r record; n int := 0;
begin
  for r in select * from pg_temp.pelanggaran_hak() loop
    raise warning '% — %', r.fungsi, r.masalah;
    n := n + 1;
  end loop;
  assert n = 0, format('%s fungsi melanggar aturan hak EXECUTE (lihat peringatan di atas)', n);
end $$;

-- 2. Fungsi DEFINER yang mempercayai argumen id tertutup untuk klien, tapi
-- pemicu yang memakainya tetap berjalan (diuji fungsional di berkas lain).
do $$
begin
  assert not has_function_privilege('authenticated',
    'public.siapkan_data_awal_pengguna(uuid)', 'execute'),
    'pengguna login bisa menyiapkan data awal untuk id siapa pun';
  assert not has_function_privilege('authenticated',
    'public.hitung_ulang_total_makro(uuid)', 'execute'),
    'pengguna login bisa menghitung ulang total log orang lain';
  assert not has_function_privilege('authenticated',
    'public.terapkan_auto_deteksi(date, uuid)', 'execute'),
    'pengguna login bisa menjalankan auto-deteksi atas nama orang lain';
  -- Validator CHECK harus tetap bisa dijalankan pengguna yang menyimpan pesan.
  assert has_function_privilege('authenticated', 'public.rujukan_bersumber(jsonb)', 'execute'),
    'validator rujukan tidak bisa dijalankan authenticated — pesan coach tak tersimpan';
  assert has_function_privilege('authenticated', 'public.widget_bersumber(jsonb)', 'execute'),
    'validator widget tidak bisa dijalankan authenticated — pesan coach tak tersimpan';
end $$;

-- 3. Fungsi yang dibuat SETELAH pengerasan: tertutup untuk anon, terbuka untuk
-- authenticated. Ini yang membuktikan default privileges ikut dicabut, bukan
-- hanya fungsi yang sudah ada saat migrasinya berjalan.
begin;
create function public.uji_fungsi_baru() returns integer language sql as 'select 1';
do $$
begin
  assert not has_function_privilege('anon', 'public.uji_fungsi_baru()', 'execute'),
    'fungsi baru masih otomatis terbuka untuk anon';
  assert has_function_privilege('authenticated', 'public.uji_fungsi_baru()', 'execute'),
    'fungsi baru seharusnya tetap bisa dipakai pengguna login';
end $$;
rollback;

-- 4. Kontrol negatif: pemeriksanya benar-benar menangkap pelanggaran.
begin;
grant execute on function public.budget_mingguan(date, date, integer) to anon;
do $$
begin
  assert exists (select 1 from pg_temp.pelanggaran_hak()
                  where fungsi like 'budget_mingguan%' and masalah like 'anon%'),
    'pemeriksa tidak menangkap anon yang diberi EXECUTE';
end $$;
rollback;

begin;
create function public.uji_definer_bocor(p_user_id uuid)
returns void language sql security definer set search_path = '' as 'select';
do $$
begin
  assert exists (select 1 from pg_temp.pelanggaran_hak()
                  where fungsi like 'uji_definer_bocor%' and masalah like 'DEFINER%'),
    'pemeriksa tidak menangkap fungsi DEFINER baru yang terbuka untuk authenticated';
end $$;
rollback;

select '✓ hak EXECUTE: anon tertutup dari semua fungsi, pintu DEFINER hanya yang diputuskan sadar' as hasil;
