-- =============================================================================
-- Uji anti-dobel antar sumber & agregasi harian.
--
-- Setiap angka di sini dihitung tangan, dan setiap kasus punya "jawaban naif"
-- (menjumlah semua sumber) yang BERBEDA dari jawaban yang benar — kalau tidak,
-- uji ini tidak bisa membedakan anti-dobel dari penjumlahan biasa.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('eeee1111-0000-0000-0000-000000000001', 'dobel-a@contoh.test'),
  ('eeee2222-0000-0000-0000-000000000002', 'dobel-b@contoh.test');

insert into public.health_connections (user_id, sumber, akun_eksternal)
values
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', null),
  ('eeee1111-0000-0000-0000-000000000001', 'whoop', 'w-1'),
  ('eeee1111-0000-0000-0000-000000000001', 'strava', 's-1');

set role service_role;

-- Hari D = 10 September 2026 (WIB).
insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
values
  -- Energi aktif D: Watch 620, iPhone 180 (Apple Health); WHOOP 700; satu lari Strava 450.
  --   Naif (semua dijumlah): 1.950. Naif (Apple Health dijumlah antar perangkat): 800.
  --   Benar: Apple Health (peringkat tertinggi), perangkat Watch (total terbesar) = 620.
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'total:2026-09-10', 'kalori_aktif', 620,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.iphone', 'total:2026-09-10', 'kalori_aktif', 180,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'whoop', null, 'cycle-910', 'kalori_aktif', 700,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'strava', null, 'act-910', 'kalori_aktif', 450,
   timestamptz '2026-09-10 05:30+07', timestamptz '2026-09-10 06:20+07'),

  -- Langkah D: total gabungan HealthKit (asal kosong) 9.100, iPhone 7.000, Watch 8.800.
  --   Benar: total gabungan (sudah didedup iOS) = 9.100, bukan 24.900 dan bukan 8.800.
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', null, 'total:2026-09-10', 'langkah', 9100,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.iphone', 'total:2026-09-10', 'langkah', 7000,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'total:2026-09-10', 'langkah', 8800,
   timestamptz '2026-09-10 00:00+07', timestamptz '2026-09-11 00:00+07'),

  -- Tidur yang BANGUN di D: WHOOP malam 400 + tidur siang 30 (dua sesi, satu
  -- sumber: DIJUMLAH); Watch 445. Benar: WHOOP = 430. Naif: 875.
  ('eeee1111-0000-0000-0000-000000000001', 'whoop', null, 'sleep-a', 'tidur', 400,
   timestamptz '2026-09-09 22:50+07', timestamptz '2026-09-10 05:30+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'whoop', null, 'sleep-b', 'tidur', 30,
   timestamptz '2026-09-10 13:00+07', timestamptz '2026-09-10 13:30+07'),
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'sleep-w', 'tidur', 445,
   timestamptz '2026-09-09 22:45+07', timestamptz '2026-09-10 06:10+07'),

  -- HR istirahat D: hanya Watch, dua sampel 52 & 54 → DIRATA-RATA = 53, bukan 106.
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'hr-1', 'hr_istirahat', 52,
   timestamptz '2026-09-10 04:00+07', null),
  ('eeee1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch', 'hr-2', 'hr_istirahat', 54,
   timestamptz '2026-09-10 16:00+07', null),

  -- Hari E = 11 September: HANYA Strava yang punya energi aktif → dipakai (380).
  ('eeee1111-0000-0000-0000-000000000001', 'strava', null, 'act-911', 'kalori_aktif', 380,
   timestamptz '2026-09-11 06:00+07', timestamptz '2026-09-11 06:45+07');

-- --- 1. Agregasi harian: satu sumber, satu perangkat ------------------------
reset role;
set request.jwt.claim.sub = 'eeee1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare r record;
begin
  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'kalori_aktif';
  assert r.nilai = 620, format('energi aktif D = %s, seharusnya 620 (Watch saja)', r.nilai);
  assert r.nilai <> 1950 and r.nilai <> 800, 'kontrol: jawaban naif tidak sama dengan jawaban benar';
  assert r.sumber = 'apple_health' and r.asal = 'com.apple.health.watch',
    format('pemenang energi = %s/%s', r.sumber, r.asal);
  assert r.sumber_diabaikan = array['strava', 'whoop'],
    format('sumber diabaikan = %s', r.sumber_diabaikan);
  assert r.satuan = 'kcal', 'satuan energi seharusnya kcal';

  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'langkah';
  assert r.nilai = 9100 and r.asal is null,
    format('langkah D = %s (asal %s), seharusnya 9.100 dari total gabungan', r.nilai, r.asal);
  assert r.sumber_diabaikan = '{}', 'langkah hanya dari satu sumber; tidak ada yang diabaikan';

  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'tidur';
  assert r.nilai = 430 and r.sumber = 'whoop',
    format('tidur D = %s dari %s, seharusnya 430 dari WHOOP (dua sesi dijumlah)', r.nilai, r.sumber);

  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'hr_istirahat';
  assert r.nilai = 53, format('HR istirahat D = %s, seharusnya rata-rata 53', r.nilai);

  select * into r from public.agregat_kesehatan_harian(date '2026-09-11', date '2026-09-11')
   where jenis = 'kalori_aktif';
  assert r.nilai = 380 and r.sumber = 'strava',
    'hari tanpa jam tangan seharusnya tetap memakai Strava';

  assert (select count(*) from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-11')) = 5,
    'seharusnya tepat satu angka per (hari, jenis): 4 jenis di D + 1 di E';
end $$;

-- Jejak per baris: tepat satu baris energi D yang dihitung, dengan peringkatnya.
do $$
begin
  assert (select count(*) from public.data_kesehatan_terhitung(date '2026-09-10', date '2026-09-10')
           where jenis = 'kalori_aktif' and dihitung) = 1,
    'tepat satu baris energi D yang dihitung';
  assert (select array_agg(source_priority_rank order by source_priority_rank desc)
            from (select distinct sumber, source_priority_rank
                    from public.data_kesehatan_terhitung(date '2026-09-10', date '2026-09-10')
                   where jenis = 'kalori_aktif') x) = array[40, 30, 20],
    'peringkat energi: Apple Health 40, WHOOP 30, Strava 20';
end $$;

-- --- 2. Urutan pilihan pengguna ------------------------------------------------
do $$
declare r record; v text[];
begin
  assert public.urutan_prioritas('kalori_aktif') = array['apple_health', 'whoop', 'strava'],
    format('urutan bawaan energi = %s', public.urutan_prioritas('kalori_aktif'));

  -- Pengguna memilih WHOOP untuk energi; sumber yang tidak disebut di bawahnya.
  v := public.atur_prioritas_sumber('kalori_aktif', array['whoop']);
  assert v = array['whoop', 'apple_health', 'strava'], format('urutan baru = %s', v);

  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'kalori_aktif';
  assert r.nilai = 700 and r.sumber = 'whoop',
    format('setelah WHOOP diutamakan, energi D = %s dari %s', r.nilai, r.sumber);

  -- Olahraga lain tidak ikut berubah.
  select * into r from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10')
   where jenis = 'langkah';
  assert r.sumber = 'apple_health', 'urutan energi tidak boleh mengubah langkah';

  -- Urutan kosong = kembali ke bawaan.
  v := public.atur_prioritas_sumber('kalori_aktif', '{}');
  assert v = array['apple_health', 'whoop', 'strava'], format('reset urutan = %s', v);
  assert not exists (select 1 from public.source_priority), 'reset seharusnya menghapus baris urutan';
end $$;

do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    perform public.atur_prioritas_sumber('lari', array['strava', 'strava']);
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'sumber ganda dalam urutan seharusnya ditolak';

  v_gagal := false;
  begin
    perform public.atur_prioritas_sumber('langkah', array['manual', 'apple_health']);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'manual untuk langkah seharusnya ditolak';

  v_gagal := false;
  begin
    perform public.atur_prioritas_sumber('renang', '{}');
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'olahraga yang tidak dikenal seharusnya ditolak, termasuk saat reset';

  -- Urutan yang gagal tidak meninggalkan setengah urutan.
  assert not exists (select 1 from public.source_priority), 'urutan gagal tidak boleh tersimpan sebagian';
end $$;

-- --- 3. Latihan: satu sesi per olahraga per hari per sumber teratas ----------
do $$
declare
  v_n integer;
  v_sumber text;
begin
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, durasi_menit)
  values
    -- Satu lari subuh, tiga salinan (Strava, WHOOP, Apple Health).
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Morning Run', 'lari', 'strava', 's-910', 50),
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Running', 'lari', 'whoop', 'w-910', 52),
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Lari', 'lari', 'healthkit', 'h-910', 51),
    -- Lari sore di Strava: sesi KEDUA yang sah, bukan salinan.
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Evening Run', 'lari', 'strava', 's-910b', 30),
    -- Angkat beban: Hevy + WHOOP.
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Push', 'angkat_beban', 'hevy', 'hv-910', 60),
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-10', 'Weightlifting', 'angkat_beban', 'whoop', 'w-910b', 58),
    -- Padel: diketik manual + WHOOP.
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-11', 'Padel', 'padel', 'manual', null, 90),
    ('eeee1111-0000-0000-0000-000000000001', date '2026-09-11', 'Padel', 'padel', 'whoop', 'w-911', 88);

  select count(*) into v_n from public.latihan_terhitung(date '2026-09-10', date '2026-09-11');
  assert v_n = 4, format('sesi terhitung = %s, seharusnya 4 (2 lari Strava, Hevy, padel manual); naif 8', v_n);

  select string_agg(sumber::text, ',' order by sumber::text) into v_sumber
    from public.latihan_terhitung(date '2026-09-10', date '2026-09-10') where jenis = 'lari';
  assert v_sumber = 'strava,strava', format('lari D dari %s, seharusnya dua sesi Strava', v_sumber);

  assert (select sumber from public.latihan_terhitung(date '2026-09-10', date '2026-09-10')
           where jenis = 'angkat_beban') = 'hevy', 'angkat beban seharusnya dari Hevy';
  assert (select sumber from public.latihan_terhitung(date '2026-09-11', date '2026-09-11')
           where jenis = 'padel') = 'manual', 'padel yang diketik sendiri seharusnya menang';

  -- `healthkit` di tabel latihan = `apple_health` di urutan prioritas.
  perform public.atur_prioritas_sumber('lari', array['apple_health']);
  assert (select string_agg(sumber::text, ',') from public.latihan_terhitung(date '2026-09-10', date '2026-09-10')
           where jenis = 'lari') = 'healthkit',
    'Apple Health yang diutamakan untuk lari seharusnya memilih baris healthkit';
  perform public.atur_prioritas_sumber('lari', '{}');
end $$;

-- --- 4. Rentang & isolasi ------------------------------------------------------
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    perform * from public.agregat_kesehatan_harian(date '2026-09-11', date '2026-09-10');
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'rentang terbalik seharusnya ditolak';

  v_gagal := false;
  begin
    perform * from public.latihan_terhitung(date '2025-01-01', date '2026-09-10');
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'rentang lebih dari setahun seharusnya ditolak';
end $$;

reset role;
set request.jwt.claim.sub = 'eeee2222-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare v_gagal boolean := false;
begin
  assert (select count(*) from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-11')) = 0,
    'pengguna lain seharusnya tidak melihat agregat siapa pun';
  begin
    perform * from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-11',
                                                   'eeee1111-0000-0000-0000-000000000001');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'meminta agregat pengguna lain seharusnya ditolak';

  -- Urutan pilihan B tidak mengubah angka A (diuji lewat jalur server di bawah).
  perform public.atur_prioritas_sumber('kalori_aktif', array['strava']);
end $$;

reset role;
reset request.jwt.claim.sub;
set role service_role;

do $$
declare v_gagal boolean := false;
begin
  assert (select nilai from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10',
                                                            'eeee1111-0000-0000-0000-000000000001')
           where jenis = 'kalori_aktif') = 620,
    'jalur server: energi A tetap 620 walau B mengutamakan Strava';
  begin
    perform * from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10');
  exception when null_value_not_allowed then v_gagal := true; end;
  assert v_gagal, 'jalur server tanpa pengguna seharusnya ditolak';
end $$;

reset role;
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform * from public.agregat_kesehatan_harian(date '2026-09-10', date '2026-09-10');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa menjalankan agregasi';
end $$;

-- --- 5. Ringkasan mingguan menghitung sesi setelah anti-dobel ---------------
reset role;
set request.jwt.claim.sub = 'eeee1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
  l jsonb;
begin
  perform public.simpan_berat_pagi(s + 1, 74.0);
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values
    ('eeee1111-0000-0000-0000-000000000001', s + 1, 'Morning Run', 'lari', 'strava', 'rs-1'),
    ('eeee1111-0000-0000-0000-000000000001', s + 1, 'Running', 'lari', 'whoop', 'rw-1'),
    ('eeee1111-0000-0000-0000-000000000001', s + 1, 'Lari', 'lari', 'healthkit', 'rh-1'),
    ('eeee1111-0000-0000-0000-000000000001', s + 3, 'Push', 'angkat_beban', 'hevy', 'rhv-1'),
    ('eeee1111-0000-0000-0000-000000000001', s + 3, 'Weightlifting', 'angkat_beban', 'whoop', 'rw-2');

  select e into l from jsonb_array_elements(public.poin_ringkasan_mingguan(s) -> 'poin') e
   where e ->> 'kunci' = 'latihan';
  assert (l ->> 'nilai')::int = 2,
    format('ringkasan pekan: %s sesi, seharusnya 2 (satu lari + satu angkat beban); naif 5', l ->> 'nilai');
end $$;

-- --- 6. Bersihkan ---------------------------------------------------------------
reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('eeee1111-0000-0000-0000-000000000001', 'eeee2222-0000-0000-0000-000000000002');
