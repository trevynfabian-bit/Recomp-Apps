-- =============================================================================
-- Uji tipe hari & target otomatis.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('55555555-5555-5555-5555-555555555555', 'eka@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = '55555555-5555-5555-5555-555555555555';

set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set role authenticated;

-- 1. View hanya menampilkan tipe hari milik sendiri, lengkap dengan targetnya.
do $$
declare n integer; k integer;
begin
  select count(*) into n from public.v_tipe_hari_aktif;
  assert n = 4, format('seharusnya 4 tipe hari, bukan %s', n);

  select count(*) into n from public.v_tipe_hari_aktif where target_kalori is null;
  assert n = 0, format('%s tipe hari tidak punya target untuk fase aktif', n);

  select target_kalori into k from public.v_tipe_hari_aktif where nama = 'Angkat Beban';
  assert k = 2850, format('target Lean Gain Angkat Beban = %s, seharusnya 2850', k);
end $$;

-- 2. Menyetel tipe hari ikut menyegarkan snapshot target.
do $$
declare v public.daily_logs; v_id uuid;
begin
  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Beban+Lari';
  select * into v from public.setel_tipe_hari(date '2026-09-22', v_id);
  assert v.day_type_id = v_id, 'tipe hari tidak tersimpan';
  assert v.day_type_override, 'override seharusnya true';
  assert v.target_kalori = 3100, format('snapshot target = %s, seharusnya 3100', v.target_kalori);
end $$;

-- 3. Mengganti tipe hari TIDAK menimpa berat, makro, atau catatan.
do $$
declare v public.daily_logs; v_id uuid;
begin
  update public.daily_logs
     set berat_pagi_kg = 74.6, sumber_berat = 'manual',
         kalori = 1980, protein_g = 128, catatan = 'Push day'
   where tanggal = date '2026-09-22';

  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Rest';
  select * into v from public.setel_tipe_hari(date '2026-09-22', v_id);

  assert v.target_kalori = 2450, format('target Rest = %s, seharusnya 2450', v.target_kalori);
  assert v.berat_pagi_kg = 74.6, format('berat tertimpa jadi %s', v.berat_pagi_kg);
  assert v.kalori = 1980,        format('kalori tertimpa jadi %s', v.kalori);
  assert v.catatan = 'Push day', format('catatan tertimpa jadi %s', v.catatan);
end $$;

-- 4. Kembali ke auto: override false, target tetap disegarkan.
do $$
declare v public.daily_logs; v_id uuid;
begin
  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Angkat Beban';
  select * into v from public.setel_tipe_hari(date '2026-09-22', v_id, false);
  assert not v.day_type_override, 'override seharusnya false';
  assert v.target_kalori = 2850, format('target = %s, seharusnya 2850', v.target_kalori);
end $$;

-- 5. ambil_target_harian memakai tipe hari yang tercatat hari itu.
do $$
declare r record;
begin
  select * into r from public.ambil_target_harian(date '2026-09-22');
  assert r.nama_tipe_hari = 'Angkat Beban', format('tipe hari = %s', r.nama_tipe_hari);
  assert r.target_kalori = 2850, format('target = %s', r.target_kalori);
  assert r.target_protein_g = 180, format('protein = %s', r.target_protein_g);
  assert r.batas_sat_fat_g = 25, format('sat fat = %s', r.batas_sat_fat_g);
  assert not r.override, 'override seharusnya false';
end $$;

-- 6. Hari yang belum punya tipe hari jatuh ke tipe hari bawaan (Rest).
do $$
declare r record;
begin
  select * into r from public.ambil_target_harian(date '2026-09-25');
  assert r.nama_tipe_hari = 'Rest', format('tipe hari bawaan = %s, seharusnya Rest', r.nama_tipe_hari);
  assert r.target_kalori = 2450, format('target bawaan = %s', r.target_kalori);
end $$;

-- 7. Ganti fase: hari yang SUDAH tercatat tidak ikut berubah, hari ini dan
--    sesudahnya disegarkan.
--
--    Ini kebalikan dari perilaku lama, dan perubahannya disengaja: budget
--    mingguan yang sedang berjalan tidak boleh berubah angkanya hanya karena
--    fase diganti di tengah pekan. Hari yang sudah dilihat pengguna adalah
--    catatan, bukan tampilan yang dihitung ulang.
do $$
declare r record; k integer; v_id uuid;
begin
  -- Hari lama dengan tipe & target Lean Gain, di luar jangkauan penyegaran.
  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-18', v_id);

  select * into r from public.ambil_target_harian(date '2026-09-18');
  assert r.fase = 'Lean Gain', format('fase 18 Sep = %s', r.fase);
  assert r.target_kalori = 2850, format('target 18 Sep = %s, seharusnya 2850', r.target_kalori);
  assert r.target_protein_g = 180,
    format('snapshot protein 18 Sep = %s, seharusnya 180', r.target_protein_g);

  -- Periode awal (dibuat saat profil lahir) dimundurkan ke 15 Sep: ia belum
  -- pernah berjalan sehari pun, jadi ia diganti, bukan ditutup.
  perform public.ganti_fase('Lean Gain', date '2026-09-15');
  perform public.ganti_fase('Cut', date '2026-09-22');

  -- Hari lama: tetap Lean Gain, tetap 2850.
  select * into r from public.ambil_target_harian(date '2026-09-18');
  assert r.fase = 'Lean Gain',
    format('fase 18 Sep berubah jadi %s setelah ganti fase', r.fase);
  assert r.target_kalori = 2850,
    format('target 18 Sep berubah jadi %s setelah ganti fase', r.target_kalori);

  -- Hari ini: ikut fase baru. Nilai yang diharapkan dibaca dari tabel target
  -- untuk (tipe hari yang tercatat × Cut), bukan diketik sebagai angka mati —
  -- supaya uji ini tetap benar kalau seed targetnya berubah.
  select * into r from public.ambil_target_harian(date '2026-09-22');
  assert r.fase = 'Cut', format('fase 22 Sep = %s, seharusnya Cut', r.fase);
  select t.target_kalori into k
    from public.day_type_targets t
   where t.day_type_id = r.day_type_id and t.fase = 'Cut';
  assert r.target_kalori = k,
    format('target 22 Sep = %s, seharusnya %s (%s, Cut)', r.target_kalori, k, r.nama_tipe_hari);
  assert r.target_kalori <> 2850,
    'target 22 Sep masih memakai angka Lean Gain setelah ganti fase';

  -- View tipe hari mengikuti fase aktif yang baru.
  select target_kalori into k from public.v_tipe_hari_aktif where nama = 'Angkat Beban';
  assert k = 2350, format('setelah pindah Cut, target view = %s, seharusnya 2350', k);
end $$;

-- 7b. Riwayat periode terbentuk & hanya satu yang berjalan.
do $$
declare n integer; r record;
begin
  select count(*) into n from public.fase_periode
   where user_id = '55555555-5555-5555-5555-555555555555';
  assert n = 2, format('%s periode, seharusnya 2 (Lean Gain lalu Cut)', n);

  select count(*) into n from public.fase_periode
   where user_id = '55555555-5555-5555-5555-555555555555' and selesai_tanggal is null;
  assert n = 1, format('%s periode berjalan, seharusnya tepat 1', n);

  select * into r from public.fase_periode
   where user_id = '55555555-5555-5555-5555-555555555555' and selesai_tanggal is not null;
  assert r.selesai_tanggal = date '2026-09-21',
    format('periode lama ditutup %s, seharusnya 2026-09-21', r.selesai_tanggal);
end $$;

-- 7c. Mengganti ke fase yang SAMA tidak memotong riwayat jadi dua.
do $$
declare n integer;
begin
  perform public.ganti_fase('Cut', date '2026-09-22');
  select count(*) into n from public.fase_periode
   where user_id = '55555555-5555-5555-5555-555555555555';
  assert n = 2, format('%s periode setelah ganti ke fase yang sama, seharusnya tetap 2', n);
end $$;

-- 8. Tipe hari milik orang lain ditolak.
do $$
declare v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = '11111111-1111-1111-1111-111111111111' limit 1;

  begin
    perform public.setel_tipe_hari(date '2026-09-22', v_id);
    raise exception 'GAGAL: tipe hari milik orang lain diterima';
  exception
    when foreign_key_violation then null;
  end;
end $$;

-- 9. Endpoint target per pengguna × tanggal: hanya milik pemanggil.
--    Pengguna lain yang meminta tanggal yang SAMA mendapat target miliknya
--    sendiri (tipe hari bawaannya), tidak pernah baris milik Eka.
reset role;
insert into auth.users (id, email) values ('55555555-0000-0000-0000-00000000000b', 'lain@contoh.test');
set request.jwt.claim.sub = '55555555-0000-0000-0000-00000000000b';
set role authenticated;
do $$
declare r record; n integer;
begin
  select count(*) into n from public.ambil_target_harian(date '2026-09-22');
  assert n = 1, format('%s baris untuk pengguna lain, seharusnya 1 (miliknya sendiri)', n);
  select * into r from public.ambil_target_harian(date '2026-09-22');
  assert r.day_type_id in (select id from public.day_types where user_id = '55555555-0000-0000-0000-00000000000b'),
    'pengguna lain menerima tipe hari yang bukan miliknya';
  assert r.override = false, 'pengguna lain mewarisi pilihan manual Eka';
end $$;

-- 9b. Tanggal kosong: tidak ada target yang dikarang.
do $$
declare n integer;
begin
  select count(*) into n from public.ambil_target_harian(null) where target_kalori is not null;
  assert n = 0, format('tanggal null mengembalikan %s target', n);
end $$;

-- 9b'. Kembaran jalur server juga tidak menjawab tanggal kosong.
reset role;
do $$
declare n integer;
begin
  select count(*) into n from public.target_harian_pengguna('55555555-5555-5555-5555-555555555555', null)
   where target_kalori is not null;
  assert n = 0, format('target_harian_pengguna tanggal null mengembalikan %s target', n);
  select count(*) into n from public.target_harian_pengguna(null, date '2026-09-22')
   where target_kalori is not null;
  assert n = 0, format('target_harian_pengguna pengguna null mengembalikan %s target', n);
end $$;
set role authenticated;

-- 9c. Tanpa sesi: tidak ada baris sama sekali.
set request.jwt.claim.sub = '';
do $$
declare n integer;
begin
  select count(*) into n from public.ambil_target_harian(date '2026-09-22');
  assert n = 0, format('tanpa sesi mengembalikan %s baris', n);
end $$;

-- 9d. anon tidak boleh memanggilnya.
reset role;
set role anon;
do $$
declare v_ditolak boolean := false;
begin
  begin
    perform * from public.ambil_target_harian(date '2026-09-22');
  exception when insufficient_privilege then v_ditolak := true;
  end;
  assert v_ditolak, 'anon bisa memanggil ambil_target_harian';
end $$;

reset role;

\echo 'Tipe hari & target OK — snapshot disegarkan, kolom lain utuh, hari lama kebal ganti fase'
