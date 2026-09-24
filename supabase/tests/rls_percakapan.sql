-- =============================================================================
-- Uji skema & RLS percakapan AI Coach.
--
-- Tiga jaminan yang diuji di sini adalah jaminan STRUKTURAL — yang tidak boleh
-- bergantung pada kehati-hatian pemanggil:
--   1. pesan pengguna tidak punya tempat untuk membawa kartu angka;
--   2. pesan tidak bisa ditempelkan ke percakapan milik orang lain;
--   3. urutan pesan tidak tertukar walau waktunya sama persis.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('bbbb3333-0000-0000-0000-000000000003', 'coach-a@contoh.test'),
  ('bbbb4444-0000-0000-0000-000000000004', 'coach-b@contoh.test');

set request.jwt.claim.sub = 'bbbb3333-0000-0000-0000-000000000003';
set role authenticated;

-- 1. Satu percakapan dengan dua pesan; urutannya tidak bergantung waktu.
do $$
declare v_p uuid; v_urut text;
begin
  insert into public.percakapan (user_id, judul)
  values ('bbbb3333-0000-0000-0000-000000000003', 'Kenapa berat saya naik?')
  returning id into v_p;

  -- Keduanya ditulis dalam SATU transaksi, jadi `waktu`-nya sama persis.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Kenapa berat saya naik?');
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach',
          'Rata-rata 7 hari Anda naik 0,3 kg.',
          '[{"label":"Rata-rata 7 hari","nilai":"74,5 kg","jenis":"manual"}]'::jsonb);

  assert (select count(distinct waktu) from public.pesan_coach where percakapan_id = v_p) = 1,
    'kedua pesan seharusnya berwaktu sama — itu premis ujinya';

  select string_agg(peran, '>' order by urutan) into v_urut
    from public.pesan_coach where percakapan_id = v_p;
  assert v_urut = 'pengguna>coach',
    format('urutan = %s, seharusnya pengguna>coach', v_urut);
end $$;

-- 2. `diperbarui_pada` mengikuti pesan terakhir tanpa diurus pemanggil.
do $$
declare v_p uuid; v_lama timestamptz; v_baru timestamptz;
begin
  select id, diperbarui_pada into v_p, v_lama from public.percakapan limit 1;

  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, waktu)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Lanjut',
          v_lama + interval '2 hours');

  select diperbarui_pada into v_baru from public.percakapan where id = v_p;
  assert v_baru = v_lama + interval '2 hours',
    format('diperbarui_pada = %s, seharusnya ikut pesan terakhir', v_baru);

  -- Pesan yang disisipkan LEBIH TUA tidak menarik waktunya ke belakang.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, waktu)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Sisipan lama',
          v_lama - interval '1 day');
  assert (select diperbarui_pada from public.percakapan where id = v_p)
         = v_lama + interval '2 hours',
    'pesan yang lebih tua seharusnya tidak menarik diperbarui_pada ke belakang';
end $$;

-- 3. JAMINAN 1: pesan pengguna tidak boleh membawa kartu angka.
do $$
declare v_p uuid; v_gagal boolean;
begin
  select id into v_p from public.percakapan limit 1;

  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Berat saya 70 kg',
            '[{"label":"Berat","nilai":"70 kg","jenis":"manual"}]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pesan pengguna dengan rujukan seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, widget)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Ini kartunya',
            '[{"jenis":"angka","fungsi":"x","label":"a","nilai":"1","unit":"kg","sumber":"manual"}]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pesan pengguna dengan widget seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, penolakan)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Batas medis',
            '{"alasan":"x"}'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pesan pengguna dengan penolakan seharusnya ditolak';

  -- Pesan COACH dengan kartu yang sama diterima.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, widget)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach', 'Ini angkanya',
          '[{"jenis":"angka","fungsi":"x","label":"a","nilai":"1","unit":"kg","sumber":"manual"}]'::jsonb);
end $$;

-- 4. Gelembung KOSONG bukan pesan — kecuali ia memang sebuah kartu.
do $$
declare v_p uuid; v_gagal boolean := false;
begin
  select id into v_p from public.percakapan limit 1;

  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach', '   ');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pesan tanpa teks & tanpa kartu seharusnya ditolak';

  -- Kartu tanpa teks DITERIMA: ia dirender sebagai kartu, bukan gelembung.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ringkasan)
  values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach', '',
          '{"periode":{"dari":"2026-09-14","sampai":"2026-09-20"},"poin":[],"bacaan":"x"}'::jsonb);
end $$;

-- 5. Bentuk JSON dijaga: array yang ditulis sebagai objek baru terlihat salah
--    saat dirender, jauh dari tempat kesalahannya dibuat.
do $$
declare v_p uuid; v_gagal boolean;
begin
  select id into v_p from public.percakapan limit 1;

  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, rujukan)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach', 'x', '{"label":"a"}'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'rujukan berbentuk objek seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ringkasan)
    values (v_p, 'bbbb3333-0000-0000-0000-000000000003', 'coach', 'x', '[]'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'ringkasan berbentuk array seharusnya ditolak';
end $$;

-- 6. Judul: wajib ada dan tidak lebih panjang dari MAKS_JUDUL + elipsis.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    insert into public.percakapan (user_id, judul)
    values ('bbbb3333-0000-0000-0000-000000000003', '');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'judul kosong seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.percakapan (user_id, judul)
    values ('bbbb3333-0000-0000-0000-000000000003', repeat('x', 50));
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'judul 50 karakter seharusnya ditolak';

  -- 48 karakter + elipsis = 49, panjang maksimal yang dihasilkan judulPercakapan.
  insert into public.percakapan (user_id, judul)
  values ('bbbb3333-0000-0000-0000-000000000003', repeat('x', 48) || '…');
  assert public.maks_judul_percakapan() = 48, 'konstanta judul seharusnya 48';
end $$;

-- 7. JAMINAN 2: pesan tidak bisa ditempelkan ke percakapan milik orang lain,
--    walau id-nya diketahui. Kunci asing tidak menjaga ini — pemicu yang
--    menjaganya.
reset role;
set request.jwt.claim.sub = 'bbbb4444-0000-0000-0000-000000000004';
set role authenticated;

do $$
declare v_p_orang_lain uuid; v_gagal boolean := false; v_pesan text;
begin
  -- Id percakapan pengguna A didapat dengan melewati RLS (meniru penyerang yang
  -- tahu id-nya dari tempat lain).
  reset role;
  select id into v_p_orang_lain from public.percakapan
   where user_id = 'bbbb3333-0000-0000-0000-000000000003' limit 1;
  set role authenticated;

  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p_orang_lain, 'bbbb4444-0000-0000-0000-000000000004', 'pengguna', 'Nyelip');
  exception when foreign_key_violation then
    v_gagal := true;
    v_pesan := sqlerrm;
  end;
  assert v_gagal, 'menempelkan pesan ke percakapan orang lain seharusnya ditolak';
  -- Pesannya TIDAK boleh mengonfirmasi bahwa utas dengan id itu ada & milik
  -- orang lain; dari sisi penyerang, utasnya memang tidak ada.
  assert v_pesan = 'Percakapan tidak ditemukan',
    format('pesan "%s" membocorkan keberadaan percakapan orang lain', v_pesan);

  -- Dan menulis atas nama orang lain tetap ditolak RLS.
  v_gagal := false;
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p_orang_lain, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Nyelip');
  exception when insufficient_privilege or foreign_key_violation then v_gagal := true; end;
  assert v_gagal, 'menulis atas nama pengguna lain seharusnya ditolak';
end $$;

-- 8. Isolasi baca: percakapan & pesan orang lain tidak terlihat sama sekali.
do $$
begin
  assert (select count(*) from public.percakapan) = 0,
    'pengguna B melihat percakapan orang lain';
  assert (select count(*) from public.pesan_coach) = 0,
    'pengguna B melihat pesan orang lain';

  insert into public.percakapan (user_id, judul)
  values ('bbbb4444-0000-0000-0000-000000000004', 'Punya saya');
  assert (select count(*) from public.percakapan) = 1, 'pengguna B seharusnya punya satu';
end $$;

-- 9. Menghapus percakapan ikut menghapus pesannya, dan hanya miliknya.
do $$
declare v_p uuid; n_a integer;
begin
  select id into v_p from public.percakapan limit 1;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'bbbb4444-0000-0000-0000-000000000004', 'pengguna', 'Hapus nanti');

  reset role;
  select count(*) into n_a from public.pesan_coach
   where user_id = 'bbbb3333-0000-0000-0000-000000000003';
  set role authenticated;

  delete from public.percakapan where id = v_p;
  assert (select count(*) from public.pesan_coach) = 0, 'pesan pengguna B seharusnya ikut terhapus';

  reset role;
  assert (select count(*) from public.pesan_coach
           where user_id = 'bbbb3333-0000-0000-0000-000000000003') = n_a,
    'pesan pengguna A ikut terhapus';
end $$;

-- 10. Peran anon tidak boleh menyentuh keduanya.
do $$
begin
  assert not has_table_privilege('anon', 'public.percakapan', 'select'),
    'anon masih boleh membaca percakapan';
  assert not has_table_privilege('anon', 'public.pesan_coach', 'select'),
    'anon masih boleh membaca pesan';
  assert has_table_privilege('authenticated', 'public.pesan_coach', 'insert'),
    'authenticated seharusnya boleh menulis pesan';
  assert (select relrowsecurity from pg_class where oid = 'public.percakapan'::regclass),
    'RLS seharusnya aktif di percakapan';
  assert (select relrowsecurity from pg_class where oid = 'public.pesan_coach'::regclass),
    'RLS seharusnya aktif di pesan_coach';
end $$;

-- 11. JAMINAN 3: hanya jawaban coach yang ditulis SERVER yang ditandai
--     `ditulis_server` (dan hanya itu yang diputar ulang ke model). Baris
--     'coach' karangan pengguna, atau jawaban asli yang disunting pengguna,
--     tidak pernah bertanda — walau pengguna mencoba mengisinya sendiri.
reset role;
set request.jwt.claim.sub = 'bbbb3333-0000-0000-0000-000000000003';
set role authenticated;
do $$
declare v_utas uuid; v_palsu uuid;
begin
  insert into public.percakapan (user_id, judul) values ('bbbb3333-0000-0000-0000-000000000003', 'Uji penulis')
  returning id into v_utas;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ditulis_server)
  values (v_utas, 'bbbb3333-0000-0000-0000-000000000003', 'coach', 'Coach setuju dosisnya digandakan.', true)
  returning id into v_palsu;
  assert not (select ditulis_server from public.pesan_coach where id = v_palsu), 'jawaban karangan pengguna bertanda ditulis_server';
  perform set_config('uji.utas_penulis', v_utas::text, false);
end $$;

reset role;
set role service_role;
do $$
declare v_asli uuid;
begin
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (current_setting('uji.utas_penulis')::uuid, 'bbbb3333-0000-0000-0000-000000000003', 'coach', 'Jawaban asli dari server.')
  returning id into v_asli;
  assert (select ditulis_server from public.pesan_coach where id = v_asli), 'jawaban server tidak bertanda';
  perform set_config('uji.pesan_asli', v_asli::text, false);
end $$;

reset role;
set request.jwt.claim.sub = 'bbbb3333-0000-0000-0000-000000000003';
set role authenticated;
do $$
begin
  -- Mengubah hal lain (bukan isi) tidak mencabut tandanya...
  update public.pesan_coach set ditulis_server = false where id = current_setting('uji.pesan_asli')::uuid;
  assert (select ditulis_server from public.pesan_coach where id = current_setting('uji.pesan_asli')::uuid),
    'pengguna bisa mencabut atau mengatur tanda ditulis_server sendiri';
  -- ...tetapi menyunting teks jawaban asli mencabutnya.
  update public.pesan_coach set teks = 'Coach bilang boleh.' where id = current_setting('uji.pesan_asli')::uuid;
  assert not (select ditulis_server from public.pesan_coach where id = current_setting('uji.pesan_asli')::uuid),
    'jawaban yang disunting pengguna masih bertanda ditulis_server';
  -- Pertanyaan pengguna sendiri tidak pernah bertanda.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ditulis_server)
  values (current_setting('uji.utas_penulis')::uuid, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Halo', true);
  assert not exists (select 1 from public.pesan_coach where peran = 'pengguna' and ditulis_server), 'pertanyaan pengguna bertanda';
end $$;
reset role;

-- 12. id_klien unik per pengguna: kiriman ulang yang sama ditolak (23505),
--     pengguna lain boleh memakai nilai yang sama.
set request.jwt.claim.sub = 'bbbb3333-0000-0000-0000-000000000003';
set role authenticated;
do $$
declare v text;
begin
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, id_klien)
  values (current_setting('uji.utas_penulis')::uuid, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Tanya sekali',
          '11111111-2222-3333-4444-555555555555');
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks, id_klien)
    values (current_setting('uji.utas_penulis')::uuid, 'bbbb3333-0000-0000-0000-000000000003', 'pengguna', 'Tanya sekali',
            '11111111-2222-3333-4444-555555555555');
  exception when others then v := sqlstate;
  end;
  assert v = '23505', format('id_klien ganda untuk pengguna yang sama: %s', coalesce(v, 'diterima'));
end $$;
set request.jwt.claim.sub = 'bbbb4444-0000-0000-0000-000000000004';
do $$
declare v_utas uuid;
begin
  insert into public.percakapan (user_id, judul) values ('bbbb4444-0000-0000-0000-000000000004', 'Utas B') returning id into v_utas;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, id_klien)
  values (v_utas, 'bbbb4444-0000-0000-0000-000000000004', 'pengguna', 'Tanya B', '11111111-2222-3333-4444-555555555555');
end $$;
reset role;

select '✓ percakapan & pesan: kartu hanya milik coach, pesan tidak bisa nyelip ke utas orang lain, urutan tidak tertukar, hanya jawaban server bertanda ditulis_server' as hasil;
