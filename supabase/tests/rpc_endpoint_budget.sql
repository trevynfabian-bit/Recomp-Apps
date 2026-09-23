-- =============================================================================
-- Uji endpoint gabungan layar Budget.
--
-- Yang diuji bukan tiap bagiannya (masing-masing punya berkas ujinya sendiri),
-- melainkan bahwa SATU snapshot ini konsisten: tiap bagian harus sama persis
-- dengan jawaban fungsi aslinya pada tanggal acuan yang sama. Kalau berbeda,
-- layar Budget akan memperlihatkan angka yang saling bertentangan — dan itu
-- jenis bug yang tidak pernah bisa direproduksi saat dilaporkan.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('ffff8888-0000-0000-0000-000000000008', 'endpoint-budget@contoh.test'),
  ('ffff9999-0000-0000-0000-000000000009', 'endpoint-lain@contoh.test');

update public.profiles
   set fase_aktif = 'Lean Gain', tinggi_cm = 178, jenis_kelamin = 'pria',
       tanggal_lahir = date '1994-05-10'
 where user_id = 'ffff8888-0000-0000-0000-000000000008';

set request.jwt.claim.sub = 'ffff8888-0000-0000-0000-000000000008';
set role authenticated;

-- Pekan 21–27 Sep dengan kelebihan, plus riwayat dua pekan supaya TDEE punya
-- bahan. "Hari ini" Rabu 23.
do $$
declare v_rest uuid; v_ab uuid; v_bl uuid; i integer;
begin
  select id into v_rest from public.day_types
   where user_id = 'ffff8888-0000-0000-0000-000000000008' and nama = 'Rest';
  select id into v_ab from public.day_types
   where user_id = 'ffff8888-0000-0000-0000-000000000008' and nama = 'Angkat Beban';
  select id into v_bl from public.day_types
   where user_id = 'ffff8888-0000-0000-0000-000000000008' and nama = 'Beban+Lari';

  for i in 0..13 loop
    perform public.setel_tipe_hari((date '2026-09-10' + i)::date, v_rest);
    update public.daily_logs
       set berat_pagi_kg = 74.00 + 0.05 * i, sumber_berat = 'manual', kalori = 2700
     where tanggal = (date '2026-09-10' + i)::date;
  end loop;

  -- Tiga hari terakhir dibuat berlebih supaya ada yang perlu diredistribusi.
  perform public.setel_tipe_hari(date '2026-09-21', v_ab);
  perform public.setel_tipe_hari(date '2026-09-22', v_bl);
  update public.daily_logs set kalori = 3600 where tanggal = date '2026-09-21';
  update public.daily_logs set kalori = 3800 where tanggal = date '2026-09-22';
  update public.daily_logs set kalori = 2600 where tanggal = date '2026-09-23';
end $$;

-- 1. Tiap bagian sama persis dengan fungsi aslinya.
do $$
declare e jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);

  assert (e->>'hari_ini') = '2026-09-23', format('hari_ini = %s', e->>'hari_ini');
  assert (e->>'minggu_mulai') = '2026-09-21', format('minggu_mulai = %s', e->>'minggu_mulai');
  assert (e->>'fase') = 'Lean Gain', format('fase = %s', e->>'fase');

  assert e->'budget' = public.budget_mingguan(date '2026-09-23', date '2026-09-23', 300),
    'bagian budget berbeda dari budget_mingguan';
  assert e->'redistribusi'->'tawaran'
         = public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23'),
    'tawaran redistribusi berbeda dari hitung_redistribusi';
  assert e->'proteksi_protein' = public.proteksi_protein(date '2026-09-23', date '2026-09-23'),
    'bukti proteksi protein berbeda dari proteksi_protein';
end $$;

-- 2. Ringkasan TDEE-nya ringkasan dari jawaban yang sama, bukan hitungan lain.
do $$
declare e jsonb; t jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  t := public.estimasi_tdee(date '2026-09-23', 14, 18);

  assert e->'tdee'->'min' = t->'min', format('min TDEE = %s vs %s', e->'tdee'->'min', t->'min');
  assert e->'tdee'->'maks' = t->'maks', 'maks TDEE berbeda';
  assert e->'tdee'->'tengah' = t->'tengah', 'tengah TDEE berbeda';
  assert (e->'tdee'->>'keyakinan') = (t->>'keyakinan'), 'keyakinan TDEE berbeda';
  assert e->'tdee'->'hari_data' = t->'masukan'->'hari_data', 'hari_data TDEE berbeda';
  -- Persen lemak ikut diteruskan: tanpa itu Katch-McArdle hilang dan rentangnya
  -- berbeda tanpa sebab yang terlihat.
  assert (e->'tdee'->'min')::text <> (public.endpoint_budget_mingguan(
            date '2026-09-23', date '2026-09-23', 300)->'tdee'->'min')::text,
    'persen lemak tidak diteruskan ke estimasi TDEE';
end $$;

-- 3. Ambang laju ikut diteruskan; tanpa itu status laju di layar akan berbeda
--    dari yang diminta.
do $$
declare e jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 5000, 18);
  assert (e->'budget'->'laju'->>'ambang_kcal')::int = 5000,
    format('ambang = %s, seharusnya 5000', e->'budget'->'laju'->>'ambang_kcal');
  assert (e->'budget'->'laju'->>'status') = 'sesuai laju',
    format('status = %s; ambang 5000 seharusnya memaafkan semuanya',
           e->'budget'->'laju'->>'status');
end $$;

-- 4. Target hari ini disertakan, jadi layar tidak perlu panggilan kedua.
do $$
declare e jsonb; r record;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  select * into r from public.ambil_target_harian(date '2026-09-23');

  assert (e->'target_hari_ini'->>'nama_tipe_hari') = r.nama_tipe_hari,
    format('tipe hari = %s vs %s', e->'target_hari_ini'->>'nama_tipe_hari', r.nama_tipe_hari);
  assert (e->'target_hari_ini'->>'target_kalori')::int = r.target_kalori,
    'target kalori hari ini berbeda';
  assert (e->'target_hari_ini'->>'target_protein_g')::numeric = r.target_protein_g,
    'target protein hari ini berbeda';
end $$;

-- 5. Kuota redistribusi: statusnya dilaporkan SEBELUM pengguna menekan, dan
--    jejak terakhirnya menyertai.
do $$
declare e jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  assert not (e->'redistribusi'->>'kuota_terpakai')::boolean,
    'kuota seharusnya belum terpakai';
  assert (e->'redistribusi'->'penerapan_terakhir') = 'null'::jsonb,
    'belum ada penerapan, tapi jejaknya terisi';

  perform public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null,
                                       date '2026-09-23', 'Disebar rata');

  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  assert (e->'redistribusi'->>'kuota_terpakai')::boolean,
    'kuota seharusnya sudah terpakai setelah diterapkan';
  assert (e->'redistribusi'->'penerapan_terakhir'->>'opsi') = 'sebar_rata',
    'opsi jejak terakhir tidak terbaca';
  assert (e->'redistribusi'->'penerapan_terakhir'->>'alasan') = 'Disebar rata',
    'alasan jejak terakhir tidak terbaca';
  assert (e->'redistribusi'->'penerapan_terakhir'->>'terserap')::int
         + (e->'redistribusi'->'penerapan_terakhir'->>'tersisa')::int
         = (e->'redistribusi'->'penerapan_terakhir'->>'perlu_dipindah')::int,
    'jejak terakhir tidak utuh secara aritmetika';

  -- Setelah diterapkan, buktinya ikut berubah dalam SNAPSHOT YANG SAMA.
  assert (e->'proteksi_protein'->>'jumlah_diredistribusi')::int = 4,
    format('hari diredistribusi = %s, seharusnya 4',
           e->'proteksi_protein'->>'jumlah_diredistribusi');
  assert (e->'proteksi_protein'->>'utuh')::boolean, 'protein seharusnya tetap utuh';
  -- Dan tawarannya sudah tidak punya apa pun untuk dipindah.
  assert (e->'redistribusi'->'tawaran'->>'sebab') = 'sudah pas',
    format('sebab tawaran = %s, seharusnya sudah pas',
           e->'redistribusi'->'tawaran'->>'sebab');
end $$;

-- 6. Tawaran yang disertakan hanya PRATINJAU: memanggil endpoint berkali-kali
--    tidak menerapkan apa pun dan tidak menghanguskan kuota pekan lain.
do $$
declare n_jejak integer; n_hari integer;
begin
  select count(*) into n_jejak from public.redistribusi_mingguan;
  select count(*) into n_hari from public.redistribusi_hari;

  perform public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  perform public.endpoint_budget_mingguan(date '2026-09-16', date '2026-09-16', 300, 18);
  perform public.endpoint_budget_mingguan(date '2026-09-28', date '2026-09-23', 300, 18);

  assert (select count(*) from public.redistribusi_mingguan) = n_jejak,
    'memanggil endpoint menulis jejak redistribusi';
  assert (select count(*) from public.redistribusi_hari) = n_hari,
    'memanggil endpoint menulis jejak harian';
end $$;

-- 7. Hari ini ditentukan SEKALI. Pekan yang seluruhnya di depan tetap memakai
--    "hari ini" yang sama untuk budget, tawaran, dan bukti proteinnya.
do $$
declare e jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-28', date '2026-09-23', 300, 18);
  assert (e->>'minggu_mulai') = '2026-09-28', format('minggu_mulai = %s', e->>'minggu_mulai');
  assert (e->'budget'->>'hari_ini') = '2026-09-23', 'budget memakai hari ini yang berbeda';
  assert (e->'redistribusi'->'tawaran'->>'hari_ini') = '2026-09-23',
    'tawaran memakai hari ini yang berbeda';
  assert (e->'proteksi_protein'->>'hari_ini') = '2026-09-23',
    'bukti proteksi memakai hari ini yang berbeda';
  assert (e->'budget'->'laju'->>'status') = 'belum mulai',
    format('status laju pekan depan = %s', e->'budget'->'laju'->>'status');
end $$;

-- 8. Isolasi: pengguna lain mendapat snapshot miliknya sendiri.
reset role;
set request.jwt.claim.sub = 'ffff9999-0000-0000-0000-000000000009';
set role authenticated;

do $$
declare e jsonb;
begin
  e := public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23', 300, 18);
  assert (e->'budget'->>'terpakai')::int = 0,
    format('terpakai pengguna lain = %s, seharusnya 0', e->'budget'->>'terpakai');
  assert not (e->'redistribusi'->>'kuota_terpakai')::boolean,
    'kuota pengguna lain terbaca sebagai terpakai';
  assert (e->'redistribusi'->'penerapan_terakhir') = 'null'::jsonb,
    'jejak pengguna lain ikut terbaca';
  assert (e->>'fase') = 'Maintenance', format('fase = %s, seharusnya bawaan', e->>'fase');
end $$;

-- 9. Tanpa sesi & peran anon.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.endpoint_budget_mingguan(date '2026-09-23', date '2026-09-23');
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;

  assert not has_function_privilege('anon',
    'public.endpoint_budget_mingguan(date, date, integer, numeric)', 'execute'),
    'anon masih boleh membaca endpoint budget';
  assert has_function_privilege('authenticated',
    'public.endpoint_budget_mingguan(date, date, integer, numeric)', 'execute'),
    'authenticated seharusnya boleh membaca endpoint budget';
end $$;

select '✓ endpoint budget: satu snapshot konsisten dengan tiap fungsi aslinya, kuota redistribusi terbaca, pratinjau tidak menulis' as hasil;
