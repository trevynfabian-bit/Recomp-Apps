-- =============================================================================
-- Uji skema pengguna: menghapus akun menghapus SEMUA datanya.
--
-- "Hapus akun & semua data" di Setelan menjanjikan tidak ada yang tertinggal.
-- Janji itu bergantung pada satu aturan skema: setiap tabel publik yang
-- menyimpan data per pengguna merujuk auth.users dengan ON DELETE CASCADE
-- (langsung, atau lewat induk yang ikut terhapus). Yang diuji di sini KATALOG-
-- nya, bukan daftar tabel yang diingat penulis: tabel yang ditambah besok ikut
-- diperiksa. Lalu satu pengguna dengan data di banyak tabel benar-benar dihapus.
-- =============================================================================
\set ON_ERROR_STOP on
reset role;
reset request.jwt.claim.sub;

-- 1. Setiap kolom user_id di tabel publik: FK ke auth.users ON DELETE CASCADE.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
       and not exists (
         select 1
           from pg_constraint k
          where k.contype = 'f'
            and k.conrelid = format('public.%I', c.table_name)::regclass
            and k.confrelid = 'auth.users'::regclass
            and k.confdeltype = 'c'
            and k.conkey = array[(select attnum from pg_attribute
                                   where attrelid = format('public.%I', c.table_name)::regclass and attname = 'user_id')]
       )
  loop
    raise warning 'public.% — user_id tanpa FK ke auth.users ON DELETE CASCADE', r.table_name;
    n := n + 1;
  end loop;
  assert n = 0, format('%s tabel menyimpan data per pengguna tanpa ikut terhapus bersama akunnya', n);
end $$;

-- 2. Tabel publik TANPA user_id harus bergantung pada induk yang ikut terhapus
--    (FK ON DELETE CASCADE ke tabel lain), atau memang data bersama.
do $$
declare r record; n int := 0;
begin
  for r in
    select t.table_name
      from information_schema.tables t
     where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'user_id')
       and not exists (select 1 from pg_constraint k
                        where k.contype = 'f' and k.conrelid = format('public.%I', t.table_name)::regclass and k.confdeltype = 'c')
       -- Data bersama (bukan milik satu pengguna), dengan alasannya.
       and t.table_name not in (
         'copy_notifikasi'  -- katalog teks notifikasi, sama untuk semua pengguna
       )
  loop
    raise warning 'public.% — tanpa user_id dan tanpa induk yang ikut terhapus', r.table_name;
    n := n + 1;
  end loop;
  assert n = 0, format('%s tabel tidak jelas pemiliknya (lihat peringatan di atas)', n);
end $$;

-- 3. Nyata: pengguna dengan data di banyak tabel dihapus → tidak ada sisa.
insert into auth.users (id, email) values ('de1e7e00-0000-0000-0000-000000000001', 'hapus-tuntas@contoh.test');
set request.jwt.claim.sub = 'de1e7e00-0000-0000-0000-000000000001';
set role authenticated;
do $$
declare v_utas uuid;
begin
  perform public.simpan_berat_pagi(current_date - 1, 75.0);
  perform public.simpan_ukuran(current_date - 1, 85.0, null, 38.0);
  insert into public.percakapan (user_id, judul) values ('de1e7e00-0000-0000-0000-000000000001', 'Akan dihapus') returning id into v_utas;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks) values (v_utas, 'de1e7e00-0000-0000-0000-000000000001', 'pengguna', 'Halo');
end $$;
reset role;
reset request.jwt.claim.sub;
delete from auth.users where id = 'de1e7e00-0000-0000-0000-000000000001';
do $$
declare r record; n bigint; sisa int := 0;
begin
  for r in
    select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where user_id = %L', r.table_name, 'de1e7e00-0000-0000-0000-000000000001') into n;
    if n > 0 then
      raise warning 'public.% masih menyimpan % baris milik akun yang dihapus', r.table_name, n;
      sisa := sisa + 1;
    end if;
  end loop;
  assert sisa = 0, format('%s tabel masih menyimpan data akun yang sudah dihapus', sisa);
end $$;

select '✓ skema pengguna: setiap data per pengguna ikut terhapus bersama akunnya (diperiksa lewat katalog & penghapusan nyata)' as hasil;
