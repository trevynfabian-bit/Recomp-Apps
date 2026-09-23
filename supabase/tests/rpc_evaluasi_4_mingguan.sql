-- =============================================================================
-- Uji evaluasi 4 mingguan dari data.
--
-- Pohon keputusannya sudah diuji mesin lewat `npm run cek:paritas` (seluruh 960
-- kombinasi). Di sini yang diuji adalah PENURUNAN SUMBU dari catatan — bagian
-- yang tidak ada di TypeScript sama sekali:
--   • periode = empat pekan yang SUDAH selesai; pekan berjalan tidak ikut;
--   • ambang berat diskalakan ke panjang periode (0,8 kg, bukan 0,2 kg);
--   • ujung tren yang ditopang terlalu sedikit timbangan → `belum jelas`;
--   • sumbu kekuatan selalu `belum jelas` dan menyebut sebabnya, sehingga
--     keyakinan tidak pernah `tinggi` untuk sekarang.
--
-- Tanggalnya relatif terhadap Senin pekan berjalan, jadi uji ini tetap berlaku
-- kapan pun ia dijalankan.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('cccc2222-0000-0000-0000-000000000022', 'eval-a@contoh.test'),
  ('cccc3333-0000-0000-0000-000000000033', 'eval-b@contoh.test');

update public.profiles set fase_aktif = 'Cut'
 where user_id = 'cccc2222-0000-0000-0000-000000000022';

set request.jwt.claim.sub = 'cccc2222-0000-0000-0000-000000000022';
set role authenticated;

-- Empat pekan selesai dengan berat yang turun rata per pekan:
--   pekan 1: 76,0 · pekan 2: 75,6 · pekan 3: 75,2 · pekan 4: 74,8
-- Rata-rata 7 hari di akhir pekan 1 = 76,0, di akhir pekan 4 = 74,8 → −1,2 kg.
-- Pinggang 86,0 → 85,2 (−0,8 cm).
do $$
declare
  v_senin date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date);
  v_dari date := v_senin - 28;
  i integer;
begin
  for i in 0..27 loop
    perform public.simpan_berat_pagi(
      (v_dari + i)::date,
      (array[76.0, 75.6, 75.2, 74.8])[1 + i / 7]
    );
  end loop;
  perform public.simpan_ukuran(v_dari, 86.0, null, 38.5);
  perform public.simpan_ukuran(v_dari + 26, 85.2, null, 38.4);
end $$;

-- 1. Periode: empat pekan yang SUDAH selesai, Senin sampai Minggu.
do $$
declare e jsonb; v_senin date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date);
begin
  e := public.evaluasi_4_mingguan();
  assert (e->>'periode_dari')::date = v_senin - 28,
    format('periode_dari = %s, seharusnya Senin empat pekan lalu', e->>'periode_dari');
  assert (e->>'periode_sampai')::date = v_senin - 1,
    format('periode_sampai = %s, seharusnya Minggu kemarin-pekan', e->>'periode_sampai');
  assert extract(isodow from (e->>'periode_dari')::date) = 1, 'periode tidak mulai Senin';
  -- Periodenya harus bisa langsung disimpan ke evaluasi_periodik, yang
  -- menuntut Senin dan tepat 28 hari.
  assert (e->>'periode_sampai')::date - (e->>'periode_dari')::date = 27,
    'periode bukan 28 hari';
  assert (e->>'fase') = 'Cut', format('fase = %s', e->>'fase');
  assert (e->>'pekan_data')::int = 4, format('pekan_data = %s, seharusnya 4', e->>'pekan_data');
end $$;

-- 2. Sumbu diturunkan dari data, dengan angka yang bisa dihitung tangan.
do $$
declare e jsonb;
begin
  e := public.evaluasi_4_mingguan();

  assert (e->'sumbu'->'berat'->>'awal_kg')::numeric = 76.0,
    format('berat awal = %s, seharusnya 76,0', e->'sumbu'->'berat'->>'awal_kg');
  assert (e->'sumbu'->'berat'->>'akhir_kg')::numeric = 74.8,
    format('berat akhir = %s, seharusnya 74,8', e->'sumbu'->'berat'->>'akhir_kg');
  assert (e->'sumbu'->'berat'->>'selisih_kg')::numeric = -1.2,
    format('selisih berat = %s', e->'sumbu'->'berat'->>'selisih_kg');
  assert (e->'sumbu'->'berat'->>'arah') = 'turun',
    format('arah berat = %s', e->'sumbu'->'berat'->>'arah');

  assert (e->'sumbu'->'pinggang'->>'selisih_cm')::numeric = -0.8,
    format('selisih pinggang = %s', e->'sumbu'->'pinggang'->>'selisih_cm');
  assert (e->'sumbu'->'pinggang'->>'arah') = 'turun',
    format('arah pinggang = %s', e->'sumbu'->'pinggang'->>'arah');
end $$;

-- 3. Sumbu KEKUATAN dinyatakan belum jelas beserta sebabnya — dan karena itu
--    keyakinannya tidak pernah `tinggi`, walau empat pekan datanya penuh.
do $$
declare e jsonb;
begin
  e := public.evaluasi_4_mingguan();
  assert (e->'sumbu'->'kekuatan'->>'arah') = 'belum jelas', 'kekuatan seharusnya belum jelas';
  assert (e->'sumbu'->'kekuatan'->>'sebab') is not null, 'sebab kekuatan tidak disebut';
  assert (e->>'keyakinan') <> 'tinggi',
    'keyakinan tinggi padahal satu sumbu tidak bisa dibaca';

  -- Verdict lewat pohon keputusan yang sama dengan TypeScript.
  assert (e->>'kode') = 'cut-berjalan', format('kode = %s, seharusnya cut-berjalan', e->>'kode');
  assert (e->>'keyakinan') = 'sedang', format('keyakinan = %s, seharusnya sedang', e->>'keyakinan');
  assert (e->>'penentu') is not null, 'penentu tidak disebut';
end $$;

-- 4. Pekan BERJALAN tidak ikut: lonjakan berat pekan ini tidak mengubah
--    verdict. Verdict yang berubah Selasa lalu berubah lagi Kamis tidak akan
--    dipercaya siapa pun.
do $$
declare e_sebelum jsonb; e_sesudah jsonb; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  e_sebelum := public.evaluasi_4_mingguan();
  perform public.simpan_berat_pagi(v_hari_ini, 80.0);
  perform public.simpan_ukuran(v_hari_ini, 90.0, null, 38.5);
  e_sesudah := public.evaluasi_4_mingguan();

  assert e_sebelum->'sumbu' = e_sesudah->'sumbu', 'pekan berjalan ikut mengubah sumbu';
  assert (e_sebelum->>'kode') = (e_sesudah->>'kode'), 'pekan berjalan ikut mengubah verdict';
end $$;

-- 5. Konsistensi dengan pohon keputusan: kode dari data sama dengan
--    kode_evaluasi atas sumbu yang dilaporkannya sendiri.
do $$
declare e jsonb; k jsonb;
begin
  e := public.evaluasi_4_mingguan();
  k := public.kode_evaluasi(
    (e->>'fase')::public.fase_program,
    e->'sumbu'->'berat'->>'arah',
    e->'sumbu'->'pinggang'->>'arah',
    e->'sumbu'->'kekuatan'->>'arah',
    (e->>'pekan_data')::int);
  assert (k->>'kode') = (e->>'kode') and (k->>'keyakinan') = (e->>'keyakinan'),
    'verdict tidak sesuai dengan sumbu yang dilaporkannya';
end $$;

-- 6. Ambang DISKALAKAN: turun 0,5 kg dalam empat pekan adalah `datar`, bukan
--    `turun`. Dengan ambang mingguan 0,2 kg, perubahan sekecil itu akan dibaca
--    sebagai arah — dan verdict empat pekan jadi mengikuti goyangan air.
reset role;
set request.jwt.claim.sub = 'cccc3333-0000-0000-0000-000000000033';
set role authenticated;

do $$
declare
  v_senin date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date);
  v_dari date := v_senin - 28;
  e jsonb;
  i integer;
begin
  update public.profiles set fase_aktif = 'Maintenance';
  for i in 0..27 loop
    perform public.simpan_berat_pagi((v_dari + i)::date, case when i < 7 then 74.5 else 74.0 end);
  end loop;

  e := public.evaluasi_4_mingguan();
  assert (e->'sumbu'->'berat'->>'selisih_kg')::numeric = -0.5,
    format('selisih = %s', e->'sumbu'->'berat'->>'selisih_kg');
  assert (e->'sumbu'->'berat'->>'arah') = 'datar',
    format('−0,5 kg dalam empat pekan dibaca %s, seharusnya datar', e->'sumbu'->'berat'->>'arah');
  assert (e->'sumbu'->'berat'->>'ambang_kg')::numeric = 0.8, 'ambang berat bukan 0,8 kg';
  -- Pinggang belum pernah diukur → belum jelas, bukan datar.
  assert (e->'sumbu'->'pinggang'->>'arah') = 'belum jelas',
    format('pinggang tanpa pengukuran dibaca %s', e->'sumbu'->'pinggang'->>'arah');
  assert (e->>'kode') = 'mt-stabil', format('kode = %s', e->>'kode');
  -- Dua sumbu belum jelas → keyakinan rendah.
  assert (e->>'keyakinan') = 'rendah', format('keyakinan = %s', e->>'keyakinan');
end $$;

-- 7. Ujung tren yang ditopang terlalu sedikit timbangan → `belum jelas`, lalu
--    verdictnya `data-kurang` dengan keyakinan rendah — berhenti, bukan menebak.
do $$
declare
  v_senin date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date);
  e jsonb;
begin
  -- Hapus timbangan pekan pertama kecuali satu.
  update public.daily_logs set berat_pagi_kg = null, sumber_berat = null
   where tanggal between v_senin - 28 and v_senin - 23;

  e := public.evaluasi_4_mingguan();
  assert (e->'sumbu'->'berat'->>'arah') = 'belum jelas',
    format('ujung dengan satu timbangan dibaca %s', e->'sumbu'->'berat'->>'arah');
  assert (e->>'kode') = 'data-kurang', format('kode = %s', e->>'kode');
  assert (e->>'keyakinan') = 'rendah', 'data-kurang seharusnya berkeyakinan rendah';
end $$;

-- 8. Isolasi: evaluasi pengguna B tidak memakai catatan pengguna A.
do $$
declare e jsonb;
begin
  e := public.evaluasi_4_mingguan();
  assert (e->>'fase') = 'Maintenance', 'pengguna B mewarisi fase pengguna A';
  assert (e->'sumbu'->'pinggang'->>'jumlah_pencatatan')::int = 0,
    'pengguna B membaca ukuran pengguna A';
end $$;

-- 9. Tanpa sesi & peran anon.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.evaluasi_4_mingguan();
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;

  assert not has_function_privilege('anon', 'public.evaluasi_4_mingguan(date)', 'execute'),
    'anon masih boleh menjalankan evaluasi';
  assert has_function_privilege('authenticated', 'public.evaluasi_4_mingguan(date)', 'execute'),
    'authenticated seharusnya boleh menjalankan evaluasinya';
end $$;

select '✓ evaluasi 4 mingguan: periode = pekan yang sudah selesai, ambang diskalakan, kekuatan jujur belum terbaca' as hasil;
