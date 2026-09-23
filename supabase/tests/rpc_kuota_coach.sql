-- =============================================================================
-- Uji kuota pertanyaan AI Coach.
--
-- Yang dibuktikan, termasuk upaya melewatinya:
--   • pertanyaan ke-(batas+1) ditolak dengan 54000, dan tidak ikut terhitung;
--   • jawaban coach tidak menghabiskan kuota;
--   • menghapus riwayat atau memundurkan `waktu` pesan TIDAK memulihkan kuota;
--   • pencacah tidak bisa ditulis pengguna, hanya dibaca miliknya sendiri;
--   • sisipan atas nama orang lain tidak membocorkan kuota orang itu;
--   • kuota kemarin tidak terbawa ke hari ini.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('eeee1111-0000-0000-0000-000000000011', 'kuota-a@contoh.test'),
  ('eeee2222-0000-0000-0000-000000000022', 'kuota-b@contoh.test');

set request.jwt.claim.sub = 'eeee1111-0000-0000-0000-000000000011';
set role authenticated;

-- 1. Sampai batas diterima, satu lebih ditolak; jawaban coach tidak terhitung.
do $$
declare
  v_p uuid;
  i integer;
  v_batas integer := public.batas_pertanyaan_coach_harian();
begin
  insert into public.percakapan (user_id, judul)
  values ('eeee1111-0000-0000-0000-000000000011', 'Uji kuota')
  returning id into v_p;

  for i in 1..v_batas loop
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Pertanyaan ' || i);
    -- Jawaban coach di sela-sela: tidak boleh ikut menghabiskan kuota.
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'coach', 'Jawaban ' || i);
  end loop;

  assert (public.kuota_coach() ->> 'terpakai')::int = v_batas,
    format('terpakai = %s, seharusnya %s', public.kuota_coach() ->> 'terpakai', v_batas);
  assert (public.kuota_coach() ->> 'sisa')::int = 0, 'sisa seharusnya 0';

  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Satu lagi');
    assert false, 'pertanyaan melewati batas seharusnya ditolak';
  exception when program_limit_exceeded then null; end;

  -- Yang ditolak tidak ikut terhitung (transaksinya dibatalkan).
  assert (select jumlah from public.pemakaian_coach_harian
           where user_id = 'eeee1111-0000-0000-0000-000000000011') = v_batas,
    'pertanyaan yang ditolak ikut menambah pencacah';

  -- Coach tetap bisa menjawab (mis. kartu ringkasan) walau kuota habis.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'coach', 'Masih bisa');
end $$;

-- 2. Upaya melewati kuota lewat riwayat sendiri.
do $$
declare v_p uuid;
begin
  select id into v_p from public.percakapan limit 1;

  update public.pesan_coach set waktu = waktu - interval '3 days';
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Setelah mundur waktu');
    assert false, 'memundurkan waktu pesan seharusnya tidak memulihkan kuota';
  exception when program_limit_exceeded then null; end;

  delete from public.pesan_coach;
  assert (select count(*) from public.pesan_coach) = 0, 'riwayat seharusnya bisa dihapus pemiliknya';
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Setelah hapus riwayat');
    assert false, 'menghapus riwayat seharusnya tidak memulihkan kuota';
  exception when program_limit_exceeded then null; end;
end $$;

-- 3. Pencacah: dibaca sendiri, tidak bisa ditulis.
do $$
begin
  assert (select count(*) from public.pemakaian_coach_harian) = 1, 'pemilik seharusnya melihat pencacahnya';
  begin
    update public.pemakaian_coach_harian set jumlah = 0;
    assert false, 'pengguna seharusnya tidak bisa menolkan pencacahnya';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.pemakaian_coach_harian;
    assert false, 'pengguna seharusnya tidak bisa menghapus pencacahnya';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pemakaian_coach_harian (user_id, tanggal, jumlah)
    values ('eeee1111-0000-0000-0000-000000000011', current_date + 1, 0);
    assert false, 'pengguna seharusnya tidak bisa menulis pencacah';
  exception when insufficient_privilege then null; end;
  begin
    perform public.catat_pertanyaan_coach();
    assert false, 'fungsi pemicu DEFINER seharusnya tidak bisa dipanggil klien';
  exception when insufficient_privilege then null; end;
end $$;

-- 4. Pengguna B: kuota sendiri, tidak bisa membaca atau membocorkan kuota A.
set request.jwt.claim.sub = 'eeee2222-0000-0000-0000-000000000022';
do $$
declare v_p uuid; v_p_a uuid; v_kode text;
begin
  assert (select count(*) from public.pemakaian_coach_harian) = 0, 'B melihat pencacah A';
  assert (public.kuota_coach() ->> 'terpakai')::int = 0, 'kuota B terpengaruh A';

  insert into public.percakapan (user_id, judul)
  values ('eeee2222-0000-0000-0000-000000000022', 'Uji kuota B')
  returning id into v_p;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'eeee2222-0000-0000-0000-000000000022', 'pengguna', 'Halo');
  assert (public.kuota_coach() ->> 'terpakai')::int = 1, 'pertanyaan B tidak tercacah';

  -- Sisipan atas nama A (kuota A sudah habis) harus gagal karena BUKAN milik
  -- B — bukan karena "kuota habis", yang akan membocorkan pemakaian A.
  begin
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Menyamar');
    assert false, 'sisipan atas nama A seharusnya ditolak';
  exception when others then v_kode := sqlstate; end;
  assert v_kode <> '54000', 'penolakan membocorkan bahwa kuota A sudah habis';
end $$;

-- 5. Kuota kemarin tidak terbawa; kontrol negatif untuk hitungan per hari.
reset role;
update public.pemakaian_coach_harian
   set tanggal = tanggal - 1
 where user_id = 'eeee1111-0000-0000-0000-000000000011';
set request.jwt.claim.sub = 'eeee1111-0000-0000-0000-000000000011';
set role authenticated;
do $$
declare v_p uuid;
begin
  assert (public.kuota_coach() ->> 'terpakai')::int = 0, 'pemakaian kemarin terbawa ke hari ini';
  select id into v_p from public.percakapan limit 1;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
  values (v_p, 'eeee1111-0000-0000-0000-000000000011', 'pengguna', 'Hari baru');
  assert (public.kuota_coach() ->> 'sisa')::int = public.batas_pertanyaan_coach_harian() - 1,
    'hari baru seharusnya mulai dari kuota penuh';
end $$;

-- 6. Hak akses & tanpa sesi.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  assert not has_function_privilege('anon', 'public.kuota_coach()', 'execute'),
    'anon masih boleh membaca kuota';
  assert not has_function_privilege('authenticated', 'public.catat_pertanyaan_coach()', 'execute'),
    'fungsi pemicu DEFINER terbuka untuk authenticated';
  assert not has_table_privilege('authenticated', 'public.pemakaian_coach_harian', 'update'),
    'authenticated punya hak UPDATE atas pencacah';
  assert has_table_privilege('authenticated', 'public.pemakaian_coach_harian', 'select'),
    'authenticated seharusnya bisa membaca pencacahnya';
  begin
    perform public.kuota_coach();
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;
end $$;

select '✓ kuota coach: batas ditegakkan baris, tidak bisa dinolkan lewat riwayat, pencacah hanya-baca, tidak membocorkan kuota orang lain' as hasil;
