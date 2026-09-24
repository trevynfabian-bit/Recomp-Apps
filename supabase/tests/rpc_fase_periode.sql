-- =============================================================================
-- Uji riwayat fase.
--
-- Nilai tabel ini seluruhnya terletak pada satu janji: periode yang sudah
-- DITUTUP tidak pernah berubah lagi. Uji ini menyerang janji itu dari beberapa
-- arah — mengganti fase, mengganti ke fase yang sama, membackdate, dan mengubah
-- profil langsung — lalu memeriksa riwayatnya tetap utuh.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('eeee5555-0000-0000-0000-000000000005', 'fase-a@contoh.test'),
  ('eeee6666-0000-0000-0000-000000000006', 'fase-b@contoh.test');

set request.jwt.claim.sub = 'eeee5555-0000-0000-0000-000000000005';
set role authenticated;

-- 1. Profil baru langsung punya satu periode berjalan.
do $$
declare n integer;
begin
  select count(*) into n from public.fase_periode where selesai_tanggal is null;
  assert n = 1, format('%s periode berjalan, seharusnya tepat 1', n);
end $$;

-- 2. Jangkar berat diambil dari RATA-RATA 7 HARI, bukan timbangan hari itu.
do $$
declare r public.fase_periode;
begin
  perform public.simpan_berat_pagi(date '2026-09-16', 74.0);
  perform public.simpan_berat_pagi(date '2026-09-17', 74.4);
  perform public.simpan_berat_pagi(date '2026-09-18', 74.2);
  -- Hari terakhir sengaja melenceng jauh; kalau jangkar memakai angka harian,
  -- seluruh koridor akan berangkat dari goyangan air ini.
  perform public.simpan_berat_pagi(date '2026-09-19', 76.0);

  r := public.ganti_fase('Lean Gain', date '2026-09-19');
  -- (74,0 + 74,4 + 74,2 + 76,0) / 4 = 74,65
  assert r.berat_awal_kg = 74.65,
    format('jangkar %s, seharusnya 74.65 (rata-rata 7 hari), bukan 76.0', r.berat_awal_kg);
  assert r.mulai_tanggal = date '2026-09-19', format('mulai %s', r.mulai_tanggal);
end $$;

-- 3. Ganti fase menutup periode lama tepat sehari sebelum yang baru — tanpa
--    celah dan tanpa tumpang tindih.
do $$
declare r record; n integer;
begin
  perform public.ganti_fase('Cut', date '2026-09-22');

  select count(*) into n from public.fase_periode;
  assert n = 2, format('%s periode, seharusnya 2', n);

  select * into r from public.fase_periode where selesai_tanggal is not null;
  assert r.fase = 'Lean Gain', format('periode tertutup fase %s', r.fase);
  assert r.selesai_tanggal = date '2026-09-21',
    format('ditutup %s, seharusnya 2026-09-21', r.selesai_tanggal);

  select count(*) into n from public.fase_periode where selesai_tanggal is null;
  assert n = 1, format('%s periode berjalan, seharusnya tetap 1', n);
end $$;

-- 4. Fase pada tanggal mengikuti riwayat, bukan profil.
do $$
begin
  assert public.fase_pada_tanggal(date '2026-09-20') = 'Lean Gain',
    format('20 Sep = %s, seharusnya Lean Gain', public.fase_pada_tanggal(date '2026-09-20'));
  assert public.fase_pada_tanggal(date '2026-09-22') = 'Cut',
    format('22 Sep = %s, seharusnya Cut', public.fase_pada_tanggal(date '2026-09-22'));
end $$;

-- 5. Mengubah profil langsung TIDAK menulis ulang periode yang sudah ditutup.
--    Hanya periode berjalan yang ikut.
reset role;
do $$
begin
  update public.profiles set fase_aktif = 'Maintenance'
   where user_id = 'eeee5555-0000-0000-0000-000000000005';
end $$;
set role authenticated;

do $$
begin
  assert public.fase_pada_tanggal(date '2026-09-20') = 'Lean Gain',
    format('riwayat 20 Sep berubah jadi %s setelah profil diedit',
           public.fase_pada_tanggal(date '2026-09-20'));
  assert public.fase_pada_tanggal(date '2026-09-22') = 'Maintenance',
    format('periode berjalan 22 Sep = %s, seharusnya ikut profil',
           public.fase_pada_tanggal(date '2026-09-22'));
end $$;

-- 6. Tanggal yang menabrak periode tertutup ditolak.
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.ganti_fase('Cut', date '2026-09-20');
  exception when others then
    v_gagal := true;
  end;
  assert v_gagal, 'tanggal di dalam periode tertutup seharusnya ditolak';
end $$;

-- 6b. Tulisan LANGSUNG ke tabel (PostgREST, web) juga tidak boleh membuat
--     tanggal dengan dua fase. Riwayat A kini: Lean Gain 19–21 Sep (tertutup),
--     Cut sejak 22 Sep (berjalan).
do $$
declare
  v_kode text;
  v_lg uuid := (select id from public.fase_periode where fase = 'Lean Gain' and selesai_tanggal is not null);
  n integer;
begin
  -- Periode tertutup di dalam periode tertutup lain.
  v_kode := null;
  begin
    insert into public.fase_periode (user_id, fase, mulai_tanggal, selesai_tanggal)
    values ('eeee5555-0000-0000-0000-000000000005', 'Maintenance', date '2026-09-20', date '2026-09-20');
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23P01', format('periode di dalam periode tertutup: %s, seharusnya 23P01', coalesce(v_kode, 'diterima'));

  -- Periode tertutup di dalam periode yang masih berjalan (terbuka ke depan).
  v_kode := null;
  begin
    insert into public.fase_periode (user_id, fase, mulai_tanggal, selesai_tanggal)
    values ('eeee5555-0000-0000-0000-000000000005', 'Maintenance', date '2026-10-01', date '2026-10-03');
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23P01', format('periode di dalam periode berjalan: %s, seharusnya 23P01', coalesce(v_kode, 'diterima'));

  -- Memperpanjang periode tertutup sampai menabrak periode berikutnya.
  v_kode := null;
  begin
    update public.fase_periode set selesai_tanggal = date '2026-09-25' where id = v_lg;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23P01', format('perpanjang ke periode berikutnya: %s, seharusnya 23P01', coalesce(v_kode, 'diterima'));

  -- Riwayat lama yang tidak bertumpuk tetap boleh dilengkapi, lalu dihapus lagi.
  insert into public.fase_periode (user_id, fase, mulai_tanggal, selesai_tanggal)
  values ('eeee5555-0000-0000-0000-000000000005', 'Maintenance', date '2026-01-01', date '2026-01-31');
  delete from public.fase_periode where mulai_tanggal = date '2026-01-01';

  -- Mengubah kolom lain (bukan tanggal) tidak terganggu pemicu.
  update public.fase_periode set berat_awal_kg = berat_awal_kg where id = v_lg;

  select count(*) into n from public.fase_periode;
  assert n = 2, format('%s periode setelah percobaan, seharusnya tetap 2', n);
end $$;

-- 7. Isolasi: B tidak melihat periode A.
set request.jwt.claim.sub = 'eeee6666-0000-0000-0000-000000000006';

do $$
declare n integer;
begin
  select count(*) into n from public.fase_periode;
  assert n = 1, format('B melihat %s periode — riwayat A bocor', n);
end $$;

-- 8. anon tidak boleh menyentuh tabelnya sama sekali.
reset role;
set request.jwt.claim.sub = 'eeee6666-0000-0000-0000-000000000006';
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.fase_periode;
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'anon seharusnya tidak punya hak select';
end $$;

reset role;
select '✓ riwayat fase: periode tertutup tidak pernah berubah, tanpa tumpang tindih (juga lewat tulisan langsung), jangkar dari rata-rata 7 hari, isolasi & hak akses terjaga' as hasil;
