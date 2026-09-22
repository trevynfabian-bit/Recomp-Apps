-- =============================================================================
-- Uji deret rata-rata bergerak 7 hari.
--
-- Yang diuji di sini bukan hanya "angkanya benar", melainkan tiga hal yang
-- paling mudah salah dan paling sulit terlihat di grafik: hari kosong harus
-- DILEWATI (bukan nol), jendela titik pertama harus menjangkau enam hari
-- SEBELUM rentang yang diminta, dan seluruh deret harus terisolasi per
-- pengguna meski keduanya menimbang di tanggal yang sama.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('eeee1111-0000-0000-0000-000000000001', 'deret-a@contoh.test'),
  ('eeee2222-0000-0000-0000-000000000002', 'deret-b@contoh.test');

-- --- Pengguna A: deret berlubang -------------------------------------------
set request.jwt.claim.sub = 'eeee1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  -- 16, 17, 18, 20, 22 ditimbang; 19 dan 21 sengaja dilewatkan.
  perform public.simpan_berat_pagi(date '2026-09-16', 74.1);
  perform public.simpan_berat_pagi(date '2026-09-17', 74.5);
  perform public.simpan_berat_pagi(date '2026-09-18', 74.2);
  perform public.simpan_berat_pagi(date '2026-09-20', 74.4);
  perform public.simpan_berat_pagi(date '2026-09-22', 74.6);
end $$;

-- 1. Satu baris per tanggal, termasuk tanggal yang tidak ditimbang.
do $$
declare v_jumlah integer;
begin
  select count(*) into v_jumlah
    from public.deret_rata_rata_7_hari(date '2026-09-16', date '2026-09-22');
  assert v_jumlah = 7, format('deret berisi %s baris, seharusnya 7', v_jumlah);
end $$;

-- 2. Hari tanpa timbangan tetap punya rata-rata (jendelanya berisi), tapi
--    berat hariannya NULL — bukan nol.
do $$
declare r record;
begin
  select * into r
    from public.deret_rata_rata_7_hari(date '2026-09-19', date '2026-09-19');
  assert r.berat_harian_kg is null, format('berat harian %s, seharusnya null', r.berat_harian_kg);
  -- 74,1 + 74,5 + 74,2 = 222,8 / 3 = 74,27 (19 Sep: jendela 13–19 Sep).
  assert r.rata_rata_kg = 74.27, format('rata-rata %s, seharusnya 74.27', r.rata_rata_kg);
  assert r.jumlah_timbangan = 3, format('jumlah %s, seharusnya 3', r.jumlah_timbangan);
end $$;

-- 3. Hari kosong DILEWATI, bukan dihitung nol. Kalau dua hari kosong itu ikut
--    dihitung nol, rata-rata 22 Sep jatuh dari 74,36 ke 53,1 kg.
do $$
declare r record;
begin
  select * into r
    from public.deret_rata_rata_7_hari(date '2026-09-22', date '2026-09-22');
  -- Jendela 16–22 Sep: 74,1 + 74,5 + 74,2 + 74,4 + 74,6 = 371,8 / 5 = 74,36.
  assert r.rata_rata_kg = 74.36, format('rata-rata %s, seharusnya 74.36', r.rata_rata_kg);
  assert r.jumlah_timbangan = 5, format('jumlah %s, seharusnya 5', r.jumlah_timbangan);
  assert r.berat_harian_kg = 74.6, format('berat harian %s', r.berat_harian_kg);
end $$;

-- 4. Titik PERTAMA rentang tetap memakai jendela penuh ke belakang.
--    Diminta hanya 22 Sep, tapi jendelanya harus tetap menjangkau 16 Sep.
do $$
declare r record;
begin
  select * into r
    from public.deret_rata_rata_7_hari(date '2026-09-22', date '2026-09-22');
  assert r.jumlah_timbangan = 5,
    format('jendela titik pertama hanya melihat %s timbangan, seharusnya 5', r.jumlah_timbangan);
end $$;

-- 5. Tanggal tanpa timbangan sama sekali dalam jendelanya → rata-rata NULL.
do $$
declare r record;
begin
  select * into r
    from public.deret_rata_rata_7_hari(date '2026-10-15', date '2026-10-15');
  assert r.rata_rata_kg is null, format('rata-rata %s, seharusnya null', r.rata_rata_kg);
  assert r.jumlah_timbangan = 0, format('jumlah %s, seharusnya 0', r.jumlah_timbangan);
end $$;

-- 6. Rentang terbalik & rentang terlalu panjang ditolak, bukan dikembalikan
--    diam-diam sebagai deret kosong.
do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.deret_rata_rata_7_hari(date '2026-09-22', date '2026-09-16');
  exception when others then
    v_gagal := true;
  end;
  assert v_gagal, 'rentang terbalik seharusnya ditolak';
end $$;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.deret_rata_rata_7_hari(date '2020-01-01', date '2026-09-22');
  exception when others then
    v_gagal := true;
  end;
  assert v_gagal, 'rentang lebih dari 400 hari seharusnya ditolak';
end $$;

-- --- Pengguna B: isolasi ----------------------------------------------------
set request.jwt.claim.sub = 'eeee2222-0000-0000-0000-000000000002';

do $$
begin
  perform public.simpan_berat_pagi(date '2026-09-22', 62.0);
end $$;

-- 7. Deret B hanya melihat timbangan B, meski tanggalnya sama dengan A.
do $$
declare r record;
begin
  select * into r
    from public.deret_rata_rata_7_hari(date '2026-09-22', date '2026-09-22');
  assert r.rata_rata_kg = 62.00, format('rata-rata B %s, seharusnya 62.00', r.rata_rata_kg);
  assert r.jumlah_timbangan = 1,
    format('B melihat %s timbangan — data A bocor', r.jumlah_timbangan);
end $$;

-- 8. anon tidak boleh memanggilnya sama sekali.
reset role;
set request.jwt.claim.sub = 'eeee2222-0000-0000-0000-000000000002';
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.deret_rata_rata_7_hari(date '2026-09-22', date '2026-09-22');
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'anon seharusnya tidak punya hak execute';
end $$;

reset role;
select '✓ deret rata-rata 7 hari: lubang dilewati, jendela penuh, isolasi & hak akses terjaga' as hasil;
