-- =============================================================================
-- Uji penerima webhook Strava & WHOOP (terima_kiriman_luar, putus_koneksi_luar).
--
-- Yang dibuktikan: kiriman diarahkan lewat id akun luar ke pengguna yang
-- TERHUBUNG saja; tanggal latihan diturunkan dari waktu (WIB), dan database
-- menolak tanggal UTC mentah dari penulis mana pun; kiriman ulang aman;
-- penghapusan hanya menyentuh jenis yang disebut; pengguna biasa tidak bisa
-- memakai pintu ini.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('b1c1d1e1-0000-0000-0000-000000000001', 'luar-a@contoh.test'),
  ('b2c2d2e2-0000-0000-0000-000000000002', 'luar-b@contoh.test');

insert into public.health_connections (user_id, sumber, akun_eksternal)
values
  ('b1c1d1e1-0000-0000-0000-000000000001', 'strava', '134815'),
  ('b1c1d1e1-0000-0000-0000-000000000001', 'whoop', '10129');

set role service_role;

-- --- 1. Lari subuh Strava: 22.30 UTC = 05.30 WIB HARI BERIKUTNYA -------------
do $$
declare h jsonb; w record;
begin
  h := public.terima_kiriman_luar('strava', '134815', jsonb_build_object(
    'latihan', jsonb_build_array(jsonb_build_object(
      'id', '1360128428', 'nama', 'Morning Run', 'jenis', 'lari',
      'mulai', '2026-09-15T22:30:00Z', 'durasi_menit', 48)),
    'data', jsonb_build_array(jsonb_build_object(
      'jenis', 'kalori_aktif', 'id', '1360128428', 'nilai', 412,
      'mulai', '2026-09-15T22:30:00Z', 'selesai', '2026-09-15T23:20:00Z'))));

  assert (h ->> 'latihan')::int = 1 and (h ->> 'data')::int = 1, format('hasil = %s', h);
  select * into w from public.workouts where external_id = '1360128428';
  assert w.tanggal = date '2026-09-16', format('lari tercatat %s, seharusnya 16 September (WIB)', w.tanggal);
  assert w.sumber = 'strava' and w.jenis = 'lari' and w.durasi_menit = 48, 'isi latihan salah';
  assert (select tanggal from public.health_data where id_eksternal = '1360128428') = date '2026-09-16',
    'energi lari seharusnya di hari yang sama dengan larinya';
  assert (select sinkron_terakhir from public.health_connections where sumber = 'strava') is not null,
    'sinkron_terakhir Strava seharusnya diperbarui';
end $$;

-- Database menolak tanggal UTC mentah dari penulis MANA PUN.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, waktu_mulai)
    values ('b1c1d1e1-0000-0000-0000-000000000001', date '2026-09-15', 'Lari (tanggal UTC)', 'lari', 'strava',
            'x-utc', timestamptz '2026-09-15 22:30:00+00');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'latihan dengan tanggal UTC mentah seharusnya ditolak';
end $$;

-- --- 2. Kiriman ulang (judul diubah) memperbarui, tidak menggandakan ---------
do $$
declare h jsonb;
begin
  h := public.terima_kiriman_luar('strava', '134815', jsonb_build_object(
    'latihan', jsonb_build_array(jsonb_build_object(
      'id', '1360128428', 'nama', 'Lari subuh', 'jenis', 'lari',
      'mulai', '2026-09-15T22:30:00Z', 'durasi_menit', 48))));
  assert (select count(*) from public.workouts where external_id = '1360128428') = 1, 'kiriman ulang menggandakan latihan';
  assert (select nama from public.workouts where external_id = '1360128428') = 'Lari subuh', 'judul seharusnya diperbarui';
end $$;

-- --- 3. WHOOP: tidur & recovery dengan id tidur yang sama --------------------
do $$
declare h jsonb;
begin
  h := public.terima_kiriman_luar('whoop', '10129', jsonb_build_object(
    'data', jsonb_build_array(
      jsonb_build_object('jenis', 'tidur', 'id', 'sleep-uuid-1', 'nilai', 412,
                         'mulai', '2026-09-15T15:40:00Z', 'selesai', '2026-09-15T23:05:00Z'),
      jsonb_build_object('jenis', 'recovery', 'id', 'sleep-uuid-1', 'nilai', 68, 'mulai', '2026-09-15T23:05:00Z'),
      jsonb_build_object('jenis', 'hr_istirahat', 'id', 'sleep-uuid-1', 'nilai', 51, 'mulai', '2026-09-15T23:05:00Z'),
      jsonb_build_object('jenis', 'hrv', 'id', 'sleep-uuid-1', 'nilai', 72.4, 'mulai', '2026-09-15T23:05:00Z'),
      -- Angka mustahil untuk satu sesi DILEWATI, tidak menggagalkan kiriman.
      -- (Konversi kJ → kcal sendiri diuji di `npm run cek:webhook`.)
      jsonb_build_object('jenis', 'kalori_aktif', 'id', 'w-kj', 'nilai', 15000, 'mulai', '2026-09-16T01:00:00Z')
    )));
  assert (h ->> 'data')::int = 4, format('data tersimpan = %s, seharusnya 4', h ->> 'data');
  assert jsonb_array_length(h -> 'dilewati') = 1 and (h -> 'dilewati' -> 0 ->> 'indeks')::int = 4,
    format('dilewati = %s', h -> 'dilewati');
  -- Bangun 06.05 WIB tanggal 16: tidur & recovery milik tanggal 16.
  assert (select array_agg(distinct tanggal) from public.health_data where id_eksternal = 'sleep-uuid-1')
         = array[date '2026-09-16'], 'tidur & recovery seharusnya di hari bangun (16 September)';
end $$;

-- Recovery dihapus: tidurnya TETAP ada (id sama, jenis berbeda).
do $$
declare h jsonb;
begin
  h := public.terima_kiriman_luar('whoop', '10129', jsonb_build_object(
    'hapus_data', jsonb_build_array(
      jsonb_build_object('id', 'sleep-uuid-1', 'jenis', 'recovery'),
      jsonb_build_object('id', 'sleep-uuid-1', 'jenis', 'hr_istirahat'),
      jsonb_build_object('id', 'sleep-uuid-1', 'jenis', 'hrv'))));
  assert (h ->> 'dihapus')::int = 3, format('dihapus = %s', h ->> 'dihapus');
  assert exists (select 1 from public.health_data where id_eksternal = 'sleep-uuid-1' and jenis = 'tidur'),
    'menghapus recovery tidak boleh menghapus tidur';
end $$;

-- Aktivitas Strava dihapus: latihan dan energinya hilang.
do $$
declare h jsonb;
begin
  h := public.terima_kiriman_luar('strava', '134815', jsonb_build_object(
    'hapus_latihan', jsonb_build_array('1360128428'),
    'hapus_data', jsonb_build_array(jsonb_build_object('id', '1360128428', 'jenis', 'kalori_aktif'))));
  assert (h ->> 'dihapus')::int = 2, format('dihapus = %s', h ->> 'dihapus');
  assert not exists (select 1 from public.workouts where external_id = '1360128428'), 'latihan Strava seharusnya terhapus';
end $$;

-- --- 4. Akun yang tidak dikenal / sudah diputus: diabaikan, tanpa tulis -----
do $$
declare h jsonb; v_ada boolean;
begin
  h := public.terima_kiriman_luar('strava', '999999', jsonb_build_object(
    'latihan', jsonb_build_array(jsonb_build_object('id', 'z1', 'nama', 'X', 'jenis', 'lari', 'mulai', '2026-09-16T00:00:00Z'))));
  assert h ->> 'diabaikan' = 'akun_tidak_dikenal', format('akun asing = %s', h);
  assert not exists (select 1 from public.workouts where external_id = 'z1'), 'akun asing tidak boleh menulis';

  -- Akun WHOOP A dipakai sebagai id Strava: sumbernya berbeda, tidak cocok.
  h := public.terima_kiriman_luar('strava', '10129', '{}');
  assert h ->> 'diabaikan' = 'akun_tidak_dikenal', 'id akun WHOOP tidak boleh cocok untuk Strava';

  -- Izin dicabut dari Strava: koneksi terputus, tokennya hilang, kiriman berikutnya diabaikan.
  insert into public.health_connection_secrets (connection_id, access_token, refresh_token)
  select id, 'uji-akses', 'uji-segar' from public.health_connections where sumber = 'strava';
  v_ada := public.putus_koneksi_luar('strava', '134815', null);
  assert v_ada, 'putus_koneksi_luar seharusnya menemukan koneksinya';
  assert (select status from public.health_connections where sumber = 'strava') = 'terputus', 'koneksi seharusnya terputus';
  assert (select galat_terakhir from public.health_connections where sumber = 'strava') = 'Izin dicabut dari layanan asal.',
    'alasan putus seharusnya tercatat';
  assert not exists (select 1 from public.health_connection_secrets s join public.health_connections c on c.id = s.connection_id
                      where c.sumber = 'strava'), 'token Strava seharusnya terhapus';
  h := public.terima_kiriman_luar('strava', '134815', '{}');
  assert h ->> 'diabaikan' = 'akun_tidak_dikenal', 'kiriman setelah izin dicabut seharusnya diabaikan';
  -- Putus kedua kalinya: tidak menemukan apa-apa, tidak menggeser waktu putus.
  assert not public.putus_koneksi_luar('strava', '134815', null), 'putus kedua seharusnya tidak menyentuh apa pun';

  -- Galat sementara dicatat tanpa memutus.
  perform public.catat_galat_koneksi_luar('whoop', '10129', 'WHOOP sedang tidak bisa dihubungi.');
  assert (select status from public.health_connections where sumber = 'whoop') = 'terhubung', 'galat sementara tidak boleh memutus';
  assert (select galat_terakhir from public.health_connections where sumber = 'whoop') = 'WHOOP sedang tidak bisa dihubungi.',
    'galat sementara seharusnya tercatat';
end $$;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.terima_kiriman_luar('fitbit', '1', '{}');
  exception when invalid_parameter_value then v_gagal := true; end;
  assert v_gagal, 'sumber webhook yang tidak dikenal seharusnya ditolak';
end $$;

-- --- 5. Pengguna biasa tidak bisa memakai pintu webhook ----------------------
reset role;
set request.jwt.claim.sub = 'b2c2d2e2-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare v_gagal boolean;
begin
  -- B mencoba menulis latihan ke akun Strava milik orang lain.
  v_gagal := false;
  begin
    perform public.terima_kiriman_luar('whoop', '10129', '{}');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna biasa seharusnya tidak bisa memanggil terima_kiriman_luar';

  v_gagal := false;
  begin
    perform public.putus_koneksi_luar('whoop', '10129', 'iseng');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna biasa seharusnya tidak bisa memutus koneksi orang lain';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('b1c1d1e1-0000-0000-0000-000000000001', 'b2c2d2e2-0000-0000-0000-000000000002');
