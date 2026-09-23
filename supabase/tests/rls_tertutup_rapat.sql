-- =============================================================================
-- Uji RLS data kesehatan: bukan hanya "RLS aktif", tetapi tertutup rapat.
--
--   A. Katalog: setiap tabel app ber-RLS, kebijakannya hanya untuk
--      `authenticated`, tanpa TRUNCATE/REFERENCES/TRIGGER, `anon` tanpa hak,
--      dan setiap rujukan antar-tabel milik pengguna membawa user_id.
--   B. Perilaku: akun lain tidak bisa membaca, mengubah, menghapus, atau
--      MENUNJUK ke baris milik akun ini — termasuk jalur catatan makan yang
--      dulu ikut mengubah total kalori harian akun lain.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

create temp table tabel_app (nama text primary key);
insert into tabel_app values
  ('profiles'), ('day_types'), ('day_type_targets'), ('daily_logs'), ('food_logs'), ('workouts'), ('workout_sets'),
  ('fase_periode'), ('redistribusi_mingguan'), ('redistribusi_hari'), ('body_measurements'), ('alert_pinggang'),
  ('percakapan'), ('pesan_coach'), ('ringkasan_mingguan'), ('evaluasi_periodik'), ('pemakaian_coach_harian'),
  ('health_connections'), ('health_connection_secrets'), ('health_data'), ('source_priority'), ('import_jobs'),
  ('settings_notifications'), ('daily_summaries'), ('copy_notifikasi'),
  ('lab_results'), ('lab_result_markers');

-- ---------------------------------------------------------------------------
-- A. Katalog
-- ---------------------------------------------------------------------------
do $$
declare v_salah text;
begin
  -- Daftar di atas lengkap: tidak ada tabel publik yang terlewat dari uji ini.
  select string_agg(c.relname, ', ') into v_salah
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in (select nama from tabel_app);
  assert v_salah is null, format('tabel publik belum masuk daftar uji RLS: %s', v_salah);

  select string_agg(t.nama, ', ') into v_salah
    from tabel_app t join pg_class c on c.oid = ('public.' || t.nama)::regclass
   where not c.relrowsecurity;
  assert v_salah is null, format('RLS belum aktif: %s', v_salah);

  select string_agg(p.tablename || '.' || p.policyname || ' → ' || array_to_string(p.roles, ','), '; ') into v_salah
    from pg_policies p
   where p.schemaname = 'public' and p.tablename in (select nama from tabel_app)
     and p.roles <> array['authenticated']::name[];
  assert v_salah is null, format('kebijakan tidak terbatas pada authenticated: %s', v_salah);

  -- TRUNCATE melewati RLS; REFERENCES & TRIGGER tidak dipakai klien.
  select string_agg(t.nama || ':' || r.peran || ':' || h.hak, ', ') into v_salah
    from tabel_app t
   cross join (values ('authenticated'), ('anon')) as r(peran)
   cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as h(hak)
   where has_table_privilege(r.peran, 'public.' || t.nama, h.hak);
  assert v_salah is null, format('hak berlebih: %s', v_salah);

  select string_agg(t.nama, ', ') into v_salah
    from tabel_app t
   where has_table_privilege('anon', 'public.' || t.nama, 'SELECT')
      or has_table_privilege('anon', 'public.' || t.nama, 'INSERT')
      or has_table_privilege('anon', 'public.' || t.nama, 'UPDATE')
      or has_table_privilege('anon', 'public.' || t.nama, 'DELETE');
  assert v_salah is null, format('anon punya hak tabel: %s', v_salah);

  -- Rahasia token sumber data: hanya fungsi server, bukan klien.
  assert not has_table_privilege('authenticated', 'public.health_connection_secrets', 'SELECT'),
    'klien tidak boleh membaca rahasia koneksi';
  assert not exists (select 1 from pg_policies where tablename = 'health_connection_secrets'),
    'rahasia koneksi seharusnya tanpa kebijakan (tertutup untuk semua klien)';

  -- Setiap FK dari tabel ber-user_id ke tabel ber-user_id membawa user_id,
  -- langsung atau lewat FK komposit pendamping ke induk yang sama.
  select string_agg(format('%s.%s → %s', con.conrelid::regclass, a.attname, con.confrelid::regclass), ', ')
    into v_salah
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
   where con.contype = 'f' and con.connamespace = 'public'::regnamespace
     and array_length(con.conkey, 1) = 1
     and exists (select 1 from pg_attribute x where x.attrelid = con.confrelid and x.attname = 'user_id')
     and exists (select 1 from pg_attribute x where x.attrelid = con.conrelid and x.attname = 'user_id')
     and not exists (
       select 1 from pg_constraint k
        where k.contype = 'f' and k.conrelid = con.conrelid and k.confrelid = con.confrelid
          and k.conkey @> array[con.conkey[1],
                (select x.attnum from pg_attribute x where x.attrelid = con.conrelid and x.attname = 'user_id')]::int2[]);
  assert v_salah is null, format('rujukan tanpa pemilik: %s', v_salah);
end $$;

-- ---------------------------------------------------------------------------
-- B. Perilaku lintas akun
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1a10001-0000-4000-8000-000000000001', 'rls-korban@contoh.test'),
  ('a1a10002-0000-4000-8000-000000000002', 'rls-lain@contoh.test')
on conflict do nothing;

-- Baris milik korban, dibuat sebagai pemilik tabel (seperti dari app korban).
create temp table milik_korban as
with log as (
  insert into public.daily_logs (user_id, tanggal, day_type_id)
  select 'a1a10001-0000-4000-8000-000000000001', date '2026-09-01', id
    from public.day_types where user_id = 'a1a10001-0000-4000-8000-000000000001' and nama = 'Rest'
  returning id, day_type_id
), wo as (
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber)
  values ('a1a10001-0000-4000-8000-000000000001', date '2026-09-01', 'Push', 'angkat_beban', 'manual')
  returning id
), per as (
  insert into public.percakapan (user_id, judul)
  values ('a1a10001-0000-4000-8000-000000000001', 'Soal protein')
  returning id
), red as (
  insert into public.redistribusi_mingguan (user_id, minggu_mulai, opsi, perlu_dipindah, terserap, tersisa)
  values ('a1a10001-0000-4000-8000-000000000001', date '2026-08-31', 'sebar_rata', 0, 0, 0)
  returning id
)
select (select id from log) as log_id, (select day_type_id from log) as tipe_hari_id,
       (select id from wo) as workout_id, (select id from per) as percakapan_id, (select id from red) as redistribusi_id;

insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, sumber)
select 'a1a10001-0000-4000-8000-000000000001', log_id, 'Nasi + ayam', 650, 'manual' from milik_korban;
grant select on milik_korban to authenticated;
grant select on tabel_app to authenticated;

do $$
begin
  assert (select kalori from public.daily_logs where id = (select log_id from milik_korban)) = 650,
    'total kalori korban dari catatan makannya sendiri';
end $$;

-- Masuk sebagai akun lain.
set request.jwt.claim.sub = 'a1a10002-0000-4000-8000-000000000002';
set role authenticated;

do $$
declare
  k milik_korban;
  v_kode text;
  v_kasus record;
  v_tabel text;
  v_n bigint;
begin
  select * into k from milik_korban;
  -- 1. Catatan makan "milik sendiri" yang menunjuk ke log harian korban: ditolak,
  --    dan total kalori korban TIDAK berubah.
  begin
    insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, sumber)
    values ((select auth.uid()), k.log_id, 'Titipan', 5000, 'manual');
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23503', format('catatan makan ke log akun lain: kode %s', v_kode);

  -- 2. Rujukan lain ke baris korban, masing-masing ditolak.
  for v_kasus in
    select * from (values
      -- Tanpa penjaga lain: FK komposit yang menolak.
      ('log harian ke tipe hari korban',
       format($q$insert into public.daily_logs (user_id, tanggal, day_type_id) values (auth.uid(), date '2026-09-02', %L)$q$, k.tipe_hari_id),
       array['23503']),
      ('hari redistribusi ke redistribusi korban',
       format($q$insert into public.redistribusi_hari (redistribusi_id, user_id, tanggal, target_lama, target_baru) values (%L, auth.uid(), date '2026-09-01', 2400, 2200)$q$, k.redistribusi_id),
       array['23503']),
      -- Sudah punya penjaga pemilik sendiri (pemicu); FK komposit lapisan kedua.
      ('set latihan ke workout korban',
       format($q$insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, reps) values (%L, auth.uid(), 'Bench', 1, 1, 5)$q$, k.workout_id),
       array['23503', '23514']),
      ('pesan ke percakapan korban',
       format($q$insert into public.pesan_coach (percakapan_id, user_id, peran, teks) values (%L, auth.uid(), 'pengguna', 'halo')$q$, k.percakapan_id),
       array['23503', '42501'])
    ) as t(nama, perintah, kode_boleh)
  loop
    v_kode := null;
    begin
      execute v_kasus.perintah;
    exception when others then v_kode := sqlstate;
    end;
    assert v_kode = any (v_kasus.kode_boleh), format('%s: kode %s', v_kasus.nama, coalesce(v_kode, 'DITERIMA'));
  end loop;

  -- 3. Memindahkan baris sendiri ke induk milik korban juga ditolak.
  insert into public.daily_logs (user_id, tanggal) values ((select auth.uid()), date '2026-09-03');
  insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, sumber)
  select (select auth.uid()), id, 'Oat', 300, 'manual' from public.daily_logs where tanggal = date '2026-09-03';
  v_kode := null;
  begin
    update public.food_logs set daily_log_id = k.log_id where nama_makanan = 'Oat';
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23503', format('memindahkan catatan makan ke log akun lain: kode %s', v_kode);

  -- 4. Baca, ubah, hapus baris korban: tidak ada yang terlihat atau tersentuh,
  --    di SETIAP tabel app yang bisa dibaca klien.
  for v_tabel in
    select t.nama from tabel_app t
     where exists (select 1 from pg_attribute a where a.attrelid = ('public.' || t.nama)::regclass and a.attname = 'user_id')
       and has_table_privilege('authenticated', 'public.' || t.nama, 'SELECT')
  loop
    execute format('select count(*) from public.%I where user_id = %L', v_tabel, 'a1a10001-0000-4000-8000-000000000001') into v_n;
    assert v_n = 0, format('%s: %s baris korban terbaca', v_tabel, v_n);
    if has_table_privilege('authenticated', 'public.' || v_tabel, 'UPDATE') then
      execute format('update public.%I set user_id = user_id where user_id = %L', v_tabel, 'a1a10001-0000-4000-8000-000000000001');
      get diagnostics v_n = row_count;
      assert v_n = 0, format('%s: %s baris korban terubah', v_tabel, v_n);
    end if;
    if has_table_privilege('authenticated', 'public.' || v_tabel, 'DELETE') then
      execute format('delete from public.%I where user_id = %L', v_tabel, 'a1a10001-0000-4000-8000-000000000001');
      get diagnostics v_n = row_count;
      assert v_n = 0, format('%s: %s baris korban terhapus', v_tabel, v_n);
    end if;
  end loop;

  -- 5. TRUNCATE (yang melewati RLS) tidak tersedia bagi klien.
  v_kode := null;
  begin
    truncate public.daily_logs cascade;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '42501', format('truncate: kode %s', coalesce(v_kode, 'DITERIMA'));
end $$;

-- Korban tidak terpengaruh apa pun di atas.
reset role;
do $$
begin
  assert (select kalori from public.daily_logs where id = (select log_id from milik_korban)) = 650,
    'total kalori korban berubah oleh akun lain';
  assert (select count(*) from public.food_logs where daily_log_id = (select log_id from milik_korban)) = 1,
    'catatan makan akun lain menempel di log korban';
end $$;

-- 6. FK komposit yang boleh kosong: menghapus induk mengosongkan rujukannya
--    saja, pemilik baris tetap.
set request.jwt.claim.sub = 'a1a10001-0000-4000-8000-000000000001';
set role authenticated;
do $$
declare
  v_log record;
  -- Tipe hari yang DIRUJUK sekarang: workout korban di atas sudah membuat
  -- auto-deteksi memindahkan log itu dari Rest ke Angkat Beban.
  v_tipe uuid := (select day_type_id from public.daily_logs where id = (select log_id from milik_korban));
begin
  assert v_tipe is not null, 'log korban seharusnya merujuk satu tipe hari';
  delete from public.day_types where id = v_tipe;
  select * into v_log from public.daily_logs where id = (select log_id from milik_korban);
  assert v_log.day_type_id is null, 'menghapus tipe hari seharusnya mengosongkan rujukannya';
  assert v_log.user_id = 'a1a10001-0000-4000-8000-000000000001', 'pemilik log harian ikut terhapus';
end $$;

-- 7. anon tidak menyentuh apa pun.
reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
declare v_kode text;
begin
  begin
    perform 1 from public.daily_logs limit 1;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '42501', format('anon membaca daily_logs: kode %s', coalesce(v_kode, 'DITERIMA'));
end $$;

reset role;
select '✓ RLS data kesehatan: kebijakan hanya authenticated, tanpa TRUNCATE, rujukan lintas akun tertutup, baca/ubah/hapus terisolasi' as hasil;
