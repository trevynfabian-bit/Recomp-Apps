-- =============================================================================
-- Uji penanda data asli vs estimasi.
--
-- Inti ujinya satu kalimat: SATU porsi yang ditaksir AI harus membuat total
-- kalorinya ditandai estimasi. Angka yang setengah pasti lebih berbahaya
-- daripada angka yang jelas-jelas taksiran, karena yang pertama terbaca seperti
-- fakta — dan pengguna kehilangan satu-satunya cara membedakannya.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('bbbb9999-0000-0000-0000-000000000009', 'sumber-a@contoh.test'),
  ('cccc1111-0000-0000-0000-000000000011', 'sumber-b@contoh.test');

update public.profiles
   set fase_aktif = 'Lean Gain', tinggi_cm = 178, jenis_kelamin = 'pria',
       tanggal_lahir = date '1994-05-10'
 where user_id = 'bbbb9999-0000-0000-0000-000000000009';

set request.jwt.claim.sub = 'bbbb9999-0000-0000-0000-000000000009';
set role authenticated;

-- 1. Aturan mata rantai terlemah, langsung pada fungsinya.
do $$
begin
  assert public.sumber_gabungan(array['manual']) = 'manual', 'manual saja';
  assert public.sumber_gabungan(array['manual', 'sinkron']) = 'sinkron',
    'sinkron mengalahkan manual';
  assert public.sumber_gabungan(array['manual', 'estimasi']) = 'estimasi',
    'estimasi mengalahkan manual';
  assert public.sumber_gabungan(array['sinkron', 'estimasi']) = 'estimasi',
    'estimasi mengalahkan sinkron';
  assert public.sumber_gabungan(array['estimasi', 'manual', 'sinkron']) = 'estimasi',
    'urutan argumen tidak boleh berpengaruh';
  -- Kosong berarti tidak ada masukan; angkanya seluruhnya dari setelan sendiri.
  assert public.sumber_gabungan('{}'::text[]) = 'manual', 'daftar kosong → manual';
end $$;

-- 2. Timbangan: manual, sinkron, dan campurannya.
do $$
declare v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date; s jsonb;
begin
  perform public.simpan_berat_pagi(v_hari_ini - 2, 74.2);
  perform public.simpan_berat_pagi(v_hari_ini - 1, 74.3);

  s := public.sumber_berat_periode(v_hari_ini - 6, v_hari_ini);
  assert (s->>'sumber') = 'manual', format('sumber = %s, seharusnya manual', s->>'sumber');
  assert (s->'rincian'->>'manual')::int = 2, 'dua timbangan manual seharusnya terhitung';

  -- Satu timbangan dari HealthKit membuat agregatnya sinkron — tetap data
  -- mentah, tapi bukan yang diketik pengguna sendiri.
  perform public.simpan_berat_pagi(v_hari_ini, 74.4, 'healthkit');
  s := public.sumber_berat_periode(v_hari_ini - 6, v_hari_ini);
  assert (s->>'sumber') = 'sinkron',
    format('sumber = %s; satu timbangan sinkron seharusnya menular', s->>'sumber');
  assert (s->'rincian'->>'sinkron')::int = 1 and (s->'rincian'->>'manual')::int = 2,
    'rincian sumber tidak sesuai';
end $$;

-- 3. INTI: satu porsi foto AI membuat total kalorinya estimasi.
do $$
declare v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date; s jsonb; v_log uuid;
begin
  select id into v_log from public.daily_logs where tanggal = v_hari_ini;

  insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, protein_g, sumber)
  values ('bbbb9999-0000-0000-0000-000000000009', v_log, 'Nasi + ayam', 700, 45, 'manual'),
         ('bbbb9999-0000-0000-0000-000000000009', v_log, 'Telur', 160, 13, 'manual');

  s := public.sumber_kalori_periode(v_hari_ini, v_hari_ini);
  assert (s->>'sumber') = 'manual', format('sumber = %s, seharusnya manual', s->>'sumber');
  assert (s->'rincian'->>'total_entri')::int = 2, 'dua entri seharusnya terhitung';

  -- Satu entri dari foto AI, dari dua puluh entri sekalipun, sudah cukup.
  insert into public.food_logs (user_id, daily_log_id, nama_makanan, kalori, protein_g, sumber)
  values ('bbbb9999-0000-0000-0000-000000000009', v_log, 'Gado-gado (foto)', 520, 18, 'foto_ai');

  s := public.sumber_kalori_periode(v_hari_ini, v_hari_ini);
  assert (s->>'sumber') = 'estimasi',
    format('sumber = %s; satu entri foto_ai seharusnya membuat totalnya estimasi', s->>'sumber');
  -- Dan rinciannya menyebut SEBERAPA banyak yang ditaksir: "1 dari 3" dan
  -- "3 dari 3" adalah dua keadaan yang sangat berbeda meski penandanya sama.
  assert (s->'rincian'->>'entri_estimasi')::int = 1
         and (s->'rincian'->>'entri_manual')::int = 2,
    format('rincian = %s', s->'rincian');
end $$;

-- 4. Konteks coach memakai penanda turunan itu, bukan penanda yang dipatok.
do $$
declare k jsonb; v_sumber text; v_dasar jsonb;
begin
  k := public.konteks_coach();

  select a->>'sumber', a->'dasar' into v_sumber, v_dasar
    from jsonb_array_elements(k->'angka') a where a->>'kunci' = 'sisa_budget_pekan';
  assert v_sumber = 'estimasi',
    format('sisa budget ditandai %s; ada porsi taksiran di pekan ini', v_sumber);
  assert (v_dasar->'sumber_rincian'->>'entri_estimasi')::int = 1,
    'dasarnya seharusnya menyebut berapa entri yang ditaksir';

  -- Berat: satu timbangan HealthKit → sinkron, bukan manual.
  select a->>'sumber' into v_sumber
    from jsonb_array_elements(k->'angka') a where a->>'kunci' = 'berat_rata_7_hari';
  assert v_sumber = 'sinkron', format('rata-rata berat ditandai %s, seharusnya sinkron', v_sumber);

  -- Target tetap manual: ia SETELAN yang diketik pengguna, bukan pengukuran.
  select a->>'sumber' into v_sumber
    from jsonb_array_elements(k->'angka') a where a->>'kunci' = 'target_kalori_hari_ini';
  assert v_sumber = 'manual', format('target ditandai %s, seharusnya manual', v_sumber);

  -- Bendera aturannya ikut dilaporkan supaya penyusun prompt bisa memeriksanya.
  assert (k->'aturan'->>'sumber_mata_rantai_terlemah')::boolean,
    'bendera aturan mata rantai terlemah hilang';
end $$;

-- 5. Semua entri manual → sisa budget kembali manual. Penandanya mengikuti
--    data, bukan menempel selamanya setelah sekali jadi estimasi.
do $$
declare k jsonb; v_sumber text; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  delete from public.food_logs where sumber = 'foto_ai';

  k := public.konteks_coach();
  select a->>'sumber' into v_sumber
    from jsonb_array_elements(k->'angka') a where a->>'kunci' = 'sisa_budget_pekan';
  assert v_sumber = 'manual',
    format('sisa budget ditandai %s setelah entri taksiran dihapus', v_sumber);
end $$;

-- 6. Kartu angka tanpa asal DITOLAK BARIS, bukan diingatkan di prompt.
do $$
declare v_p uuid; v_gagal boolean;
begin
  insert into public.percakapan (user_id, judul)
  values ('bbbb9999-0000-0000-0000-000000000009', 'Penanda sumber') returning id into v_p;

  -- Rujukan tanpa `jenis`.
  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan)
    values (v_p, 'bbbb9999-0000-0000-0000-000000000009', 'coach', 'x',
            '[{"label":"Berat","nilai":"74,4 kg"}]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'rujukan tanpa jenis sumber seharusnya ditolak';

  -- Rujukan dengan jenis yang tidak dikenal (salah ketik).
  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan)
    values (v_p, 'bbbb9999-0000-0000-0000-000000000009', 'coach', 'x',
            '[{"label":"Berat","nilai":"74,4 kg","jenis":"estimasti"}]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jenis sumber salah ketik seharusnya ditolak';

  -- Widget tanpa `sumber`.
  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, widget)
    values (v_p, 'bbbb9999-0000-0000-0000-000000000009', 'coach', 'x',
            '[{"jenis":"angka","fungsi":"ambil_angka","label":"Berat","nilai":"74,4","unit":"kg"}]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'widget tanpa sumber seharusnya ditolak';

  -- Yang lengkap diterima.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan, widget)
  values (v_p, 'bbbb9999-0000-0000-0000-000000000009', 'coach', 'Rata-ratamu 74,4 kg.',
          '[{"label":"berat_rata_7_hari","nilai":"74,4 kg","jenis":"sinkron"}]'::jsonb,
          '[{"jenis":"angka","fungsi":"ambil_angka","label":"berat_rata_7_hari","nilai":"74,4","unit":"kg","sumber":"sinkron"}]'::jsonb);
  assert (select count(*) from public.pesan_coach where percakapan_id = v_p) = 1,
    'pesan dengan asal lengkap seharusnya diterima';
end $$;

-- 7. Fungsi pemeriksanya sendiri, diuji langsung.
do $$
begin
  assert public.rujukan_bersumber(null), 'null seharusnya lolos';
  assert public.rujukan_bersumber('[]'::jsonb), 'array kosong seharusnya lolos';
  assert not public.rujukan_bersumber('{"label":"a"}'::jsonb), 'objek bukan array';
  assert not public.rujukan_bersumber('["bukan objek"]'::jsonb), 'elemen bukan objek';
  assert public.widget_bersumber(null), 'widget null seharusnya lolos';
  assert not public.widget_bersumber('[{"sumber":"tebakan"}]'::jsonb),
    'sumber tak dikenal seharusnya ditolak';
end $$;

-- 8. Isolasi: sumber dihitung dari catatan PENGGUNA ITU sendiri.
reset role;
set request.jwt.claim.sub = 'cccc1111-0000-0000-0000-000000000011';
set role authenticated;

do $$
declare s jsonb; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  s := public.sumber_kalori_periode(v_hari_ini - 6, v_hari_ini);
  assert (s->'rincian'->>'total_entri')::int = 0,
    format('pengguna B melihat %s entri makanan orang lain', s->'rincian'->>'total_entri');
  s := public.sumber_berat_periode(v_hari_ini - 6, v_hari_ini);
  assert (s->'rincian'->>'manual')::int = 0, 'pengguna B melihat timbangan orang lain';
  assert (s->>'sumber') = 'manual', 'tanpa data, sumbernya manual apa adanya';
end $$;

select '✓ penanda sumber: satu porsi taksiran membuat totalnya estimasi, kartu tanpa asal ditolak baris' as hasil;
