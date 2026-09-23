-- =============================================================================
-- Uji ringkasan mingguan terjadwal.
--
-- Yang dibuktikan:
--   • poin dihitung dari catatan dengan angka yang bisa dihitung tangan, dan
--     rata-rata beratnya SAMA dengan layar Tren pada hari Minggu;
--   • arah diwarnai menurut TUJUAN fase, bukan tanda angkanya;
--   • pekan berjalan ditolak; pekan tanpa catatan tidak diringkas;
--   • penyimpanan menghitung ulang poin sendiri, idempoten per pekan, dan
--     membuat tepat satu utas + satu pesan kartu;
--   • jalur jadwal (service_role) bekerja tanpa sesi, tapi pengguna biasa tidak
--     bisa bertindak atas nama orang lain dan tidak bisa membaca antrean.
--
-- Tanggalnya relatif terhadap Senin pekan berjalan, jadi uji ini tetap berlaku
-- kapan pun ia dijalankan. S = Senin pekan lalu (pekan yang diringkas).
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('dddd1111-0000-0000-0000-000000000011', 'ringkas-a@contoh.test'),
  ('dddd2222-0000-0000-0000-000000000022', 'ringkas-b@contoh.test'),
  ('dddd3333-0000-0000-0000-000000000033', 'ringkas-c@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = 'dddd1111-0000-0000-0000-000000000011';
update public.profiles set fase_aktif = 'Cut'
 where user_id = 'dddd2222-0000-0000-0000-000000000022';

-- --- Data pengguna A (Lean Gain) -------------------------------------------
-- Berat pekan sebelumnya: 74,0 tiap hari → rata-rata 74,00.
-- Berat pekan S: 74,2 74,4 74,3 74,5 74,4 74,2 74,8 → jumlah 520,8 → 74,40.
--   Selisih +0,40 ≥ 0,2 → naik → Lean Gain: sesuai. Satu timbangan HealthKit
--   membuat sumbernya sinkron.
-- Makan: lima hari tercatat, 2.800/3.000/2.900/2.950/2.850 kcal → 2.900;
--   protein 150/170/160/165/155 → 160 g. Satu entri foto AI → estimasi.
-- Pinggang: S0+3 = 85,0 · S+1 = 85,3 · S+5 = 85,6. Pembandingnya pengukuran
--   TERAKHIR sebelum S+5, yaitu S+1: +0,3 → datar → sesuai (bukan +0,6).
-- Latihan: 3 sesi (1 Hevy) vs 2 sesi pekan sebelumnya → +1, sinkron.
set request.jwt.claim.sub = 'dddd1111-0000-0000-0000-000000000011';
set role authenticated;

do $$
declare
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
  i integer;
begin
  for i in 1..7 loop
    perform public.simpan_berat_pagi(s - i, 74.0);
  end loop;
  perform public.simpan_berat_pagi(s + 0, 74.2);
  perform public.simpan_berat_pagi(s + 1, 74.4);
  perform public.simpan_berat_pagi(s + 2, 74.3, 'healthkit');
  perform public.simpan_berat_pagi(s + 3, 74.5);
  perform public.simpan_berat_pagi(s + 4, 74.4);
  perform public.simpan_berat_pagi(s + 5, 74.2);
  perform public.simpan_berat_pagi(s + 6, 74.8);

  perform public.catat_makanan(s + 0, 'Nasi ayam', 2800, 150);
  perform public.catat_makanan(s + 1, 'Foto makan siang', 3000, 170, 0, 0, 0, 'foto_ai');
  perform public.catat_makanan(s + 2, 'Nasi ikan', 2900, 160);
  perform public.catat_makanan(s + 3, 'Oat & telur', 2950, 165);
  perform public.catat_makanan(s + 4, 'Pasta', 2850, 155);

  perform public.simpan_ukuran(s - 4, 85.0);
  perform public.simpan_ukuran(s + 1, 85.3);
  perform public.simpan_ukuran(s + 5, 85.6);

  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id)
  values
    ('dddd1111-0000-0000-0000-000000000011', s - 6, 'Push lama', 'angkat_beban', 'manual', null),
    ('dddd1111-0000-0000-0000-000000000011', s - 3, 'Pull lama', 'angkat_beban', 'manual', null),
    ('dddd1111-0000-0000-0000-000000000011', s + 0, 'Push', 'angkat_beban', 'hevy', 'hevy-r1'),
    ('dddd1111-0000-0000-0000-000000000011', s + 2, 'Lari', 'lari', 'manual', null),
    ('dddd1111-0000-0000-0000-000000000011', s + 4, 'Pull', 'angkat_beban', 'manual', null);
end $$;

-- 1. Periode bawaan = pekan yang sudah selesai; pekan berjalan ditolak.
do $$
declare
  r jsonb;
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  r := public.poin_ringkasan_mingguan();
  assert (r -> 'periode' ->> 'dari')::date = s,
    format('periode dari = %s, seharusnya %s', r -> 'periode' ->> 'dari', s);
  assert (r -> 'periode' ->> 'sampai')::date = s + 6, 'periode bukan Senin–Minggu';
  assert (r ->> 'fase') = 'Lean Gain', format('fase = %s', r ->> 'fase');
  assert (r ->> 'cukup')::boolean, 'pekan berisi catatan dianggap tidak cukup';

  -- Tanggal mana pun dalam pekan itu menunjuk pekan yang sama.
  assert public.poin_ringkasan_mingguan(s + 3) -> 'periode' = r -> 'periode',
    'tanggal tengah pekan tidak dinormalisasi ke Seninnya';

  begin
    perform public.poin_ringkasan_mingguan(s + 7);
    assert false, 'pekan berjalan seharusnya ditolak';
  exception when invalid_parameter_value then null; end;
end $$;

-- 2. Angka tiap poin, dihitung tangan.
do $$
declare
  r jsonb;
  b jsonb; a jsonb; p jsonb; w jsonb; l jsonb;
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
  v_target_kalori integer;
  v_target_protein integer;
begin
  r := public.poin_ringkasan_mingguan();
  select e into b from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'berat_rata';
  select e into a from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'asupan_rata';
  select e into p from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'protein_rata';
  select e into w from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'pinggang';
  select e into l from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'latihan';

  -- Berat
  assert (b ->> 'nilai')::numeric = 74.40, format('rata berat = %s', b ->> 'nilai');
  assert (b ->> 'delta')::numeric = 0.40, format('delta berat = %s', b ->> 'delta');
  assert (b ->> 'arah_nilai') = 'naik', format('arah berat = %s', b ->> 'arah_nilai');
  assert (b ->> 'arah') = 'sesuai', 'berat naik saat Lean Gain seharusnya sesuai';
  assert (b ->> 'sumber') = 'sinkron', format('sumber berat = %s', b ->> 'sumber');
  assert (b -> 'dasar' ->> 'jumlah_timbangan')::int = 7, 'jumlah timbangan salah';

  -- Asupan & protein. Targetnya dibaca dari `ambil_target_harian` — sumber
  -- target yang dipakai layar Log Harian — bukan dihitung ulang di sini, supaya
  -- uji ini juga membuktikan ringkasan memakai urutan cadangan yang sama.
  select round(avg(t.target_kalori))::int, round(avg(t.target_protein_g))::int
    into v_target_kalori, v_target_protein
    from generate_series(0, 4) as i
    cross join lateral public.ambil_target_harian(s + i) as t;
  assert v_target_protein is not null, 'target protein kosong — cadangan tipe hari tidak jalan';
  assert (a ->> 'nilai')::int = 2900, format('rata asupan = %s', a ->> 'nilai');
  assert (a -> 'dasar' ->> 'hari_tercatat')::int = 5,
    'hari tanpa catatan makan seharusnya dilewati, bukan dihitung nol';
  assert (a -> 'dasar' ->> 'rata_target')::int = v_target_kalori, 'rata target kalori salah';
  -- Dua dari lima hari itu tidak punya tipe hari (tanpa latihan); targetnya
  -- tetap terbaca lewat tipe bawaan, bukan dilewati.
  assert (a -> 'dasar' ->> 'hari_bertarget')::int = 5,
    format('hari bertarget = %s; hari tanpa tipe hari seharusnya memakai tipe bawaan',
           a -> 'dasar' ->> 'hari_bertarget');
  assert (a ->> 'delta')::int = 2900 - v_target_kalori, 'selisih asupan bukan nilai − target';
  assert (a ->> 'arah') = case when abs(2900 - v_target_kalori) <= 100 then 'sesuai' else 'berlawanan' end,
    format('arah asupan = %s untuk selisih %s', a ->> 'arah', 2900 - v_target_kalori);
  assert (a ->> 'sumber') = 'estimasi', 'satu entri foto AI seharusnya membuat asupan estimasi';
  assert (p ->> 'nilai')::int = 160, format('rata protein = %s', p ->> 'nilai');
  assert (p ->> 'delta')::int = 160 - v_target_protein, 'selisih protein salah';
  assert (p ->> 'sumber') = 'estimasi', 'protein berasal dari catatan yang sama';

  -- Pinggang: pembanding = pengukuran terakhir sebelum pengukuran pekan ini.
  assert (w ->> 'nilai')::numeric = 85.6, format('pinggang = %s', w ->> 'nilai');
  assert (w ->> 'delta')::numeric = 0.3,
    format('delta pinggang = %s; seharusnya dibanding S+1, bukan S0+3', w ->> 'delta');
  assert (w -> 'dasar' ->> 'tanggal_pembanding')::date = s + 1, 'tanggal pembanding salah';
  assert (w ->> 'arah_nilai') = 'datar', 'selisih 0,3 cm di bawah ambang 0,5 seharusnya datar';
  assert (w ->> 'arah') = 'sesuai', 'pinggang datar saat Lean Gain seharusnya sesuai';
  assert (w ->> 'sumber') = 'manual', 'ukuran tubuh selalu manual';

  -- Latihan
  assert (l ->> 'nilai')::int = 3 and (l ->> 'delta')::int = 1, 'jumlah sesi/delta salah';
  assert (l ->> 'sumber') = 'sinkron', 'satu sesi Hevy seharusnya membuat sumbernya sinkron';
  assert (l ->> 'arah') = 'netral', 'jumlah sesi tidak punya arah benar';

  assert jsonb_array_length(r -> 'kurang') = 0, format('kurang = %s', r -> 'kurang');
  assert public.poin_ringkasan_sah(r -> 'poin'), 'poin hasil fungsi tidak lolos validatornya sendiri';
end $$;

-- 3. Berat pekanan SAMA dengan layar Tren pada hari Minggu-nya.
do $$
declare
  r jsonb; b jsonb; t jsonb;
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  r := public.poin_ringkasan_mingguan();
  select e into b from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'berat_rata';
  t := public.tren_berat_7_hari(s + 6, 28);
  assert (b ->> 'nilai')::numeric = (t -> 'rata_rata' ->> 'rata_rata_kg')::numeric,
    format('ringkasan %s ≠ tren %s', b ->> 'nilai', t -> 'rata_rata' ->> 'rata_rata_kg');
  assert (b ->> 'delta')::numeric = (t -> 'arah' ->> 'perubahan_kg')::numeric,
    'perubahan ringkasan ≠ perubahan tren';
  assert (b ->> 'arah_nilai') = (t -> 'arah' ->> 'arah'), 'arah ringkasan ≠ arah tren';
  assert (b -> 'dasar' ->> 'ambang')::numeric = (t -> 'arah' ->> 'ambang_kg')::numeric,
    'ambang ringkasan ≠ ambang tren';
end $$;

-- 4. Arah menurut tujuan fase — dan kontrol negatif: tandanya saja tidak cukup.
do $$
begin
  assert public.arah_tujuan('berat', 'naik', 'Lean Gain') = 'sesuai', 'LG berat naik';
  assert public.arah_tujuan('berat', 'naik', 'Cut') = 'berlawanan', 'Cut berat naik';
  assert public.arah_tujuan('berat', 'turun', 'Cut') = 'sesuai', 'Cut berat turun';
  assert public.arah_tujuan('berat', 'turun', 'Lean Gain') = 'berlawanan', 'LG berat turun';
  assert public.arah_tujuan('berat', 'datar', 'Maintenance') = 'sesuai', 'MT berat datar';
  assert public.arah_tujuan('berat', 'naik', 'Maintenance') = 'netral',
    'MT: sepekan terlalu pendek untuk menyebut drift berlawanan';
  assert public.arah_tujuan('pinggang', 'naik', 'Lean Gain') = 'berlawanan', 'LG pinggang naik';
  assert public.arah_tujuan('pinggang', 'turun', 'Cut') = 'sesuai', 'Cut pinggang turun';
  assert public.arah_tujuan('pinggang', 'datar', 'Cut') = 'netral', 'Cut pinggang datar';
  assert public.arah_tujuan('berat', null, 'Cut') is null, 'tanpa delta tanpa arah';
  assert public.arah_tujuan('berat', 'belum jelas', 'Cut') is null, 'arah tak dikenal';
end $$;

-- 5. Simpan: poin dihitung ulang, satu utas, satu pesan kartu.
do $$
declare
  h jsonb; r jsonb; rk public.ringkasan_mingguan; ps public.pesan_coach; pc public.percakapan;
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  r := public.poin_ringkasan_mingguan(s);
  h := public.simpan_ringkasan_mingguan(
    s,
    '  Pekan yang berjalan sesuai rencana.  ',
    '["Kenapa pinggang datar?", "Bagaimana menambah protein?"]'::jsonb,
    'Ringkasan pekan uji'
  );
  assert (h ->> 'baru')::boolean, 'simpan pertama seharusnya baru';

  select * into rk from public.ringkasan_mingguan where id = (h ->> 'ringkasan_id')::uuid;
  assert rk.periode_dari = s and rk.periode_sampai = s + 6, 'periode tersimpan salah';
  assert rk.poin = r -> 'poin', 'poin tersimpan tidak sama dengan hasil fungsi poin';
  assert rk.bacaan = 'Pekan yang berjalan sesuai rencana.', 'bacaan tidak dirapikan';
  assert rk.pesan_id = (h ->> 'pesan_id')::uuid, 'laporan tidak menaut ke pesannya';
  assert jsonb_array_length(rk.lanjutan) = 2, 'lanjutan hilang';

  select * into ps from public.pesan_coach where id = rk.pesan_id;
  assert ps.peran = 'coach' and ps.teks = '', 'pesan kartu seharusnya coach tanpa teks';
  assert ps.ringkasan -> 'poin' = r -> 'poin', 'poin di kartu ≠ poin laporan';
  assert (ps.ringkasan ->> 'bacaan') = rk.bacaan, 'bacaan di kartu ≠ laporan';
  assert (ps.ringkasan ->> 'ringkasan_id')::uuid = rk.id, 'kartu tidak menunjuk laporannya';
  assert ps.percakapan_id = (h ->> 'percakapan_id')::uuid, 'utas yang dikembalikan salah';

  select * into pc from public.percakapan where id = ps.percakapan_id;
  assert pc.judul = 'Ringkasan pekan uji', format('judul = %s', pc.judul);
end $$;

-- 6. Idempoten: panggilan kedua tidak membuat apa pun.
do $$
declare
  h1 jsonb; h2 jsonb; n_utas integer; n_pesan integer; n_laporan integer;
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  select count(*) into n_utas from public.percakapan;
  select count(*) into n_pesan from public.pesan_coach;
  h2 := public.simpan_ringkasan_mingguan(s, 'Narasi lain yang datang belakangan.');
  assert not (h2 ->> 'baru')::boolean, 'simpan kedua seharusnya bukan baru';
  assert (select count(*) from public.percakapan) = n_utas, 'simpan kedua membuat utas baru';
  assert (select count(*) from public.pesan_coach) = n_pesan, 'simpan kedua membuat pesan baru';
  select count(*) into n_laporan from public.ringkasan_mingguan where periode_dari = s;
  assert n_laporan = 1, 'lebih dari satu laporan untuk satu pekan';
  assert (select bacaan from public.ringkasan_mingguan where periode_dari = s)
         = 'Pekan yang berjalan sesuai rencana.',
    'narasi yang datang belakangan menimpa laporan pertama';
  assert (h2 ->> 'percakapan_id') is not null and (h2 ->> 'pesan_id') is not null,
    'simpan kedua seharusnya menunjuk utas & pesan yang sudah ada';
end $$;

-- 7. Validasi masukan pemanggil.
do $$
declare s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  begin
    perform public.simpan_ringkasan_mingguan(null, 'x');
    assert false, 'pekan kosong seharusnya ditolak';
  exception when null_value_not_allowed then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s, '   ');
    assert false, 'bacaan kosong seharusnya ditolak';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s, repeat('a', 4001));
    assert false, 'bacaan > 4000 seharusnya ditolak';
  exception when string_data_right_truncation then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s, 'ok', '["a","b","c","d"]'::jsonb);
    assert false, 'lanjutan > 3 seharusnya ditolak';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s, 'ok', '[1]'::jsonb);
    assert false, 'lanjutan bukan teks seharusnya ditolak';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s + 7, 'ok');
    assert false, 'pekan berjalan tidak boleh disimpan';
  exception when invalid_parameter_value then null; end;
end $$;

-- 8. CHECK: poin tanpa asal tidak bisa disimpan lewat jalan mana pun.
do $$
declare s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 14;
begin
  -- Kontrol positif dulu: bentuk yang benar lolos validatornya.
  assert public.poin_ringkasan_sah('[{"kunci":"pinggang","nilai":85.1,"sumber":"manual"}]'),
    'poin yang sah ditolak validator';
  assert not public.poin_ringkasan_sah(null), 'poin null seharusnya tidak sah';
  assert not public.poin_ringkasan_sah('[{"kunci":"pinggang","nilai":85.1}]'), 'tanpa sumber lolos';
  assert not public.poin_ringkasan_sah('[{"kunci":"pinggang","nilai":"85,1","sumber":"manual"}]'),
    'nilai berupa teks lolos — kartu akan memformat ulang teks';
  assert not public.poin_ringkasan_sah('[{"kunci":"lemak","nilai":1,"sumber":"manual"}]'),
    'kunci yang tidak dikenal kartu lolos';

  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, poin, bacaan)
    values ('dddd1111-0000-0000-0000-000000000011', s, s + 6,
            '[{"kunci":"berat_rata","nilai":74.1}]', 'tanpa sumber');
    assert false, 'laporan dengan poin tanpa sumber seharusnya ditolak';
  exception when check_violation then null; end;

  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ringkasan)
    select id, 'dddd1111-0000-0000-0000-000000000011', 'coach', '',
           '{"poin":[{"kunci":"berat_rata","nilai":74.1,"sumber":"tebakan"}],"bacaan":"x"}'
      from public.percakapan limit 1;
    assert false, 'kartu dengan sumber tak dikenal seharusnya ditolak';
  exception when check_violation then null; end;
end $$;

-- 9. Pengguna biasa tidak bisa bertindak atas nama orang lain.
do $$
declare s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  -- Menyebut id sendiri boleh; itu bukan penyamaran.
  perform public.poin_ringkasan_mingguan(s, 'dddd1111-0000-0000-0000-000000000011');
  begin
    perform public.poin_ringkasan_mingguan(s, 'dddd2222-0000-0000-0000-000000000022');
    assert false, 'membaca poin pengguna lain seharusnya ditolak';
  exception when insufficient_privilege then null; end;
  begin
    perform public.simpan_ringkasan_mingguan(s, 'x', null, null, 'dddd2222-0000-0000-0000-000000000022');
    assert false, 'menyimpan atas nama pengguna lain seharusnya ditolak';
  exception when insufficient_privilege then null; end;
  begin
    perform public.pengguna_perlu_ringkasan();
    assert false, 'pengguna biasa seharusnya tidak bisa membaca antrean';
  exception when insufficient_privilege then null; end;
end $$;

-- --- Data pengguna B (Cut) & C (tanpa catatan) -----------------------------
-- B: berat 80,0 sepanjang pekan S (tanpa pembanding pekan lalu), pinggang
-- S+2 = 90,0 dengan pengukuran lama S−40 = 92,0 — di luar jendela 28 hari,
-- jadi TIDAK dipakai sebagai pembanding.
set request.jwt.claim.sub = 'dddd2222-0000-0000-0000-000000000022';
do $$
declare
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
  i integer;
begin
  for i in 0..6 loop
    perform public.simpan_berat_pagi(s + i, 80.0);
  end loop;
  perform public.simpan_ukuran(s - 40, 92.0);
  perform public.simpan_ukuran(s + 2, 90.0);
end $$;

do $$
declare r jsonb; b jsonb; w jsonb;
begin
  r := public.poin_ringkasan_mingguan();
  assert (r ->> 'fase') = 'Cut', format('fase B = %s', r ->> 'fase');
  select e into b from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'berat_rata';
  select e into w from jsonb_array_elements(r -> 'poin') e where e ->> 'kunci' = 'pinggang';
  assert (b ->> 'nilai')::numeric = 80.0, 'B membaca timbangan A';
  assert (b -> 'delta') = 'null'::jsonb and (b -> 'arah') = 'null'::jsonb,
    'tanpa pekan pembanding seharusnya tanpa delta & arah';
  assert (w -> 'delta') = 'null'::jsonb,
    'pengukuran di luar jendela 28 hari dipakai sebagai pembanding';
  assert r -> 'kurang' ? 'asupan', 'B tanpa catatan makan seharusnya kurang asupan';
  assert not exists (select 1 from jsonb_array_elements(r -> 'poin') e
                      where e ->> 'kunci' = 'latihan'),
    'B tanpa latihan dua pekan seharusnya tanpa poin latihan';
  -- RLS: laporan A tidak terlihat oleh B.
  assert (select count(*) from public.ringkasan_mingguan) = 0, 'B melihat laporan A';
end $$;

set request.jwt.claim.sub = 'dddd3333-0000-0000-0000-000000000033';
do $$
declare r jsonb; s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
begin
  r := public.poin_ringkasan_mingguan();
  assert not (r ->> 'cukup')::boolean, 'pekan tanpa catatan seharusnya tidak cukup';
  assert r -> 'kurang' ? 'berat' and r -> 'kurang' ? 'asupan', format('kurang = %s', r -> 'kurang');
  begin
    perform public.simpan_ringkasan_mingguan(s, 'Tidak ada data.');
    assert false, 'pekan tanpa catatan seharusnya tidak disimpan';
  exception when no_data_found then null; end;
end $$;

-- 10. Jalur jadwal: service_role tanpa sesi pengguna.
reset role;
reset request.jwt.claim.sub;
set role service_role;

do $$
declare
  s date := public.awal_minggu((now() at time zone 'Asia/Jakarta')::date) - 7;
  h jsonb;
  antre uuid[];
begin
  select array_agg(pengguna_id) into antre from public.pengguna_perlu_ringkasan();
  assert 'dddd2222-0000-0000-0000-000000000022'::uuid = any(antre), 'B seharusnya ada di antrean';
  assert not ('dddd1111-0000-0000-0000-000000000011'::uuid = any(antre)),
    'A sudah punya ringkasan; seharusnya tidak diantre lagi';
  assert not ('dddd3333-0000-0000-0000-000000000033'::uuid = any(antre)),
    'C tanpa catatan seharusnya tidak diantre (model akan dipanggil sia-sia)';

  begin
    perform public.poin_ringkasan_mingguan(s);
    assert false, 'jalur server tanpa menyebut pengguna seharusnya ditolak';
  exception when null_value_not_allowed then null; end;

  h := public.simpan_ringkasan_mingguan(
    s, 'Berat stabil di 80,0 kg.', null, 'Ringkasan B',
    'dddd2222-0000-0000-0000-000000000022');
  assert (h ->> 'baru')::boolean, 'simpan jalur jadwal seharusnya baru';
  assert (select user_id from public.pesan_coach where id = (h ->> 'pesan_id')::uuid)
         = 'dddd2222-0000-0000-0000-000000000022', 'pesan jadwal jatuh ke pengguna yang salah';
  assert (select user_id from public.percakapan where id = (h ->> 'percakapan_id')::uuid)
         = 'dddd2222-0000-0000-0000-000000000022', 'utas jadwal jatuh ke pengguna yang salah';

  select array_agg(pengguna_id) into antre from public.pengguna_perlu_ringkasan();
  assert antre is null or not ('dddd2222-0000-0000-0000-000000000022'::uuid = any(antre)),
    'B masih diantre setelah ringkasannya tersimpan';

  begin
    perform public.pengguna_perlu_ringkasan(null, 0);
    assert false, 'batas 0 seharusnya ditolak';
  exception when numeric_value_out_of_range then null; end;
end $$;

-- 11. Hak akses.
reset role;
do $$
begin
  assert not has_function_privilege('authenticated',
    'public.pengguna_perlu_ringkasan(date, integer)', 'execute'),
    'authenticated seharusnya tidak punya hak atas antrean';
  assert has_function_privilege('service_role',
    'public.pengguna_perlu_ringkasan(date, integer)', 'execute'),
    'service_role seharusnya bisa membaca antrean';
  assert has_function_privilege('authenticated',
    'public.simpan_ringkasan_mingguan(date, text, jsonb, text, uuid)', 'execute'),
    'pengguna seharusnya bisa meminta ringkasannya sendiri';
  assert not has_function_privilege('anon',
    'public.poin_ringkasan_mingguan(date, uuid)', 'execute'),
    'anon masih boleh membaca poin ringkasan';

  -- Lapis kedua: peran lain (di sini pemilik database) tetap ditolak di dalam
  -- fungsinya walau punya hak EXECUTE.
  begin
    perform public.pengguna_perlu_ringkasan();
    assert false, 'peran selain service_role seharusnya ditolak di dalam fungsi';
  exception when insufficient_privilege then null; end;

  -- Tanpa sesi dan bukan service_role: tidak ada pengguna untuk dilayani.
  begin
    perform public.poin_ringkasan_mingguan(null, 'dddd1111-0000-0000-0000-000000000011');
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;
end $$;

select '✓ ringkasan mingguan: angka dari catatan & sama dengan Tren, arah menurut tujuan, idempoten, jalur jadwal tanpa penyamaran' as hasil;
