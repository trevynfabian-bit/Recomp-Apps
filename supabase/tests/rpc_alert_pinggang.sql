-- =============================================================================
-- Uji alert batas pinggang.
--
-- Yang diuji di sini bukan rumus "mendekat" (itu milik cek:paritas), melainkan
-- ATURAN PENGIRIMANNYA — dan aturan itulah yang menentukan apakah fitur ini
-- menolong atau justru dimatikan pengguna:
--
--   • hanya keadaan yang MEMBURUK yang dikirim; "masih di atas batas" setiap
--     pekan adalah cara tercepat membuat orang mematikan notifikasi;
--   • perbaikan tetap DICATAT meski tidak dikirim, karena tanpa itu pengguna
--     yang pernah 'lewat' lalu kembali 'aman' tidak akan pernah diperingatkan
--     lagi saat naik kembali.
--
-- Tanggalnya relatif terhadap hari ini: `simpan_ukuran` menolak tanggal masa
-- depan menurut jam server.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('bbbb1111-0000-0000-0000-000000000001', 'alert-a@contoh.test'),
  ('bbbb2222-0000-0000-0000-000000000002', 'alert-b@contoh.test');

set request.jwt.claim.sub = 'bbbb1111-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Tanpa satu pun lingkar pinggang: tidak ada yang bisa dinilai, dan tidak
--    ada yang layak dicatat.
do $$
declare a jsonb;
begin
  a := public.periksa_alert_pinggang();
  assert (a->'status') = 'null'::jsonb, 'status seharusnya kosong tanpa pencatatan';
  assert not (a->>'perlu_kirim')::boolean, 'tidak ada yang bisa dikirim';
  assert (a->>'sebab') = 'tanpa pencatatan', format('sebab = %s', a->>'sebab');
  assert (select count(*) from public.alert_pinggang) = 0,
    'tidak ada pencatatan, tapi jejak alert tertulis';
end $$;

-- Pinggang NAIK +0,3 cm/pekan selama empat pekan.
do $$
declare v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform public.simpan_ukuran(v_hari_ini - 21, 84.0, null, 38.5);
  perform public.simpan_ukuran(v_hari_ini - 14, 84.3, null, 38.5);
  perform public.simpan_ukuran(v_hari_ini - 7, 84.6, null, 38.5);
  perform public.simpan_ukuran(v_hari_ini, 84.9, null, 38.5);
end $$;

-- 2. Batas belum ditetapkan: tidak dikirim, tapi keadaannya dicatat sebagai
--    titik awal — tanpa itu, kenaikan pertama tidak punya pembanding.
do $$
declare a jsonb;
begin
  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'belum-ditetapkan',
    format('keadaan = %s', a->'status'->>'keadaan');
  assert not (a->>'perlu_kirim')::boolean, 'belum-ditetapkan seharusnya tidak dikirim';
  assert (a->>'sebab') = 'tidak perlu', format('sebab = %s', a->>'sebab');
  assert (select count(*) from public.alert_pinggang) = 1, 'titik awal seharusnya dicatat';
  assert not (select dikirim from public.alert_pinggang), 'titik awal seharusnya dikirim=false';
end $$;

-- 3. Lajunya sama dengan yang dilaporkan `riwayat_ukuran` — satu aturan, satu
--    angka. Kalau berbeda, layar dan notifikasi akan bercerita lain.
do $$
declare a jsonb; r jsonb;
begin
  a := public.periksa_alert_pinggang(null, false);
  r := public.riwayat_ukuran(null, 12, 4);
  assert (a->'status'->>'laju_per_pekan')::numeric = 0.3,
    format('laju alert = %s, seharusnya 0,3', a->'status'->>'laju_per_pekan');
  assert (a->'status'->>'laju_per_pekan')::numeric
         = (r->'bagian'->'pinggang_cm'->>'laju_terkini')::numeric,
    format('laju alert %s ≠ laju riwayat %s',
           a->'status'->>'laju_per_pekan', r->'bagian'->'pinggang_cm'->>'laju_terkini');
  -- Dan keseluruhan keadaannya identik, bukan cuma lajunya.
  assert (a->'status') = (r->'batas_pinggang'), 'keadaan alert berbeda dari keadaan riwayat';
end $$;

-- 4. Memburuk ke `mendekat` → DIKIRIM.
do $$
declare a jsonb;
begin
  update public.profiles set batas_pinggang_cm = 85.5;

  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'mendekat', format('keadaan = %s', a->'status'->>'keadaan');
  assert (a->'status'->>'pekan_lagi')::numeric = 2.0,
    format('pekan lagi = %s, seharusnya 2,0', a->'status'->>'pekan_lagi');
  assert (a->>'perlu_kirim')::boolean, 'keadaan yang memburuk seharusnya dikirim';
  assert (a->>'sebab') = 'memburuk', format('sebab = %s', a->>'sebab');
  assert (select count(*) from public.alert_pinggang where dikirim) = 1,
    'seharusnya satu alert terkirim tercatat';
end $$;

-- 5. Keadaan yang SAMA tidak dikirim lagi, dan tidak menambah jejak.
do $$
declare a jsonb; n integer;
begin
  select count(*) into n from public.alert_pinggang;
  a := public.periksa_alert_pinggang();
  assert not (a->>'perlu_kirim')::boolean, 'keadaan yang sama seharusnya tidak dikirim lagi';
  assert (a->>'sebab') = 'sudah diberitahukan', format('sebab = %s', a->>'sebab');
  assert (select count(*) from public.alert_pinggang) = n, 'jejak bertambah tanpa perlu';
  assert (a->'alert_terakhir'->>'keadaan') = 'mendekat',
    format('alert terakhir = %s', a->'alert_terakhir'->>'keadaan');

  -- Dipanggil lima kali pun tetap tidak mengirim apa pun.
  for i in 1..5 loop
    assert not (public.periksa_alert_pinggang()->>'perlu_kirim')::boolean,
      'panggilan berulang mulai mengirim ulang';
  end loop;
  assert (select count(*) from public.alert_pinggang) = n, 'panggilan berulang menambah jejak';
end $$;

-- 6. Memburuk lagi ke `lewat` → DIKIRIM.
do $$
declare a jsonb;
begin
  update public.profiles set batas_pinggang_cm = 84.5;
  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'lewat', format('keadaan = %s', a->'status'->>'keadaan');
  assert (a->'status'->>'selisih_cm')::numeric = 0.4,
    format('selisih = %s, seharusnya 0,4', a->'status'->>'selisih_cm');
  assert (a->>'perlu_kirim')::boolean, 'mendekat → lewat seharusnya dikirim';
  assert (select count(*) from public.alert_pinggang where dikirim) = 2, 'jejak terkirim bukan dua';
end $$;

-- 7. PERBAIKAN dicatat tanpa dikirim — dan inilah yang membuat peringatan
--    berikutnya masih mungkin.
do $$
declare a jsonb;
begin
  update public.profiles set batas_pinggang_cm = 95.0;
  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'aman', format('keadaan = %s', a->'status'->>'keadaan');
  assert not (a->>'perlu_kirim')::boolean, 'perbaikan seharusnya tidak dikirim';
  assert (a->>'sebab') = 'tidak perlu', format('sebab = %s', a->>'sebab');
  assert (select keadaan from public.alert_pinggang order by urutan desc limit 1) = 'aman',
    'perbaikan seharusnya tetap dicatat';
  assert not (select dikirim from public.alert_pinggang order by urutan desc limit 1),
    'perbaikan seharusnya dikirim=false';
end $$;

-- 8. Setelah membaik, naik kembali ke `lewat` DIKIRIM LAGI. Tanpa blok 7,
--    keadaan terakhirnya selamanya 'lewat' dan tidak ada yang bisa lebih buruk.
do $$
declare a jsonb;
begin
  update public.profiles set batas_pinggang_cm = 84.5;
  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'lewat', format('keadaan = %s', a->'status'->>'keadaan');
  assert (a->>'perlu_kirim')::boolean,
    'kenaikan setelah perbaikan seharusnya dikirim lagi';
  assert (select count(*) from public.alert_pinggang where dikirim) = 3,
    'jejak terkirim bukan tiga';
end $$;

-- 9. `p_catat = false` adalah pratinjau murni: melaporkan, tidak menulis.
do $$
declare a jsonb; n integer;
begin
  update public.profiles set batas_pinggang_cm = 95.0;
  perform public.periksa_alert_pinggang();        -- catat perbaikan dulu
  update public.profiles set batas_pinggang_cm = 84.5;

  select count(*) into n from public.alert_pinggang;
  a := public.periksa_alert_pinggang(null, false);
  assert (a->>'perlu_kirim')::boolean, 'pratinjau tetap melaporkan bahwa perlu dikirim';
  assert (a->'dicatat_id') = 'null'::jsonb, 'pratinjau seharusnya tidak mencatat';
  assert (select count(*) from public.alert_pinggang) = n, 'pratinjau menulis jejak';

  -- Karena pratinjau tidak menghabiskan "kejutan"-nya, pengiriman sebenarnya
  -- masih terjadi sesudahnya.
  assert (public.periksa_alert_pinggang()->>'perlu_kirim')::boolean,
    'pratinjau menghabiskan kesempatan pengiriman';
end $$;

-- 10. Pencatatan ukuran BARU yang masih 'lewat' tidak memicu ulang: keadaannya
--     tidak memburuk, hanya berulang.
do $$
declare a jsonb; n integer;
begin
  select count(*) into n from public.alert_pinggang where dikirim;
  perform public.simpan_ukuran((now() at time zone 'Asia/Jakarta')::date, 85.2, null, 38.5);
  a := public.periksa_alert_pinggang();
  assert (a->'status'->>'keadaan') = 'lewat', 'masih di atas batas';
  assert not (a->>'perlu_kirim')::boolean,
    'pencatatan baru yang masih lewat seharusnya tidak memicu ulang';
  assert (select count(*) from public.alert_pinggang where dikirim) = n,
    'jejak terkirim bertambah tanpa keadaan memburuk';
end $$;

-- 11. Isolasi: jejak & keadaan pengguna lain tidak terbaca.
reset role;
set request.jwt.claim.sub = 'bbbb2222-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare a jsonb;
begin
  assert (select count(*) from public.alert_pinggang) = 0,
    'pengguna B melihat jejak alert orang lain';
  a := public.periksa_alert_pinggang();
  assert (a->>'sebab') = 'tanpa pencatatan',
    format('sebab = %s; pengguna B membaca ukuran pengguna A', a->>'sebab');
end $$;

-- 12. Tanpa sesi & peran anon.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.periksa_alert_pinggang();
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;

  assert not has_function_privilege('anon', 'public.periksa_alert_pinggang(date, boolean)', 'execute'),
    'anon masih boleh memeriksa alert';
  assert not has_table_privilege('anon', 'public.alert_pinggang', 'select'),
    'anon masih boleh membaca jejak alert';
  assert has_function_privilege('authenticated', 'public.periksa_alert_pinggang(date, boolean)', 'execute'),
    'authenticated seharusnya boleh memeriksa alertnya';
end $$;

select '✓ alert pinggang: hanya keadaan memburuk yang dikirim, perbaikan dicatat tanpa dikirim, pratinjau tidak menulis' as hasil;
