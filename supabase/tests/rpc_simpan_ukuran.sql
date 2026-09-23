-- =============================================================================
-- Uji RPC simpan & hapus pencatatan ukuran tubuh.
--
-- Aturan yang paling penting di sini satu: NULL berarti "jangan ubah". Kalau
-- ia dilanggar, pengguna yang pekan ini hanya mengukur pinggang akan MENGHAPUS
-- dada, leher, lengan, dan paha yang ia catat sebelumnya di tanggal itu — dan
-- kehilangan itu tidak menimbulkan satu pun pesan kesalahan.
--
-- Tanggalnya RELATIF terhadap hari ini, bukan tanggal tetap: fungsi ini menolak
-- tanggal masa depan menurut jam server, jadi uji bertanggal tetap akan lulus
-- hari ini dan gagal bulan depan tanpa ada yang berubah pada kodenya.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('aaaa6666-0000-0000-0000-000000000006', 'simpan-ukuran-a@contoh.test'),
  ('aaaa7777-0000-0000-0000-000000000007', 'simpan-ukuran-b@contoh.test');

set request.jwt.claim.sub = 'aaaa6666-0000-0000-0000-000000000006';
set role authenticated;

-- 1. Pencatatan baru dengan SATU bagian saja diterima.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  select * into v from public.simpan_ukuran(v_tgl, 85.4);
  assert v.pinggang_cm = 85.4, format('pinggang = %s', v.pinggang_cm);
  assert v.dada_cm is null, 'bagian yang tidak diukur seharusnya kosong, bukan nol';
  assert v.tanggal = v_tgl, 'tanggal tidak tersimpan apa adanya';
end $$;

-- 2. INTI: mengukur bagian LAIN di tanggal yang sama tidak menghapus yang tadi.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  select * into v from public.simpan_ukuran(v_tgl, null, 102.0);
  assert v.dada_cm = 102.0, format('dada = %s', v.dada_cm);
  assert v.pinggang_cm = 85.4,
    format('pinggang jadi %s — pencatatan sebelumnya terhapus oleh NULL', v.pinggang_cm);

  -- Dan menambah sisanya juga tidak menghapus dua yang sudah ada.
  select * into v from public.simpan_ukuran(
    v_tgl, null, null, 38.5, 34.2, 34.6, 57.0, 57.4);
  assert v.pinggang_cm = 85.4 and v.dada_cm = 102.0, 'dua ukuran pertama ikut hilang';
  assert v.leher_cm = 38.5 and v.paha_kanan_cm = 57.4, 'ukuran baru tidak tersimpan';
  assert num_nonnulls(v.pinggang_cm, v.dada_cm, v.leher_cm, v.lengan_kiri_cm,
                      v.lengan_kanan_cm, v.paha_kiri_cm, v.paha_kanan_cm) = 7,
    'seharusnya tujuh bagian terisi';
end $$;

-- 3. Memperbaiki salah ketik: kirim angka yang benar, dan HANYA itu yang berubah.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  select * into v from public.simpan_ukuran(v_tgl, 84.9);
  assert v.pinggang_cm = 84.9, format('pinggang = %s', v.pinggang_cm);
  assert v.dada_cm = 102.0 and v.leher_cm = 38.5, 'bagian lain ikut berubah';
end $$;

-- 4. Pencatatan BARU tanpa satu pun ukuran ditolak dengan pesan yang terbaca.
do $$
declare v_gagal boolean := false; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 13;
begin
  begin
    perform public.simpan_ukuran(v_tgl, null, null, null, null, null, null, null, 'lupa meteran');
  exception when null_value_not_allowed then
    v_gagal := true;
  end;
  assert v_gagal, 'pencatatan baru tanpa ukuran seharusnya ditolak';
  assert not exists (select 1 from public.body_measurements where tanggal = v_tgl),
    'barisnya tetap dibuat walau ditolak';
end $$;

-- 5. Semua NULL pada tanggal yang SUDAH ada adalah no-op, bukan kesalahan —
--    dan bukan penghapusan.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  select * into v from public.simpan_ukuran(v_tgl);
  assert v.pinggang_cm = 84.9 and v.dada_cm = 102.0 and v.paha_kanan_cm = 57.4,
    'panggilan tanpa nilai seharusnya tidak mengubah apa pun';
end $$;

-- 6. Tanggal masa depan ditolak: jam perangkat bisa salah, dan titik bertanggal
--    depan tidak pernah bisa dikoreksi oleh pencatatan berikutnya.
do $$
declare v_gagal boolean := false; v_besok date := (now() at time zone 'Asia/Jakarta')::date + 1;
begin
  begin
    perform public.simpan_ukuran(v_besok, 85.0);
  exception when invalid_datetime_format then
    v_gagal := true;
  end;
  assert v_gagal, 'tanggal besok seharusnya ditolak';
  assert not exists (select 1 from public.body_measurements where tanggal = v_besok),
    'pencatatan bertanggal depan tetap tersimpan';
end $$;

-- 7. Tanpa tanggal → hari ini menurut SERVER, bukan menurut perangkat.
do $$
declare v public.body_measurements;
begin
  select * into v from public.simpan_ukuran(null, 85.1);
  assert v.tanggal = (now() at time zone 'Asia/Jakarta')::date,
    format('tanggal bawaan = %s, seharusnya hari ini menurut server', v.tanggal);
end $$;

-- 8. Rentang per bagian: pesannya menyebut BAGIAN TUBUH, bukan nama constraint.
do $$
declare v_gagal boolean; v_pesan text; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 21;
begin
  v_gagal := false;
  begin
    perform public.simpan_ukuran(v_tgl, 8.5);            -- 85 → 8,5
  exception when numeric_value_out_of_range then
    v_gagal := true;
    v_pesan := sqlerrm;
  end;
  assert v_gagal, 'pinggang 8,5 cm seharusnya ditolak';
  assert v_pesan like 'Pinggang%', format('pesannya "%s" tidak menyebut bagian tubuh', v_pesan);

  -- 85 masuk akal untuk pinggang, tidak untuk leher.
  v_gagal := false;
  begin
    perform public.simpan_ukuran(v_tgl, null, null, 85);
  exception when numeric_value_out_of_range then
    v_gagal := true;
    v_pesan := sqlerrm;
  end;
  assert v_gagal, 'leher 85 cm seharusnya ditolak';
  assert v_pesan like 'Leher%', format('pesannya "%s" tidak menyebut leher', v_pesan);

  -- Tidak ada baris yang terbentuk dari percobaan yang ditolak.
  assert not exists (select 1 from public.body_measurements where tanggal = v_tgl),
    'percobaan yang ditolak tetap membuat baris';
end $$;

-- 9. Dibulatkan ke 0,1 cm — ketelitian meteran kain, bukan lebih.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 21;
begin
  select * into v from public.simpan_ukuran(v_tgl, 84.86);
  assert v.pinggang_cm = 84.9, format('pinggang = %s, seharusnya 84,9', v.pinggang_cm);
end $$;

-- 10. Catatan: null jangan ubah, teks mengganti, string KOSONG mengosongkan.
do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 21;
begin
  select * into v from public.simpan_ukuran(v_tgl, null, null, null, null, null, null, null,
                                            'Pagi sebelum makan');
  assert v.catatan = 'Pagi sebelum makan', format('catatan = %s', v.catatan);

  select * into v from public.simpan_ukuran(v_tgl, 85.0);
  assert v.catatan = 'Pagi sebelum makan', 'catatan terhapus oleh panggilan tanpa catatan';

  select * into v from public.simpan_ukuran(v_tgl, null, null, null, null, null, null, null, '');
  assert v.catatan is null, format('catatan = %s, seharusnya kosong', v.catatan);

  -- Catatan kepanjangan ditolak.
  declare v_gagal boolean := false;
  begin
    begin
      perform public.simpan_ukuran(v_tgl, null, null, null, null, null, null, null,
                                   repeat('x', 501));
    exception when check_violation then v_gagal := true; end;
    assert v_gagal, 'catatan 501 karakter seharusnya ditolak';
  end;
end $$;

-- 11. hapus_ukuran: true sekali, false berikutnya.
do $$
declare v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 21;
begin
  assert public.hapus_ukuran(v_tgl), 'penghapusan pertama seharusnya true';
  assert not public.hapus_ukuran(v_tgl), 'penghapusan kedua seharusnya false';
  assert not exists (select 1 from public.body_measurements where tanggal = v_tgl),
    'barisnya masih ada setelah dihapus';
end $$;

-- 12. Isolasi: menyimpan & menghapus tidak pernah menyentuh milik orang lain.
reset role;
set request.jwt.claim.sub = 'aaaa7777-0000-0000-0000-000000000007';
set role authenticated;

do $$
declare v public.body_measurements; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  -- Tanggal yang SAMA dengan pencatatan pengguna A.
  select * into v from public.simpan_ukuran(v_tgl, 78.2);
  assert v.pinggang_cm = 78.2, 'pengguna B seharusnya punya barisnya sendiri';
  assert v.dada_cm is null, 'pengguna B mewarisi ukuran pengguna A';

  -- Menghapus tanggal itu hanya menghapus miliknya sendiri.
  assert public.hapus_ukuran(v_tgl), 'pengguna B seharusnya bisa menghapus miliknya';
  assert (select count(*) from public.body_measurements) = 0,
    'pengguna B masih melihat pencatatan setelah menghapus miliknya';
end $$;

do $$
declare v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 14;
begin
  reset role;
  assert (select pinggang_cm from public.body_measurements
           where user_id = 'aaaa6666-0000-0000-0000-000000000006' and tanggal = v_tgl) = 84.9,
    'pencatatan pengguna A ikut terhapus oleh pengguna B';
end $$;

-- 13. Tanpa sesi & peran anon.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.simpan_ukuran(null, 85.0);
    assert false, 'menyimpan tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;
  begin
    perform public.hapus_ukuran((now() at time zone 'Asia/Jakarta')::date);
    assert false, 'menghapus tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;

  assert not has_function_privilege('anon',
    'public.simpan_ukuran(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)',
    'execute'),
    'anon masih boleh menyimpan ukuran';
  assert not has_function_privilege('anon', 'public.hapus_ukuran(date)', 'execute'),
    'anon masih boleh menghapus ukuran';
  assert has_function_privilege('authenticated', 'public.hapus_ukuran(date)', 'execute'),
    'authenticated seharusnya boleh menghapus ukurannya sendiri';
end $$;

select '✓ simpan_ukuran: NULL tidak menghapus bagian lain, tanggal depan ditolak, pesan menyebut bagian tubuh, isolasi terjaga' as hasil;
