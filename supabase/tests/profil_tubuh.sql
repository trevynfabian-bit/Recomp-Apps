-- =============================================================================
-- Uji pengerasan kolom profil tubuh.
--
-- Tinggi badan masuk ke DUA rumus sekaligus — Mifflin-St Jeor (TDEE) dan Navy
-- (body fat) — dan keduanya tetap memberi angka yang kelihatan sah untuk tinggi
-- 17 cm. Salah ketik satu kali akan merusak estimasi berpekan-pekan tanpa satu
-- pun pesan kesalahan, jadi penjaganya harus ada di baris, bukan di layar.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('aaaa4444-0000-0000-0000-000000000004', 'profil-a@contoh.test'),
  ('aaaa5555-0000-0000-0000-000000000005', 'profil-b@contoh.test');

set request.jwt.claim.sub = 'aaaa4444-0000-0000-0000-000000000004';
set role authenticated;

-- 1. Nilai yang wajar diterima, termasuk tepat di batasnya.
do $$
begin
  update public.profiles set tinggi_cm = 178, jenis_kelamin = 'pria', satuan = 'metrik';
  assert (select tinggi_cm from public.profiles) = 178, 'tinggi 178 seharusnya diterima';

  update public.profiles set tinggi_cm = 100;
  update public.profiles set tinggi_cm = 250;
  assert (select tinggi_cm from public.profiles) = 250, 'tepat di batas atas seharusnya diterima';

  update public.profiles set tinggi_cm = 178;
end $$;

-- 2. Tinggi yang mustahil ditolak — dua bentuk salah ketik yang paling lazim.
do $$
declare v_gagal boolean;
begin
  v_gagal := false;
  begin
    update public.profiles set tinggi_cm = 17;   -- 178 → 17
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'tinggi 17 cm seharusnya ditolak';

  v_gagal := false;
  begin
    update public.profiles set tinggi_cm = 1780; -- 178 → 1780
  exception when check_violation or numeric_value_out_of_range then v_gagal := true; end;
  assert v_gagal, 'tinggi 1780 cm seharusnya ditolak';

  assert (select tinggi_cm from public.profiles) = 178,
    'tinggi berubah walaupun pembaruannya ditolak';
end $$;

-- 3. Tinggi boleh DIKOSONGKAN: pengguna baru belum tentu mengisinya, dan
--    estimasi memang dirancang berjalan dengan metode yang tersedia saja.
do $$
begin
  update public.profiles set tinggi_cm = null;
  assert (select tinggi_cm from public.profiles) is null, 'tinggi seharusnya bisa dikosongkan';
  update public.profiles set tinggi_cm = 178;
end $$;

-- 4. Batas pinggang memakai rentang yang SAMA dengan kolom pinggang di
--    body_measurements — dua angka yang dibandingkan tidak boleh punya batas
--    yang berbeda.
do $$
declare v_gagal boolean;
begin
  update public.profiles set batas_pinggang_cm = 88;
  assert (select batas_pinggang_cm from public.profiles) = 88, 'batas 88 cm seharusnya diterima';

  v_gagal := false;
  begin
    update public.profiles set batas_pinggang_cm = 9;
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'batas pinggang 9 cm seharusnya ditolak';

  -- Batas 45 cm ditolak profil; nilai pinggang 45 cm juga ditolak
  -- body_measurements. Keduanya harus sepakat.
  v_gagal := false;
  begin
    update public.profiles set batas_pinggang_cm = 45;
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'batas pinggang 45 cm seharusnya ditolak';

  v_gagal := false;
  begin
    insert into public.body_measurements (user_id, tanggal, pinggang_cm)
    values ('aaaa4444-0000-0000-0000-000000000004', date '2026-09-07', 45);
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'pinggang 45 cm di body_measurements seharusnya ikut ditolak';
end $$;

-- 5. Satuan hanya metrik atau imperial, dan TIDAK boleh kosong: kolomnya
--    menentukan cara seluruh angka dibaca.
do $$
declare v_gagal boolean;
begin
  update public.profiles set satuan = 'imperial';
  assert (select satuan from public.profiles) = 'imperial', 'imperial seharusnya diterima';

  v_gagal := false;
  begin
    update public.profiles set satuan = 'stone';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'satuan "stone" seharusnya ditolak';

  v_gagal := false;
  begin
    update public.profiles set satuan = null;
  exception when not_null_violation then v_gagal := true; end;
  assert v_gagal, 'satuan kosong seharusnya ditolak';

  update public.profiles set satuan = 'metrik';
end $$;

-- 6. Jenis kelamin: dua nilai yang dipakai rumus Navy, atau kosong.
do $$
declare v_gagal boolean := false;
begin
  update public.profiles set jenis_kelamin = 'wanita';
  update public.profiles set jenis_kelamin = null;
  begin
    update public.profiles set jenis_kelamin = 'Pria';  -- huruf besar
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jenis kelamin "Pria" seharusnya ditolak — nilainya peka huruf';
  update public.profiles set jenis_kelamin = 'pria';
end $$;

-- 7. Satuan tampilan TIDAK mengubah apa pun yang tersimpan. Kolom tinggi tetap
--    sentimeter walau satuannya imperial; kalau tidak, setiap rumus harus tahu
--    satuan pemiliknya.
do $$
declare v_sebelum numeric; v_sesudah numeric;
begin
  select tinggi_cm into v_sebelum from public.profiles;
  update public.profiles set satuan = 'imperial';
  select tinggi_cm into v_sesudah from public.profiles;
  assert v_sebelum = v_sesudah,
    format('tinggi berubah dari %s ke %s hanya karena satuan tampilan', v_sebelum, v_sesudah);
  update public.profiles set satuan = 'metrik';
end $$;

-- 8. Isolasi: profil orang lain tidak terbaca dan tidak bisa diubah.
reset role;
set request.jwt.claim.sub = 'aaaa5555-0000-0000-0000-000000000005';
set role authenticated;

do $$
declare n integer;
begin
  select count(*) into n from public.profiles;
  assert n = 1, format('pengguna B melihat %s profil, seharusnya 1 (miliknya)', n);
  assert (select tinggi_cm from public.profiles) is null,
    'pengguna B melihat tinggi milik pengguna A';

  -- UPDATE tanpa WHERE hanya menyentuh barisnya sendiri; kebijakan RLS yang
  -- membatasinya, bukan kehati-hatian pemanggil.
  update public.profiles set tinggi_cm = 165;
  assert (select count(*) from public.profiles where tinggi_cm = 165) = 1,
    'pembaruan pengguna B seharusnya menyentuh satu baris';
end $$;

do $$
begin
  reset role;
  assert (select tinggi_cm from public.profiles
           where user_id = 'aaaa4444-0000-0000-0000-000000000004') = 178,
    'tinggi pengguna A ikut berubah saat pengguna B memperbarui profilnya';
end $$;

-- 9. Peran anon tidak boleh menyentuh profil.
do $$
begin
  assert not has_table_privilege('anon', 'public.profiles', 'select'),
    'anon masih boleh membaca profil';
  assert not has_table_privilege('anon', 'public.profiles', 'update'),
    'anon masih boleh mengubah profil';
end $$;

select '✓ profil tubuh: tinggi & batas pinggang dijaga baris, satuan hanya tampilan, isolasi terjaga' as hasil;
