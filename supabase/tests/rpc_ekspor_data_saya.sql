-- =============================================================================
-- Uji ekspor seluruh data pribadi: ekspor_data_saya & ringkas_ekspor_data_saya.
-- Lengkap (semua jenis data), hanya milik sendiri, tanpa rahasia token, bentuk
-- tabelnya utuh, dan hitungan ringkasnya sama dengan isi ekspornya.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email) values
  ('e4e40001-0000-4000-8000-000000000001', 'ekspor-ani@contoh.test'),
  ('e4e40002-0000-4000-8000-000000000002', 'ekspor-budi@contoh.test')
on conflict do nothing;

-- Data Ani di banyak tabel (dibuat sebagai pemilik tabel, seperti dari app).
do $$
declare
  a uuid := 'e4e40001-0000-4000-8000-000000000001';
  v_log uuid;
  v_wo uuid;
  v_per uuid;
  v_kon uuid;
begin
  insert into public.daily_logs (user_id, tanggal, berat_pagi_kg, sumber_berat, day_type_id, catatan)
  select a, date '2026-09-10', 74.3, 'manual', id, 'tidur cukup'
    from public.day_types where user_id = a and nama = 'Rest'
  returning id into v_log;
  -- Nama yang tampak seperti formula tetap dikirim apa adanya; penjinakannya
  -- tugas penyusun CSV di app (selCsv), bukan server.
  insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, protein_g, sumber)
  values (a, v_log, '=HYPERLINK("x")', 520, 40, 'manual'),
         (a, v_log, 'Nasi + ayam', 650, 45, 'foto_ai');
  insert into public.body_measurements (user_id, tanggal, pinggang_cm) values (a, date '2026-09-10', 84.5);
  insert into public.workouts (user_id, tanggal, nama, jenis, sumber, durasi_menit)
  values (a, date '2026-09-10', 'Push', 'angkat_beban', 'hevy', 55)
  returning id into v_wo;
  insert into public.workout_sets (workout_id, user_id, latihan, latihan_ke, set_ke, reps, beban_kg)
  values (v_wo, a, 'Bench press', 1, 1, 8, 70), (v_wo, a, 'Bench press', 1, 2, 7, 70);
  insert into public.health_connections (user_id, sumber, akun_eksternal) values (a, 'strava', '7001')
  returning id into v_kon;
  insert into public.health_connection_secrets (connection_id, access_token, refresh_token)
  values (v_kon, 'RAHASIA-AKSES-ANI', 'RAHASIA-SEGAR-ANI');
  insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values (a, 'strava', '9001', 'kalori_aktif', 412, timestamptz '2026-09-10 06:00+07', timestamptz '2026-09-10 06:50+07');
  insert into public.percakapan (user_id, judul) values (a, 'Soal protein') returning id into v_per;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks) values (v_per, a, 'pengguna', 'Protein cukup?');
end $$;

-- Data Budi: tidak boleh ada satu pun di ekspor Ani.
do $$
declare b uuid := 'e4e40002-0000-4000-8000-000000000002'; v_log uuid;
begin
  insert into public.daily_logs (user_id, tanggal, berat_pagi_kg, sumber_berat, catatan)
  values (b, date '2026-09-10', 88.8, 'manual', 'catatan-budi-rahasia') returning id into v_log;
  insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, sumber)
  values (b, v_log, 'Makanan-Budi-Rahasia', 999, 'manual');
end $$;

set request.jwt.claim.sub = 'e4e40001-0000-4000-8000-000000000001';
set role authenticated;

do $$
declare
  e jsonb := public.ekspor_data_saya();
  r jsonb := public.ringkas_ekspor_data_saya();
  t jsonb;
  v_teks text;
  v_nama text[];
  i int;
begin
  -- 1. Semua jenis data hadir, dengan nama unik, urutan sama dengan ringkasnya.
  select array_agg(x->>'nama' order by o) into v_nama from jsonb_array_elements(e->'tabel') with ordinality as z(x, o);
  assert v_nama = array['profil', 'riwayat_fase', 'tipe_hari', 'target_tipe_hari', 'catatan_harian', 'makanan',
                        'ukuran_tubuh', 'sesi_latihan', 'latihan', 'data_kesehatan', 'sumber_data', 'prioritas_sumber',
                        'redistribusi', 'redistribusi_hari', 'percakapan_coach', 'ringkasan_mingguan',
                        'evaluasi_4_mingguan', 'preferensi_notifikasi'],
    format('daftar tabel ekspor: %s', v_nama);
  assert jsonb_array_length(r) = jsonb_array_length(e->'tabel'), 'ringkas & ekspor beda jumlah tabel';

  -- 2. Bentuk tiap tabel utuh, dan hitungan ringkas = isi ekspor.
  for i in 0 .. jsonb_array_length(e->'tabel') - 1 loop
    t := e->'tabel'->i;
    assert t->>'nama' = r->i->>'nama' and t->>'label' = r->i->>'label',
      format('tabel ke-%s: ekspor %s/%s, ringkas %s/%s', i, t->>'nama', t->>'label', r->i->>'nama', r->i->>'label');
    assert jsonb_array_length(t->'baris') = (r->i->>'jumlah')::int,
      format('%s: ekspor %s baris, ringkas %s', t->>'nama', jsonb_array_length(t->'baris'), r->i->>'jumlah');
    assert not exists (select 1 from jsonb_array_elements(t->'baris') b where jsonb_array_length(b) <> jsonb_array_length(t->'kolom')),
      format('%s: ada baris yang lebar selnya tidak sama dengan kolomnya', t->>'nama');
  end loop;

  -- 3. Isi benar-benar data Ani, termasuk yang dari server (sinkron, set latihan).
  assert (select jsonb_array_length(x->'baris') from jsonb_array_elements(e->'tabel') x where x->>'nama' = 'makanan') = 2, 'dua entri makanan';
  assert (select jsonb_array_length(x->'baris') from jsonb_array_elements(e->'tabel') x where x->>'nama' = 'latihan') = 2, 'dua set latihan';
  assert (select jsonb_array_length(x->'baris') from jsonb_array_elements(e->'tabel') x where x->>'nama' = 'data_kesehatan') = 1, 'satu data tersinkron';
  assert (select jsonb_array_length(x->'baris') from jsonb_array_elements(e->'tabel') x where x->>'nama' = 'target_tipe_hari') = 12, '12 target';
  v_teks := e::text;
  assert v_teks like '%=HYPERLINK(\\"x\\")%', 'nama makanan dikirim apa adanya';
  assert v_teks like '%tidur cukup%' and v_teks like '%Bench press%' and v_teks like '%Protein cukup?%', 'isi Ani lengkap';

  -- 4. Tidak ada data akun lain, dan tidak ada rahasia token.
  assert v_teks not like '%Budi-Rahasia%' and v_teks not like '%catatan-budi-rahasia%' and v_teks not like '%88.8%',
    'ekspor memuat data akun lain';
  assert v_teks not like '%RAHASIA-%', 'ekspor memuat token sumber data';
  assert not exists (
    select 1 from jsonb_array_elements(e->'tabel') x, jsonb_array_elements_text(x->'kolom') k
     where k ~* '(token|kunci_api|kursor|user_id|^id$)'
  ), 'ekspor memuat kolom teknis atau rahasia';
end $$;

-- 5. Akun lain mendapat ekspornya sendiri saja.
set request.jwt.claim.sub = 'e4e40002-0000-4000-8000-000000000002';
do $$
declare e text := public.ekspor_data_saya()::text;
begin
  assert e like '%Makanan-Budi-Rahasia%', 'Budi seharusnya melihat datanya sendiri';
  assert e not like '%Nasi + ayam%' and e not like '%Bench press%', 'ekspor Budi memuat data Ani';
end $$;

-- 6. Tanpa sesi dan anon: ditolak.
reset role;
reset request.jwt.claim.sub;
set role authenticated;
do $$
declare v_kode text;
begin
  begin
    perform public.ekspor_data_saya();
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '28000', format('ekspor tanpa sesi: kode %s', v_kode);
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.ekspor_data_saya()', 'execute'), 'anon boleh mengekspor';
  assert not has_function_privilege('anon', 'public.ringkas_ekspor_data_saya()', 'execute'), 'anon boleh meringkas ekspor';
end $$;

-- Bersihkan: uji lain di basis data yang sama menganggap koneksi Strava-nya satu-satunya.
delete from auth.users where id in ('e4e40001-0000-4000-8000-000000000001', 'e4e40002-0000-4000-8000-000000000002');

select '✓ ekspor data saya: 18 tabel, hanya milik sendiri, tanpa token, hitungan ringkas = isi ekspor' as hasil;
