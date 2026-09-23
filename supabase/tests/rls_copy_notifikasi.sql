-- =============================================================================
-- Uji konfigurasi copy notifikasi: nada netral & tanpa angka dijaga database.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

-- 1. pelanggaran_nada: kata sebagai AWAL kata, huruf besar-kecil, tanda seru.
do $$
begin
  assert public.pelanggaran_nada('Kalori melebihi target!') = array['melebihi', '!'], 'melebihi + !';
  assert public.pelanggaran_nada('JANGAN lupa timbang') = array['jangan'], 'huruf besar tetap tertangkap';
  assert public.pelanggaran_nada('Asupan berlebihan') = array['berlebih'], 'awalan kata tertangkap (berlebih-an)';
  assert public.pelanggaran_nada('(gagal)') = array['gagal'], 'didahului tanda baca tetap tertangkap';
  assert public.pelanggaran_nada('Timbang pagi, kalau sempat.') = '{}', 'kalimat netral lolos';
  -- Bukan awal kata: tidak dihitung (menghindari tuduhan palsu).
  assert public.pelanggaran_nada('pejangan') = '{}', 'kata yang hanya MEMUAT "jangan" tidak dihitung';
  assert public.pelanggaran_nada(null) = '{}', 'null = netral (tidak ada teks)';
end $$;

-- 2. Awal: lima jenis, semuanya lolos aturan.
do $$
begin
  assert (select count(*) from public.copy_notifikasi) = 5, 'lima jenis notifikasi seharusnya ada';
  assert not exists (select 1 from public.copy_notifikasi
                      where cardinality(public.pelanggaran_nada(judul || ' ' || isi)) > 0),
    'copy awal seharusnya netral';
end $$;

-- 3. Pengelola (service role) mengubah kalimat: yang menegur/berangka ditolak.
set role service_role;
do $$
declare
  kasus text[] := array[
    'Berat Anda melebihi target',
    'Jangan lupa timbang',
    'Timbang sekarang!',
    'Kemarin 74,5 kg — timbang lagi pagi ini',
    'Asupan terlalu tinggi kemarin'
  ];
  k text;
  v_gagal boolean;
  v_lama timestamptz;
begin
  foreach k in array kasus loop
    v_gagal := false;
    begin
      update public.copy_notifikasi set isi = k where jenis = 'timbang';
    exception when check_violation then v_gagal := true; end;
    assert v_gagal, format('kalimat "%s" seharusnya ditolak', k);
  end loop;

  v_gagal := false;
  begin
    update public.copy_notifikasi set judul = repeat('a', 41) where jenis = 'timbang';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'judul lebih dari 40 karakter seharusnya ditolak (terpotong di layar kunci)';

  select diperbarui_pada into v_lama from public.copy_notifikasi where jenis = 'timbang';
  update public.copy_notifikasi set isi = 'Setelah bangun, sebelum sarapan. Satu ketukan untuk mencatat.' where jenis = 'timbang';
  assert (select diperbarui_pada from public.copy_notifikasi where jenis = 'timbang') >= v_lama,
    'perubahan yang netral seharusnya diterima';

  -- Kembalikan ke kalimat katalog supaya uji paritas lain tetap bermakna.
  update public.copy_notifikasi
     set isi = 'Setelah bangun, sebelum sarapan — kalau sempat. Satu ketukan untuk mencatat.'
   where jenis = 'timbang';
end $$;

-- 4. Pengguna membaca, tidak mengubah; anon tidak membaca.
reset role;
insert into auth.users (id, email) values ('c9c9c9c9-0000-0000-0000-000000000001', 'copy@contoh.test');
set request.jwt.claim.sub = 'c9c9c9c9-0000-0000-0000-000000000001';
set role authenticated;
do $$
declare v_gagal boolean := false;
begin
  assert (select count(*) from public.copy_notifikasi) = 5, 'pengguna login seharusnya membaca kelima copy';
  begin
    update public.copy_notifikasi set isi = 'x';
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'pengguna seharusnya tidak bisa mengubah copy';
end $$;

reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
declare v_gagal boolean := false;
begin
  begin
    perform 1 from public.copy_notifikasi;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak membaca copy';
end $$;

reset role;
delete from auth.users where id = 'c9c9c9c9-0000-0000-0000-000000000001';
