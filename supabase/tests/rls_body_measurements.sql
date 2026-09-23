-- =============================================================================
-- Uji skema & RLS body_measurements.
--
-- Yang diperiksa bukan bahwa INSERT bisa jalan, melainkan bahwa jaminan
-- strukturalnya benar-benar ditegakkan database: satu pencatatan per tanggal,
-- baris tanpa isi ditolak, salah ketik yang mustahil ditolak, pencatatan
-- sebagian diterima, dan ukuran tubuh orang lain tidak pernah terbaca.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('aaaa2222-0000-0000-0000-000000000002', 'ukuran-a@contoh.test'),
  ('aaaa3333-0000-0000-0000-000000000003', 'ukuran-b@contoh.test');

set request.jwt.claim.sub = 'aaaa2222-0000-0000-0000-000000000002';
set role authenticated;

-- 1. Pencatatan lengkap diterima.
do $$
declare v_id uuid;
begin
  insert into public.body_measurements (
    user_id, tanggal, leher_cm, dada_cm, pinggang_cm,
    lengan_kiri_cm, lengan_kanan_cm, paha_kiri_cm, paha_kanan_cm, catatan
  )
  values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-07',
          38.5, 102.0, 85.4, 34.2, 34.6, 57.0, 57.4, 'Pagi sebelum makan')
  returning id into v_id;

  assert v_id is not null, 'pencatatan lengkap seharusnya diterima';
  assert (select pinggang_cm from public.body_measurements where id = v_id) = 85.4,
    'nilai pinggang tidak tersimpan apa adanya';
end $$;

-- 2. Pencatatan SEBAGIAN diterima: orang yang pekan ini cuma mengukur pinggang
--    tidak boleh terhalang.
do $$
begin
  insert into public.body_measurements (user_id, tanggal, pinggang_cm)
  values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-14', 85.0);

  assert (select num_nonnulls(dada_cm, leher_cm) from public.body_measurements
           where tanggal = date '2026-09-14') = 0,
    'bagian yang tidak diukur seharusnya tetap kosong, bukan nol';
end $$;

-- 3. Baris tanpa satu pun ukuran ditolak — itu cuma tanggal tanpa isi.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.body_measurements (user_id, tanggal, catatan)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-21', 'lupa meteran');
  exception when check_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'baris tanpa ukuran seharusnya ditolak';
end $$;

-- 4. Satu pencatatan per tanggal: tren tidak boleh bercabang.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-14', 84.8);
  exception when unique_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'dua pencatatan di tanggal sama seharusnya ditolak';

  -- Yang benar adalah MEMPERBARUI baris tanggal itu.
  update public.body_measurements set pinggang_cm = 84.8
   where tanggal = date '2026-09-14';
  assert (select pinggang_cm from public.body_measurements where tanggal = date '2026-09-14') = 84.8,
    'pembaruan pencatatan yang sudah ada seharusnya berhasil';
end $$;

-- 5. Salah ketik yang mustahil ditolak per bagian tubuh — satu angka liar
--    merusak seluruh tren di layar.
do $$
declare v_gagal boolean;
begin
  -- 85 diketik jadi 8,5.
  v_gagal := false;
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-28', 8.5);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pinggang 8,5 cm seharusnya ditolak';

  -- 85 diketik jadi 850 — tidak lolos lewat presisi kolom, tapi lewat CHECK.
  v_gagal := false;
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-28', 850);
  exception when check_violation or numeric_value_out_of_range then v_gagal := true; end;
  assert v_gagal, 'pinggang 850 cm seharusnya ditolak';

  -- Leher punya rentangnya sendiri; 85 masuk akal untuk pinggang, tidak untuk leher.
  v_gagal := false;
  begin
    insert into public.body_measurements (user_id, tanggal, leher_cm)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-28', 85);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'leher 85 cm seharusnya ditolak';

  -- Sementara 85 cm untuk PINGGANG tetap diterima di tanggal yang sama.
  insert into public.body_measurements (user_id, tanggal, leher_cm, pinggang_cm)
  values ('aaaa2222-0000-0000-0000-000000000002', date '2026-09-28', 38.4, 85);
  assert (select leher_cm from public.body_measurements where tanggal = date '2026-09-28') = 38.4,
    'nilai yang masuk akal seharusnya diterima';
end $$;

-- 6. Ketelitian 0,1 cm — ketelitian meteran kain, bukan lebih.
do $$
begin
  insert into public.body_measurements (user_id, tanggal, pinggang_cm)
  values ('aaaa2222-0000-0000-0000-000000000002', date '2026-10-05', 84.86);
  assert (select pinggang_cm from public.body_measurements where tanggal = date '2026-10-05') = 84.9,
    'nilai seharusnya dibulatkan ke 0,1 cm oleh tipe kolomnya';
end $$;

-- 7. Catatan yang kepanjangan ditolak dengan jelas.
do $$
declare v_gagal boolean := false;
begin
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm, catatan)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-10-12', 85,
            repeat('x', 501));
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'catatan 501 karakter seharusnya ditolak';
end $$;

-- 8. `updated_at` ikut bergerak saat barisnya diperbarui.
do $$
declare v_lama timestamptz; v_baru timestamptz;
begin
  select updated_at into v_lama from public.body_measurements where tanggal = date '2026-09-14';
  update public.body_measurements set pinggang_cm = 84.6
   where tanggal = date '2026-09-14';
  select updated_at into v_baru from public.body_measurements where tanggal = date '2026-09-14';
  assert v_baru >= v_lama, 'updated_at seharusnya disegarkan trigger';
end $$;

-- 9. RLS: ukuran tubuh orang lain tidak pernah terbaca, tidak bisa ditulis,
--    dan tidak bisa dihapus.
reset role;
set request.jwt.claim.sub = 'aaaa3333-0000-0000-0000-000000000003';
set role authenticated;

do $$
declare n integer; v_gagal boolean := false;
begin
  select count(*) into n from public.body_measurements;
  assert n = 0, format('pengguna B melihat %s pencatatan orang lain', n);

  -- Menulis atas nama orang lain ditolak kebijakannya.
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm)
    values ('aaaa2222-0000-0000-0000-000000000002', date '2026-11-02', 86);
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'menulis atas nama pengguna lain seharusnya ditolak RLS';

  -- Menghapus punya orang lain tidak melakukan apa pun (barisnya tidak terlihat).
  delete from public.body_measurements where tanggal = date '2026-09-07';

  insert into public.body_measurements (user_id, tanggal, pinggang_cm)
  values ('aaaa3333-0000-0000-0000-000000000003', date '2026-09-07', 78.2);
  assert (select count(*) from public.body_measurements) = 1,
    'pengguna B seharusnya hanya melihat pencatatannya sendiri';
end $$;

do $$
begin
  reset role;
  -- Empat pencatatan yang berhasil: 7 & 14 & 28 Sep, 5 Okt. Yang penting di
  -- sini 7 Sep — baris yang tadi dicoba dihapus pengguna B — masih ada.
  assert (select count(*) from public.body_measurements
           where user_id = 'aaaa2222-0000-0000-0000-000000000002') = 4,
    format('pencatatan pengguna A tinggal %s, seharusnya 4',
           (select count(*) from public.body_measurements
             where user_id = 'aaaa2222-0000-0000-0000-000000000002'));
  assert exists (select 1 from public.body_measurements
                  where user_id = 'aaaa2222-0000-0000-0000-000000000002'
                    and tanggal = date '2026-09-07'),
    'pencatatan 7 Sep pengguna A terhapus oleh pengguna B';
end $$;

-- 10. Peran anon tidak boleh menyentuh tabelnya sama sekali.
do $$
begin
  assert not has_table_privilege('anon', 'public.body_measurements', 'select'),
    'anon masih boleh membaca ukuran tubuh';
  assert not has_table_privilege('anon', 'public.body_measurements', 'insert'),
    'anon masih boleh menulis ukuran tubuh';
  assert has_table_privilege('authenticated', 'public.body_measurements', 'select'),
    'authenticated seharusnya boleh membaca ukuran tubuhnya';
  assert (select relrowsecurity from pg_class where oid = 'public.body_measurements'::regclass),
    'RLS seharusnya aktif di body_measurements';
end $$;

select '✓ body_measurements: satu pencatatan per tanggal, baris kosong & salah ketik ditolak, pencatatan sebagian diterima, RLS mengisolasi' as hasil;
