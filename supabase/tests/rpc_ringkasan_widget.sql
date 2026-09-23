-- =============================================================================
-- Uji service ringkasan harian untuk widget (daily_summaries, ringkasan_widget).
--
-- 1. PARITAS: target_harian_pengguna (jalur server) = ambil_target_harian
--    (jalur sesi) untuk setiap keadaan hari: tanpa catatan, tipe diubah,
--    target hasil redistribusi, sebelum & sesudah ganti fase.
-- 2. Ringkasan dihitung ulang setiap kali harinya berubah — dari klien
--    (makanan), dari SERVER tanpa sesi (tipe hari diganti webhook), dan saat
--    target tipe hari diubah.
-- 3. Klien hanya membaca; widget mendapat bentuk masukan siapkanWidget.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('a9a9a9a9-0000-0000-0000-000000000001', 'widget-a@contoh.test'),
  ('a8a8a8a8-0000-0000-0000-000000000002', 'widget-b@contoh.test');

-- --- 1. Paritas target ---------------------------------------------------------------
set request.jwt.claim.sub = 'a9a9a9a9-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare
  h date := (now() at time zone 'Asia/Jakarta')::date;
  v_beban uuid;
begin
  select id into v_beban from public.day_types where nama = 'Angkat Beban';
  -- h-3: tanpa catatan (tipe bawaan). h-2: tipe diganti. h-1: target redistribusi.
  perform public.setel_tipe_hari(h - 2, v_beban, true);
  perform public.simpan_berat_pagi(h - 1, 74.0);
  update public.daily_logs set target_kalori = 2150 where tanggal = h - 1;
  -- Ganti fase kemarin: hari-hari sebelumnya memegang fase lamanya.
  perform public.ganti_fase('Cut', h);
end $$;

reset role;  -- tetap membawa klaim sesi A: kedua jalur dibandingkan pada data yang sama
do $$
declare
  h date := (now() at time zone 'Asia/Jakarta')::date;
  d date;
  a text;
  b text;
begin
  for d in select generate_series(h - 3, h + 1, interval '1 day')::date loop
    select string_agg(row(t.*)::text, '|') into a from public.ambil_target_harian(d) t;
    select string_agg(row(t.*)::text, '|') into b
      from public.target_harian_pengguna('a9a9a9a9-0000-0000-0000-000000000001', d) t;
    assert a is not distinct from b, format('paritas target %s: sesi %s ≠ server %s', d, a, b);
  end loop;
  -- Kontrol negatif: pengguna lain memberi jawaban berbeda (pembanding bermakna).
  select string_agg(row(t.*)::text, '|') into b
    from public.target_harian_pengguna('a8a8a8a8-0000-0000-0000-000000000002', h - 1) t;
  select string_agg(row(t.*)::text, '|') into a from public.ambil_target_harian(h - 1) t;
  assert a is distinct from b, 'kontrol: target pengguna lain seharusnya berbeda (redistribusi A)';
end $$;

-- --- 2. Dihitung ulang dari klien ----------------------------------------------------
set role authenticated;
do $$
declare
  h date := (now() at time zone 'Asia/Jakarta')::date;
  s public.daily_summaries;
  t record;
begin
  perform public.catat_makanan(h, 'Nasi ayam', 800, 50);
  select * into s from public.daily_summaries where tanggal = h;
  select * into t from public.ambil_target_harian(h);
  assert s.kalori = 800 and s.protein_g = 50, format('ringkasan terpakai = %s kcal / %s g', s.kalori, s.protein_g);
  assert s.sisa_kalori = t.target_kalori - 800, format('sisa %s, seharusnya %s', s.sisa_kalori, t.target_kalori - 800);
  assert s.sumber = 'manual', 'tanpa foto AI → manual';

  perform public.catat_makanan(h, 'Foto makan siang', 600, 30, 0, 0, 0, 'foto_ai');
  select * into s from public.daily_summaries where tanggal = h;
  assert s.kalori = 1400 and s.sumber = 'estimasi', format('setelah foto AI: %s kcal, sumber %s', s.kalori, s.sumber);
end $$;

-- Klien tidak bisa menulis ringkasan (widget tidak boleh bisa "dibohongi").
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.daily_summaries set sisa_kalori = 9999;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'klien seharusnya tidak bisa mengubah daily_summaries';
  v_gagal := false;
  begin
    perform public.hitung_ringkasan_harian('a9a9a9a9-0000-0000-0000-000000000001', current_date);
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'klien seharusnya tidak bisa memanggil hitung_ringkasan_harian (menerima id pengguna)';
end $$;

-- --- 3. Dihitung ulang dari SERVER, tanpa sesi -----------------------------------------
reset role;
reset request.jwt.claim.sub;
set role service_role;
do $$
declare
  h date := (now() at time zone 'Asia/Jakarta')::date;
  v_beban uuid;
  s public.daily_summaries;
  t record;
begin
  -- Mis. auto-deteksi dari latihan webhook mengganti tipe hari ini.
  select id into v_beban from public.day_types
   where user_id = 'a9a9a9a9-0000-0000-0000-000000000001' and nama = 'Angkat Beban';
  update public.daily_logs set day_type_id = v_beban
   where user_id = 'a9a9a9a9-0000-0000-0000-000000000001' and tanggal = h;
  select * into s from public.daily_summaries where user_id = 'a9a9a9a9-0000-0000-0000-000000000001' and tanggal = h;
  select * into t from public.target_harian_pengguna('a9a9a9a9-0000-0000-0000-000000000001', h);
  assert s.nama_tipe_hari = 'Angkat Beban' and s.target_kalori = t.target_kalori,
    format('ringkasan setelah tipe diganti server: %s / %s kcal (seharusnya %s)', s.nama_tipe_hari, s.target_kalori, t.target_kalori);
  assert s.sisa_kalori = t.target_kalori - 1400, 'sisa seharusnya dihitung dengan target baru';
end $$;

-- Target tipe hari diubah → ringkasan HARI INI ikut.
reset role;
set request.jwt.claim.sub = 'a9a9a9a9-0000-0000-0000-000000000001';
set role authenticated;
do $$
declare
  h date := (now() at time zone 'Asia/Jakarta')::date;
  v_lama integer;
begin
  select target_kalori into v_lama from public.daily_summaries where tanggal = h;
  update public.day_type_targets t set target_kalori = t.target_kalori + 100
    from public.day_types d where d.id = t.day_type_id and d.nama = 'Angkat Beban' and t.fase = 'Cut';
  assert (select target_kalori from public.daily_summaries where tanggal = h) = v_lama + 100,
    'mengubah target tipe hari seharusnya menghitung ulang ringkasan hari ini';
end $$;

-- --- 4. Bacaan widget ---------------------------------------------------------------------
do $$
declare
  w jsonb;
begin
  w := public.ringkasan_widget();
  assert (w ->> 'masuk')::boolean and (w ->> 'tampilkanAngka')::boolean, format('widget = %s', w);
  assert (w -> 'ringkasan' ->> 'tanggal') = (w ->> 'tanggal'), 'ringkasan widget seharusnya milik hari ini';
  assert (w -> 'ringkasan' ->> 'sisaKalori')::int = (w -> 'target' ->> 'kalori')::int - 1400,
    format('sisa widget = %s', w -> 'ringkasan');
  assert w -> 'ringkasan' ? 'dihitungPada', 'widget butuh waktu hitung (label "Sisa per 07.12")';

  update public.settings_notifications set widget_aktif = false;
  assert not (public.ringkasan_widget() ->> 'tampilkanAngka')::boolean, 'preferensi angka widget seharusnya terbawa';
end $$;

-- Pengguna baru: target diisi saat mendaftar, jadi ringkasan hari ini sudah
-- ada — sisa = target penuh, belum ada yang dimakan.
reset role;
set request.jwt.claim.sub = 'a8a8a8a8-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare w jsonb;
begin
  w := public.ringkasan_widget();
  assert (w -> 'ringkasan' ->> 'sisaKalori')::int = (w -> 'target' ->> 'kalori')::int,
    format('pengguna baru: sisa seharusnya = target penuh (%s)', w);
  assert (select count(*) from public.daily_summaries) = 1, 'B seharusnya hanya melihat ringkasannya sendiri';
end $$;

-- Hari yang belum dihitung server (mis. lewat tengah malam): ringkasan null,
-- target tetap dikirim — widget menampilkan "Hari baru · Target …".
reset role;
delete from public.daily_summaries where user_id = 'a8a8a8a8-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare w jsonb;
begin
  w := public.ringkasan_widget();
  assert w -> 'ringkasan' = 'null'::jsonb, format('hari belum dihitung: ringkasan = %s', w -> 'ringkasan');
  assert (w -> 'target' ->> 'kalori') is not null, 'target hari ini seharusnya tetap dikirim';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('a9a9a9a9-0000-0000-0000-000000000001', 'a8a8a8a8-0000-0000-0000-000000000002');
