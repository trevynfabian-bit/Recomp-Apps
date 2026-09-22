-- =============================================================================
-- Uji catatan makan & total makro.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('66666666-6666-6666-6666-666666666666', 'fajar@contoh.test');

set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
set role authenticated;

-- 1. Entri pertama membuat baris hari dan mengisi total.
do $$
declare v public.food_logs; l public.daily_logs;
begin
  select * into v from public.catat_makanan(
    date '2026-09-22', 'Oat + whey + pisang', 520, 42, 9, 68, 3);
  assert v.nama_makanan = 'Oat + whey + pisang', 'nama salah';
  assert v.sumber = 'manual', 'sumber bawaan seharusnya manual';

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.kalori = 520,    format('total kalori %s, seharusnya 520', l.kalori);
  assert l.protein_g = 42,  format('total protein %s', l.protein_g);
  assert l.karbo_g = 68,    format('total karbo %s', l.karbo_g);
end $$;

-- 2. Entri berikutnya menambah, bukan menimpa.
do $$
declare l public.daily_logs;
begin
  perform public.catat_makanan(date '2026-09-22', 'Ayam bakar + nasi merah', 760, 54, 22, 82, 6);
  perform public.catat_makanan(date '2026-09-22', 'Nasi + ayam geprek', 720, 42, 28, 76, 8, 'foto_ai');

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.kalori = 2000,   format('total kalori %s, seharusnya 2000', l.kalori);
  assert l.protein_g = 138, format('total protein %s, seharusnya 138', l.protein_g);
  assert l.lemak_g = 59,    format('total lemak %s, seharusnya 59', l.lemak_g);
  assert l.sat_fat_g = 17,  format('total sat fat %s, seharusnya 17', l.sat_fat_g);
end $$;

-- 3. Menghapus entri mengurangi total (trigger menangani DELETE).
do $$
declare l public.daily_logs;
begin
  delete from public.food_logs where nama_makanan = 'Ayam bakar + nasi merah';

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.kalori = 1240,   format('setelah hapus, kalori %s, seharusnya 1240', l.kalori);
  assert l.protein_g = 84,  format('setelah hapus, protein %s, seharusnya 84', l.protein_g);
end $$;

-- 4. Mengubah entri menghitung ulang total (trigger menangani UPDATE).
do $$
declare l public.daily_logs;
begin
  update public.food_logs set kalori = 600 where nama_makanan = 'Oat + whey + pisang';

  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.kalori = 1320, format('setelah ubah, kalori %s, seharusnya 1320', l.kalori);
end $$;

-- 5. Memindah entri ke hari lain memperbarui KEDUA hari.
do $$
declare a public.daily_logs; b public.daily_logs; v_id uuid;
begin
  v_id := public.baris_hari(date '2026-09-23');
  update public.food_logs set daily_log_id = v_id where nama_makanan = 'Nasi + ayam geprek';

  select * into a from public.daily_logs where tanggal = date '2026-09-22';
  select * into b from public.daily_logs where tanggal = date '2026-09-23';
  assert a.kalori = 600, format('hari asal %s, seharusnya 600', a.kalori);
  assert b.kalori = 720, format('hari tujuan %s, seharusnya 720', b.kalori);
end $$;

-- 6. Menghapus entri terakhir mengembalikan total ke nol, bukan NULL.
do $$
declare l public.daily_logs;
begin
  delete from public.food_logs where daily_log_id = (
    select id from public.daily_logs where tanggal = date '2026-09-23');

  select * into l from public.daily_logs where tanggal = date '2026-09-23';
  assert l.kalori = 0,    format('kalori %s, seharusnya 0', l.kalori);
  assert l.protein_g = 0, format('protein %s, seharusnya 0', l.protein_g);
end $$;

-- 7. Nama makanan kosong ditolak.
do $$
begin
  begin
    perform public.catat_makanan(date '2026-09-22', '   ', 100);
    raise exception 'GAGAL: nama kosong diterima';
  exception
    when null_value_not_allowed then null;
  end;
end $$;

-- 8. Catatan harian: tersimpan, lalu dikosongkan jadi NULL.
do $$
declare l public.daily_logs;
begin
  select * into l from public.simpan_catatan_harian(date '2026-09-22', '  Tidur 7j20m, energi bagus.  ');
  assert l.catatan = 'Tidur 7j20m, energi bagus.', format('catatan = [%s]', l.catatan);

  select * into l from public.simpan_catatan_harian(date '2026-09-22', '   ');
  assert l.catatan is null, format('catatan spasi seharusnya NULL, bukan [%s]', l.catatan);
end $$;

-- 9. Menyimpan catatan TIDAK mengganggu total makro.
do $$
declare l public.daily_logs;
begin
  select * into l from public.daily_logs where tanggal = date '2026-09-22';
  assert l.kalori = 600, format('kalori berubah jadi %s setelah simpan catatan', l.kalori);
end $$;

-- 10. Ringkasan harian menghitung entri estimasi.
do $$
declare r record;
begin
  perform public.catat_makanan(date '2026-09-22', 'Salmon (foto)', 540, 38, 24, 42, 5, 'foto_ai');

  select * into r from public.ringkasan_harian(date '2026-09-22');
  assert r.kalori = 1140,        format('ringkasan kalori %s, seharusnya 1140', r.kalori);
  assert r.jumlah_entri = 2,     format('jumlah entri %s, seharusnya 2', r.jumlah_entri);
  assert r.jumlah_estimasi = 1,  format('jumlah estimasi %s, seharusnya 1', r.jumlah_estimasi);
  assert r.nama_tipe_hari is not null, 'tipe hari kosong di ringkasan';
  assert r.target_kalori is not null,  'target kosong di ringkasan';
end $$;

-- 11. Entri milik pengguna lain tidak terlihat maupun terhitung.
do $$
declare n integer;
begin
  select count(*) into n from public.food_logs;
  assert n = 2, format('Fajar seharusnya melihat 2 entri miliknya, bukan %s', n);
end $$;

reset role;

\echo 'Catatan makan & total makro OK — total dijaga trigger di insert/update/delete/pindah hari'
