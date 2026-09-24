-- =============================================================================
-- Uji skema & RLS ringkasan mingguan + evaluasi 4 mingguan.
--
-- Yang paling penting di sini: laporan berkala TIDAK ikut hilang saat
-- percakapannya dihapus. Pengguna yang membersihkan riwayat chat tidak sedang
-- berkata "lupakan hasil evaluasi empat pekan saya".
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('bbbb5555-0000-0000-0000-000000000005', 'lap-a@contoh.test'),
  ('bbbb6666-0000-0000-0000-000000000006', 'lap-b@contoh.test');

set request.jwt.claim.sub = 'bbbb5555-0000-0000-0000-000000000005';
set role authenticated;

-- 1. Ringkasan mingguan yang sah diterima. 2026-09-14 adalah Senin.
do $$
declare v_id uuid;
begin
  insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, poin, bacaan)
  values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-14', date '2026-09-20',
          '[{"kunci":"berat_rata","nilai":74.5,"unit":"kg","sumber":"manual"}]'::jsonb,
          'Berat naik 0,3 kg, pinggang tetap. Sesuai koridor Lean Gain.')
  returning id into v_id;
  assert v_id is not null, 'ringkasan yang sah seharusnya diterima';
end $$;

-- 2. JAMINAN 1: periode harus periode yang SAH — Senin, dan tepat tujuh hari.
--    Periode yang bergeser sehari akan menghitung dua kali hari yang sama di dua
--    laporan berbeda.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-15', date '2026-09-21', 'x');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'ringkasan yang mulai hari Selasa seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-21', date '2026-09-28', 'x');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'ringkasan delapan hari seharusnya ditolak';
end $$;

-- 3. JAMINAN 2: satu laporan per periode. Dua ringkasan untuk pekan yang sama
--    berarti salah satunya kedaluwarsa, dan tidak ada cara memilih.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-14', date '2026-09-20', 'lain');
  exception when unique_violation then v_gagal := true; end;
  assert v_gagal, 'ringkasan kedua untuk pekan yang sama seharusnya ditolak';

  -- Yang benar adalah MEMPERBARUI baris pekan itu.
  update public.ringkasan_mingguan set bacaan = 'Diperbarui'
   where periode_dari = date '2026-09-14';
  assert (select bacaan from public.ringkasan_mingguan where periode_dari = date '2026-09-14')
         = 'Diperbarui', 'pembaruan seharusnya berhasil';
end $$;

-- 4. Bacaan kosong bukan ringkasan, dan bentuk JSON-nya dijaga.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-07', date '2026-09-13', '   ');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'bacaan kosong seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan, poin)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-09-07', date '2026-09-13', 'x',
            '{"label":"a"}'::jsonb);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'poin berbentuk objek seharusnya ditolak';
end $$;

-- 5. Evaluasi 4 mingguan: 28 hari dari Senin, dengan sumbu & kode yang dikenal.
do $$
declare v_id uuid;
begin
  insert into public.evaluasi_periodik (
    user_id, periode_dari, periode_sampai, fase,
    arah_berat, arah_pinggang, arah_kekuatan, pekan_data,
    kode, judul, ringkas, rekomendasi, penentu, keyakinan
  )
  values ('bbbb5555-0000-0000-0000-000000000005', date '2026-08-24', date '2026-09-20',
          'Lean Gain', 'naik', 'datar', 'naik', 4,
          'lg-bersih', 'Lean gain bersih', 'Berat naik, pinggang tetap, kekuatan naik.',
          'Lanjutkan target sekarang.', 'pinggang', 'tinggi')
  returning id into v_id;
  assert v_id is not null, 'evaluasi yang sah seharusnya diterima';
  assert public.pekan_evaluasi() = 4, 'konstanta pekan evaluasi seharusnya 4';
end $$;

-- 6. Periode evaluasi harus 4 pekan penuh dan mulai Senin.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-08-24', date '2026-09-13',
            'Lean Gain', 'naik', 'datar', 'naik', 3,
            'lg-bersih', 'a', 'b', 'c', 'd', 'tinggi');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'evaluasi tiga pekan seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-08-25', date '2026-09-21',
            'Lean Gain', 'naik', 'datar', 'naik', 4,
            'lg-bersih', 'a', 'b', 'c', 'd', 'tinggi');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'evaluasi yang mulai hari Selasa seharusnya ditolak';
end $$;

-- 7. JAMINAN 3: kode verdict yang tidak pernah dihasilkan `evaluasi4Mingguan`
--    ditolak — UI yang menerima kode tak dikenal hanya bisa diam.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-07-27', date '2026-08-23',
            'Cut', 'turun', 'turun', 'datar', 4,
            'cut-berjalan-lancar', 'a', 'b', 'c', 'd', 'tinggi');  -- kode salah ketik
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'kode verdict tak dikenal seharusnya ditolak';

  -- Arah & keyakinan yang tidak dikenal juga ditolak.
  v_gagal := false;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-07-27', date '2026-08-23',
            'Cut', 'mendaki', 'turun', 'datar', 4,
            'cut-berjalan', 'a', 'b', 'c', 'd', 'tinggi');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'arah "mendaki" seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-07-27', date '2026-08-23',
            'Cut', 'turun', 'turun', 'datar', 9,
            'cut-berjalan', 'a', 'b', 'c', 'd', 'tinggi');
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pekan_data 9 seharusnya ditolak — periodenya hanya 4 pekan';
end $$;

-- 7b. Kode & keyakinan harus TURUNAN dari sumbu di baris yang sama (pohon
--     keputusan `kode_evaluasi`), juga untuk tulisan langsung dari klien lama:
--     coach dan notifikasi membaca kode ini tanpa menghitung ulang.
do $$
declare v_kode text;
begin
  v_kode := null;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-07-27', date '2026-08-23',
            'Cut', 'naik', 'naik', 'turun', 4,
            'cut-berjalan', 'a', 'b', 'c', 'd', 'tinggi');  -- kode dikenal, tapi bertentangan dengan sumbunya
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23514', format('kode yang bertentangan dengan sumbu: %s, seharusnya 23514', coalesce(v_kode, 'diterima'));

  v_kode := null;
  begin
    insert into public.evaluasi_periodik (
      user_id, periode_dari, periode_sampai, fase, arah_berat, arah_pinggang,
      arah_kekuatan, pekan_data, kode, judul, ringkas, rekomendasi, penentu, keyakinan)
    values ('bbbb5555-0000-0000-0000-000000000005', date '2026-07-27', date '2026-08-23',
            'Cut', 'turun', 'turun', 'belum jelas', 4,
            (public.kode_evaluasi('Cut', 'turun', 'turun', 'belum jelas', 4)->>'kode'),
            'a', 'b', 'c', 'd', 'tinggi');  -- satu sumbu belum jelas, tapi keyakinan tinggi
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23514', format('keyakinan yang tidak mengikuti sumbu: %s, seharusnya 23514', coalesce(v_kode, 'diterima'));
end $$;

-- 8. JAMINAN 4 & alasan tabel ini ada: menghapus percakapan tidak membawa
--    laporannya. Inilah yang membedakan tabel ini dari kolom jsonb di pesan.
do $$
declare v_p uuid; v_pesan uuid;
begin
  insert into public.percakapan (user_id, judul)
  values ('bbbb5555-0000-0000-0000-000000000005', 'Ringkasan pekan ini')
  returning id into v_p;

  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ringkasan)
  values (v_p, 'bbbb5555-0000-0000-0000-000000000005', 'coach', '',
          '{"periode":{"dari":"2026-09-14","sampai":"2026-09-20"},"poin":[],"bacaan":"x"}'::jsonb)
  returning id into v_pesan;

  update public.ringkasan_mingguan set pesan_id = v_pesan
   where periode_dari = date '2026-09-14';
  update public.evaluasi_periodik set pesan_id = v_pesan
   where periode_dari = date '2026-08-24';

  -- Pengguna membersihkan riwayat chat.
  delete from public.percakapan where id = v_p;

  assert (select count(*) from public.ringkasan_mingguan where periode_dari = date '2026-09-14') = 1,
    'ringkasan ikut terhapus bersama percakapannya';
  assert (select pesan_id from public.ringkasan_mingguan where periode_dari = date '2026-09-14') is null,
    'tautan pesan seharusnya dilepas, bukan menahan barisnya';
  assert (select count(*) from public.evaluasi_periodik where periode_dari = date '2026-08-24') = 1,
    'evaluasi ikut terhapus bersama percakapannya';
  assert (select pesan_id from public.evaluasi_periodik where periode_dari = date '2026-08-24') is null,
    'tautan pesan evaluasi seharusnya dilepas';
end $$;

-- 9. Laporan tidak boleh menunjuk pesan pengguna lain.
reset role;
set request.jwt.claim.sub = 'bbbb6666-0000-0000-0000-000000000006';
set role authenticated;

do $$
declare v_p uuid; v_pesan_a uuid; v_gagal boolean := false;
begin
  -- Pengguna A dibuatkan satu pesan lagi (lewat peran postgres, meniru data
  -- yang sudah ada), lalu pengguna B mencoba menautkannya.
  reset role;
  insert into public.percakapan (user_id, judul)
  values ('bbbb5555-0000-0000-0000-000000000005', 'Punya A') returning id into v_p;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'bbbb5555-0000-0000-0000-000000000005', 'pengguna', 'halo')
  returning id into v_pesan_a;
  set role authenticated;

  begin
    insert into public.ringkasan_mingguan (user_id, periode_dari, periode_sampai, bacaan, pesan_id)
    values ('bbbb6666-0000-0000-0000-000000000006', date '2026-09-14', date '2026-09-20',
            'x', v_pesan_a);
  exception when foreign_key_violation or insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'menautkan pesan pengguna lain seharusnya ditolak';
end $$;

-- 10. Isolasi baca & hak anon.
do $$
begin
  assert (select count(*) from public.ringkasan_mingguan) = 0,
    'pengguna B melihat ringkasan orang lain';
  assert (select count(*) from public.evaluasi_periodik) = 0,
    'pengguna B melihat evaluasi orang lain';

  assert not has_table_privilege('anon', 'public.ringkasan_mingguan', 'select'),
    'anon masih boleh membaca ringkasan';
  assert not has_table_privilege('anon', 'public.evaluasi_periodik', 'select'),
    'anon masih boleh membaca evaluasi';
  assert (select relrowsecurity from pg_class where oid = 'public.ringkasan_mingguan'::regclass),
    'RLS seharusnya aktif di ringkasan_mingguan';
  assert (select relrowsecurity from pg_class where oid = 'public.evaluasi_periodik'::regclass),
    'RLS seharusnya aktif di evaluasi_periodik';
end $$;

select '✓ ringkasan & evaluasi: periode wajib sah, satu per periode, kode verdict dibatasi, laporan tidak ikut terhapus bersama chat' as hasil;
