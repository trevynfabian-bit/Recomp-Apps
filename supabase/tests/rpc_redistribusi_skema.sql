-- =============================================================================
-- Uji skema budget & redistribusi mingguan.
--
-- Yang diperiksa di sini bukan perhitungannya (itu milik task berikutnya),
-- melainkan JAMINAN STRUKTURAL-nya: kalori yang hilang tanpa keterangan
-- ditolak database, protein tidak punya tempat untuk ikut dipotong, target
-- asli tidak bisa tertimpa diam-diam, dan riwayatnya terisolasi per pengguna.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('eeee7777-0000-0000-0000-000000000007', 'redis-a@contoh.test'),
  ('eeee8888-0000-0000-0000-000000000008', 'redis-b@contoh.test');

set request.jwt.claim.sub = 'eeee7777-0000-0000-0000-000000000007';
set role authenticated;

-- 1. Senin pekan: sama dengan awalMinggu di TypeScript.
do $$
begin
  -- 2026-09-22 adalah Selasa; Senin pekannya 2026-09-21.
  assert public.awal_minggu(date '2026-09-22') = date '2026-09-21',
    format('Senin dari Selasa 22 Sep = %s', public.awal_minggu(date '2026-09-22'));
  -- Senin sendiri tidak bergeser.
  assert public.awal_minggu(date '2026-09-21') = date '2026-09-21', 'Senin seharusnya tetap';
  -- Minggu adalah HARI TERAKHIR pekan, bukan hari pertama.
  assert public.awal_minggu(date '2026-09-27') = date '2026-09-21',
    format('Senin dari Minggu 27 Sep = %s, seharusnya 21 Sep',
           public.awal_minggu(date '2026-09-27'));
  assert public.awal_minggu(date '2026-09-28') = date '2026-09-28', 'Senin berikutnya';
end $$;

-- 2. Kalori tidak boleh hilang tanpa keterangan: terserap + tersisa harus
--    menjelaskan seluruh selisihnya.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.redistribusi_mingguan
      (user_id, minggu_mulai, opsi, perlu_dipindah, terserap, tersisa)
    values ('eeee7777-0000-0000-0000-000000000007', date '2026-09-21', 'sebar_rata',
            -220, -150, -50);  -- −150 + −50 = −200, bukan −220
  exception when check_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'selisih yang tidak utuh seharusnya ditolak';
end $$;

-- 3. Penerapan yang utuh diterima, beserta hari-harinya.
do $$
declare v_id uuid; n integer;
begin
  insert into public.redistribusi_mingguan
    (user_id, minggu_mulai, opsi, perlu_dipindah, terserap, tersisa, dibatasi_lantai, alasan)
  values ('eeee7777-0000-0000-0000-000000000007', date '2026-09-21', 'sebar_rata',
          -220, -200, -20, true, 'Dua hari tertahan batas bawah 1.800 kkal')
  returning id into v_id;

  insert into public.redistribusi_hari
    (redistribusi_id, user_id, tanggal, target_lama, target_baru, kena_lantai)
  values
    (v_id, 'eeee7777-0000-0000-0000-000000000007', date '2026-09-24', 2850, 2790, false),
    (v_id, 'eeee7777-0000-0000-0000-000000000007', date '2026-09-25', 2450, 2390, false),
    (v_id, 'eeee7777-0000-0000-0000-000000000007', date '2026-09-26', 1850, 1800, true);

  select count(*) into n from public.redistribusi_hari where redistribusi_id = v_id;
  assert n = 3, format('%s hari tersimpan, seharusnya 3', n);
end $$;

-- 4. Satu tanggal hanya boleh muncul SEKALI dalam satu penerapan.
do $$
declare v_id uuid; v_gagal boolean := false;
begin
  select id into v_id from public.redistribusi_mingguan
   where user_id = 'eeee7777-0000-0000-0000-000000000007' limit 1;
  begin
    insert into public.redistribusi_hari
      (redistribusi_id, user_id, tanggal, target_lama, target_baru)
    values (v_id, 'eeee7777-0000-0000-0000-000000000007', date '2026-09-24', 2850, 2700);
  exception when unique_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'tanggal ganda dalam satu penerapan seharusnya ditolak';
end $$;

-- 5. Protein tidak punya tempat untuk ikut dipotong — jaminan STRUKTURAL,
--    bukan kesepakatan antar pemanggil.
do $$
declare n integer;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and table_name in ('redistribusi_mingguan', 'redistribusi_hari')
     and column_name ilike '%protein%';
  assert n = 0,
    format('%s kolom protein di tabel redistribusi — protein bisa ikut dipotong', n);
end $$;

-- 6. Target asli tersimpan terpisah dari target berlaku.
do $$
declare v public.daily_logs; v_id uuid;
begin
  select day_type_id into v_id from public.v_tipe_hari_aktif limit 1;
  perform public.setel_tipe_hari(date '2026-09-24', v_id);

  update public.daily_logs
     set target_asli_kalori = target_kalori, target_kalori = target_kalori - 60
   where user_id = 'eeee7777-0000-0000-0000-000000000007' and tanggal = date '2026-09-24'
  returning * into v;

  assert v.target_asli_kalori = v.target_kalori + 60,
    format('asli %s vs berlaku %s', v.target_asli_kalori, v.target_kalori);
end $$;

-- 7. Mengganti TIPE HARI membatalkan redistribusi hari itu.
--    Redistribusi dihitung terhadap rencana tertentu; begitu tipe harinya
--    berubah, rencana itu tidak ada lagi, dan menyisakan target asli lama
--    menghasilkan pasangan angka yang omong kosong.
do $$
declare v public.daily_logs; v_id uuid; v_lama uuid;
begin
  select day_type_id into v_lama from public.daily_logs
   where user_id = 'eeee7777-0000-0000-0000-000000000007' and tanggal = date '2026-09-24';

  select day_type_id into v_id from public.v_tipe_hari_aktif
   where day_type_id <> v_lama limit 1;
  select * into v from public.setel_tipe_hari(date '2026-09-24', v_id);
  assert v.target_asli_kalori is null,
    format('target asli %s masih tersisa setelah tipe hari diganti', v.target_asli_kalori);
end $$;

-- 7b. Menyetel tipe hari yang SAMA hanya menyegarkan snapshot; redistribusi
--     yang sedang berlaku tidak ikut dibatalkan.
do $$
declare v public.daily_logs; v_id uuid;
begin
  select day_type_id into v_id from public.daily_logs
   where user_id = 'eeee7777-0000-0000-0000-000000000007' and tanggal = date '2026-09-24';

  update public.daily_logs
     set target_asli_kalori = target_kalori, target_kalori = target_kalori - 60
   where user_id = 'eeee7777-0000-0000-0000-000000000007' and tanggal = date '2026-09-24';

  select * into v from public.setel_tipe_hari(date '2026-09-24', v_id);
  assert v.target_asli_kalori is not null,
    'redistribusi ikut dibatalkan padahal tipe harinya tidak berubah';
end $$;

-- 8. Isolasi: B tidak melihat redistribusi A.
set request.jwt.claim.sub = 'eeee8888-0000-0000-0000-000000000008';

do $$
declare n integer;
begin
  select count(*) into n from public.redistribusi_mingguan;
  assert n = 0, format('B melihat %s penerapan — riwayat A bocor', n);
  select count(*) into n from public.redistribusi_hari;
  assert n = 0, format('B melihat %s baris hari — riwayat A bocor', n);
end $$;

-- 9. anon tidak boleh menyentuh kedua tabel.
reset role;
set request.jwt.claim.sub = 'eeee8888-0000-0000-0000-000000000008';
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.redistribusi_mingguan;
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'anon seharusnya tidak punya hak select redistribusi_mingguan';
end $$;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.redistribusi_hari;
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'anon seharusnya tidak punya hak select redistribusi_hari';
end $$;

reset role;
select '✓ skema redistribusi: kalori tidak bisa hilang diam-diam, protein tak punya kolom, target asli terjaga' as hasil;
