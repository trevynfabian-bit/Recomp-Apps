-- =============================================================================
-- Uji health_data: kunci dedup, tanggal WIB, satuan, dan RLS.
--
-- Yang diuji adalah hal-hal yang merusak angka TANPA terlihat salah: sinkron
-- ulang yang menggandakan langkah, lari subuh Strava yang pindah ke kemarin,
-- energi dalam kJ yang terbaca kcal, dan data yang terus masuk setelah
-- pengguna memutus sumbernya.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('dddd1111-0000-0000-0000-000000000001', 'data-a@contoh.test'),
  ('dddd2222-0000-0000-0000-000000000002', 'data-b@contoh.test');

-- Koneksi: A terhubung ke Apple Health & Strava; B hanya ke Apple Health —
-- supaya penolakan tulis-atas-nama-B di bagian RLS datang dari RLS, bukan
-- dari aturan "sumber belum terhubung".
insert into public.health_connections (user_id, sumber, akun_eksternal)
values
  ('dddd1111-0000-0000-0000-000000000001', 'apple_health', null),
  ('dddd1111-0000-0000-0000-000000000001', 'strava', '7001'),
  ('dddd2222-0000-0000-0000-000000000002', 'apple_health', null);

-- --- 1. Tanggal WIB diturunkan dari waktu ------------------------------------
set role service_role;

do $$
declare v record;
begin
  -- Lari subuh 05.30 WIB = 22.30 UTC HARI SEBELUMNYA.
  insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555001', 'kalori_aktif', 412,
          timestamptz '2026-09-15 22:30:00+00', timestamptz '2026-09-15 23:20:00+00')
  returning * into v;
  assert v.tanggal = date '2026-09-16',
    format('lari 05.30 WIB seharusnya tercatat 16 September, bukan %s', v.tanggal);
  -- Kontrol: tanggal UTC mentah memang hari sebelumnya — konversinya bermakna.
  assert (v.waktu_mulai at time zone 'UTC')::date = date '2026-09-15',
    'kontrol: tanggal UTC seharusnya 15 September';
  assert v.satuan = 'kcal', 'satuan energi aktif seharusnya kcal';
end $$;

-- Tanggal tidak bisa ditulis.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.health_data set tanggal = date '2026-09-15' where id_eksternal = '555001';
  exception when generated_always or feature_not_supported or syntax_error_or_access_rule_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'tanggal seharusnya tidak bisa ditulis';
end $$;

-- --- 2. Perangkat menulis Apple Health; tidur ke hari bangun -----------------
reset role;
set request.jwt.claim.sub = 'dddd1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v record;
begin
  -- Tidur 22.50 WIB (15 Sep) sampai 06.10 WIB (16 Sep) = 440 menit.
  insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values ('dddd1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch',
          'A1B2C3D4-0000-0000-0000-000000000001', 'tidur', 440,
          timestamptz '2026-09-15 22:50:00+07', timestamptz '2026-09-16 06:10:00+07')
  returning * into v;
  assert v.tanggal = date '2026-09-16', format('tidur seharusnya dihitung ke hari bangun, bukan %s', v.tanggal);
  assert v.satuan = 'menit', 'satuan tidur seharusnya menit';
end $$;

-- Tidur tanpa waktu bangun ditolak: harinya tidak bisa ditentukan.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch',
            'A1B2C3D4-0000-0000-0000-000000000002', 'tidur', 400, timestamptz '2026-09-16 22:50:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'tidur tanpa waktu bangun seharusnya ditolak';
end $$;

-- --- 3. Kunci dedup: sinkron ulang memperbarui, tidak menambah ---------------
do $$
begin
  -- Total langkah iPhone pukul 10.00 ...
  insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values ('dddd1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.iphone',
          'total:2026-09-16', 'langkah', 3120,
          timestamptz '2026-09-16 00:00:00+07', timestamptz '2026-09-17 00:00:00+07')
  on conflict on constraint health_data_kunci_dedup do update set nilai = excluded.nilai;

  -- ... lalu pukul 21.00, total yang sama sudah tumbuh.
  insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values ('dddd1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.iphone',
          'total:2026-09-16', 'langkah', 9412,
          timestamptz '2026-09-16 00:00:00+07', timestamptz '2026-09-17 00:00:00+07')
  on conflict on constraint health_data_kunci_dedup do update set nilai = excluded.nilai;

  assert (select count(*) from public.health_data where jenis = 'langkah') = 1,
    'sinkron ulang total harian seharusnya memperbarui satu baris, bukan menambah';
  assert (select nilai from public.health_data where jenis = 'langkah') = 9412,
    'total langkah seharusnya nilai terbaru';

  -- Langkah Apple Watch di hari yang sama: ASAL berbeda, baris berbeda.
  -- Memilih satu di antaranya adalah tugas source_priority, bukan kunci dedup.
  insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
  values ('dddd1111-0000-0000-0000-000000000001', 'apple_health', 'com.apple.health.watch',
          'total:2026-09-16', 'langkah', 8870,
          timestamptz '2026-09-16 00:00:00+07', timestamptz '2026-09-17 00:00:00+07');
  assert (select count(*) from public.health_data where jenis = 'langkah') = 2,
    'langkah iPhone dan Watch seharusnya dua baris terpisah';
end $$;

-- Tanpa `on conflict`, kiriman ganda ditolak — termasuk bila `asal` kosong.
reset role;
set role service_role;

do $$
declare v_gagal boolean := false;
begin
  begin
    -- Webhook Strava yang terkirim dua kali (asal null untuk API langsung).
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555001', 'kalori_aktif', 412,
            timestamptz '2026-09-15 22:30:00+00', timestamptz '2026-09-15 23:20:00+00');
  exception when unique_violation then v_gagal := true; end;
  assert v_gagal, 'kiriman Strava ganda (asal null) seharusnya ditolak kunci dedup';
end $$;

-- Kontrol negatif: kunci unik BIASA (nulls distinct) meloloskan kiriman ganda
-- yang sama persis — itulah alasan `nulls not distinct`.
create temp table uji_kunci_biasa (sumber text, asal text, id_eksternal text, unique (sumber, asal, id_eksternal));
insert into uji_kunci_biasa values ('strava', null, '555001'), ('strava', null, '555001');
do $$
begin
  assert (select count(*) from uji_kunci_biasa) = 2,
    'kontrol: kunci unik biasa seharusnya meloloskan dua baris ber-asal null';
end $$;
drop table uji_kunci_biasa;

-- --- 4. Satuan & jenis --------------------------------------------------------
do $$
declare v_gagal boolean;
begin
  -- 3.000 kcal yang dibaca dari kJ tanpa konversi.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555002', 'kalori_aktif', 12552,
            timestamptz '2026-09-16 10:00:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'energi 12.552 (kJ terbaca kcal) seharusnya ditolak';

  -- Langkah pecahan.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555003', 'langkah', 1200.5,
            timestamptz '2026-09-16 10:00:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'langkah pecahan seharusnya ditolak';

  -- Skor WHOOP dari sumber lain.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555004', 'recovery', 60,
            timestamptz '2026-09-16 10:00:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'recovery dari Strava seharusnya ditolak';

  -- Jenis yang tidak dikenal.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555005', 'lainnya', 1,
            timestamptz '2026-09-16 10:00:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jenis "lainnya" seharusnya ditolak';

  -- `asal` hanya untuk Apple Health.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', 'com.strava', '555006', 'kalori_aktif', 300,
            timestamptz '2026-09-16 10:00:00+07');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'asal untuk Strava seharusnya ditolak';
end $$;

-- --- 5. Data hanya masuk selama sumbernya terhubung --------------------------
do $$
declare v_gagal boolean := false;
begin
  -- B belum menghubungkan Strava: bahkan service role tidak boleh menulis.
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd2222-0000-0000-0000-000000000002', 'strava', '999001', 'kalori_aktif', 200,
            timestamptz '2026-09-16 10:00:00+07');
  exception when raise_exception then v_gagal := true; end;
  assert v_gagal, 'data untuk sumber yang belum terhubung seharusnya ditolak';

  -- A memutus Strava: webhook yang masih dalam perjalanan ditolak.
  update public.health_connections set status = 'terputus'
   where user_id = 'dddd1111-0000-0000-0000-000000000001' and sumber = 'strava';
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555007', 'kalori_aktif', 300,
            timestamptz '2026-09-16 10:00:00+07');
  exception when raise_exception then v_gagal := true; end;
  assert v_gagal, 'data dari sumber yang sudah diputus seharusnya ditolak';

  -- Data lama tetap ada: menghapusnya adalah pilihan pengguna, bukan efek samping.
  assert exists (select 1 from public.health_data where id_eksternal = '555001'),
    'data Strava yang sudah masuk seharusnya tidak hilang saat koneksi diputus';
end $$;

-- --- 6. RLS --------------------------------------------------------------------
-- Strava disambung lagi dulu: penolakan di bawah harus datang dari RLS, bukan
-- dari aturan "sumber terputus" di atas (pemicu berjalan sebelum RLS).
update public.health_connections set status = 'terhubung'
 where user_id = 'dddd1111-0000-0000-0000-000000000001' and sumber = 'strava';

reset role;
set request.jwt.claim.sub = 'dddd1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v_gagal boolean;
begin
  assert (select count(*) from public.health_data) = 4,
    'pemilik seharusnya melihat keempat barisnya (Strava + tidur + dua langkah)';

  -- Klien tidak menulis data Strava.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd1111-0000-0000-0000-000000000001', 'strava', '555008', 'kalori_aktif', 300,
            timestamptz '2026-09-16 10:00:00+07');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'klien seharusnya tidak bisa menulis data Strava';

  -- Klien tidak mengubah angka Strava (baris tidak tersentuh).
  update public.health_data set nilai = 1 where sumber = 'strava';
  assert (select nilai from public.health_data where id_eksternal = '555001') = 412,
    'klien seharusnya tidak bisa mengubah angka Strava';

  -- Klien tidak menulis atas nama orang lain: pemicu koneksi sudah menolak
  -- (koneksi B tidak terlihat oleh A). RLS-nya diuji terpisah di bawah.
  v_gagal := false;
  begin
    insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd2222-0000-0000-0000-000000000002', 'apple_health', 'com.apple.health.iphone',
            'X', 'langkah', 10, timestamptz '2026-09-16 10:00:00+07');
  exception when insufficient_privilege or raise_exception then v_gagal := true; end;
  assert v_gagal, 'klien seharusnya tidak bisa menulis data orang lain';

  -- HealthKit melaporkan sampel dihapus: perangkat menghapus barisnya.
  delete from public.health_data where id_eksternal = 'A1B2C3D4-0000-0000-0000-000000000001';
  assert not exists (select 1 from public.health_data where jenis = 'tidur'),
    'perangkat seharusnya bisa menghapus sampel Apple Health yang dihapus pengguna';

  -- Tapi tidak data Strava.
  delete from public.health_data where sumber = 'strava';
  assert exists (select 1 from public.health_data where sumber = 'strava'),
    'klien seharusnya tidak bisa menghapus data Strava';
end $$;

-- RLS sendiri, tanpa pemicu koneksi: tulis atas nama B ditolak KEBIJAKAN,
-- bukan hanya karena kebetulan pemicunya berjalan lebih dulu.
reset role;
alter table public.health_data disable trigger health_data_perlu_koneksi;
set request.jwt.claim.sub = 'dddd1111-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai)
    values ('dddd2222-0000-0000-0000-000000000002', 'apple_health', 'com.apple.health.iphone',
            'X', 'langkah', 10, timestamptz '2026-09-16 10:00:00+07');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'RLS seharusnya menolak tulis atas nama orang lain';
end $$;

reset role;
alter table public.health_data enable trigger health_data_perlu_koneksi;
set request.jwt.claim.sub = 'dddd2222-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  assert (select count(*) from public.health_data) = 0,
    'pengguna lain seharusnya tidak melihat data siapa pun';
end $$;

reset role;
reset request.jwt.claim.sub;
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform 1 from public.health_data;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa membaca data kesehatan';
end $$;

-- --- 7. Akun dihapus: datanya ikut hilang ------------------------------------
reset role;

do $$
begin
  delete from auth.users where id in ('dddd1111-0000-0000-0000-000000000001', 'dddd2222-0000-0000-0000-000000000002');
  assert not exists (select 1 from public.health_data
                      where user_id = 'dddd1111-0000-0000-0000-000000000001'),
    'data kesehatan seharusnya terhapus bersama akun';
end $$;
