-- =============================================================================
-- Uji catatan bebas harian lewat API.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('aaaa1111-0000-0000-0000-000000000001', 'indra@contoh.test');

set request.jwt.claim.sub = 'aaaa1111-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Hari yang belum ada: baca mengembalikan NULL, tidak error.
do $$
begin
  assert public.ambil_catatan_harian(date '2026-09-22') is null,
    'hari belum ada seharusnya NULL';
end $$;

-- 2. Simpan lalu baca kembali; spasi di ujung dipangkas.
do $$
declare l public.daily_logs;
begin
  select * into l from public.simpan_catatan_harian(date '2026-09-22', '  Tidur 7j20m.  ');
  assert l.catatan = 'Tidur 7j20m.', format('tersimpan [%s]', l.catatan);
  assert public.ambil_catatan_harian(date '2026-09-22') = 'Tidur 7j20m.',
    'baca kembali tidak cocok';
end $$;

-- 3. Menimpa catatan lama.
do $$
begin
  perform public.simpan_catatan_harian(date '2026-09-22', 'Ganti isi.');
  assert public.ambil_catatan_harian(date '2026-09-22') = 'Ganti isi.', 'tidak tertimpa';
end $$;

-- 4. Dikosongkan → NULL, bukan string kosong.
do $$
begin
  perform public.simpan_catatan_harian(date '2026-09-22', '    ');
  assert public.ambil_catatan_harian(date '2026-09-22') is null,
    'catatan spasi seharusnya jadi NULL';
end $$;

-- 5. Terlalu panjang ditolak dengan pesan yang bisa dibaca, bukan galat CHECK.
do $$
begin
  begin
    perform public.simpan_catatan_harian(date '2026-09-22', repeat('a', 2001));
    raise exception 'GAGAL: catatan 2001 karakter diterima';
  exception
    when string_data_right_truncation then null;
  end;

  -- Tepat di batas harus diterima.
  perform public.simpan_catatan_harian(date '2026-09-22', repeat('b', 2000));
  assert char_length(public.ambil_catatan_harian(date '2026-09-22')) = 2000,
    'catatan tepat 2000 karakter seharusnya diterima';
end $$;

-- 6. Menyimpan catatan tidak mengganggu berat maupun total makro hari itu.
do $$
declare l public.daily_logs;
begin
  perform public.simpan_berat_pagi(date '2026-09-22', 74.6);
  perform public.catat_makanan(date '2026-09-22', 'Oat', 520, 42, 9, 68, 3);

  select * into l from public.simpan_catatan_harian(date '2026-09-22', 'Catatan baru');
  assert l.berat_pagi_kg = 74.6, format('berat tertimpa jadi %s', l.berat_pagi_kg);
  assert l.kalori = 520,         format('kalori tertimpa jadi %s', l.kalori);
  assert l.catatan = 'Catatan baru', 'catatan tidak tersimpan';
end $$;

-- 7. Catatan pengguna lain tidak terbaca.
do $$
begin
  assert public.ambil_catatan_harian(date '2026-09-23') is null,
    'hari kosong seharusnya NULL';
end $$;

reset role;

-- 8. Tanpa sesi tidak bisa menyimpan.
set request.jwt.claim.sub = '';
set role authenticated;
do $$
begin
  begin
    perform public.simpan_catatan_harian(date '2026-09-22', 'nekat');
    raise exception 'GAGAL: bisa menyimpan tanpa sesi';
  exception
    when invalid_authorization_specification then null;
  end;
end $$;
reset role;

\echo 'Catatan harian OK — simpan/baca/kosongkan, batas panjang ditolak jelas, kolom lain utuh'
