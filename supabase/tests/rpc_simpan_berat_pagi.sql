-- =============================================================================
-- Uji RPC simpan_berat_pagi.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('44444444-4444-4444-4444-444444444444', 'dewi@contoh.test');

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set role authenticated;

-- 1. Hari baru: baris dibuat dari nol.
do $$
declare v public.daily_logs;
begin
  select * into v from public.simpan_berat_pagi(date '2026-09-22', 74.6);
  assert v.berat_pagi_kg = 74.6, format('berat tersimpan %s', v.berat_pagi_kg);
  assert v.sumber_berat = 'manual', format('sumber %s', v.sumber_berat);
  assert v.tanggal = date '2026-09-22', 'tanggal salah';
  assert v.kalori = 0, 'baris baru seharusnya mulai dari 0 kalori';
end $$;

-- 2. Hari yang sudah berisi makro & catatan: HANYA berat yang boleh berubah.
do $$
declare v public.daily_logs;
begin
  update public.daily_logs
     set kalori = 1980, protein_g = 128, catatan = 'Tidur 7j20m', target_kalori = 2850
   where tanggal = date '2026-09-22';

  select * into v from public.simpan_berat_pagi(date '2026-09-22', 74.9);

  assert v.berat_pagi_kg = 74.9, format('berat tidak diperbarui: %s', v.berat_pagi_kg);
  assert v.kalori = 1980,        format('kalori ikut tertimpa jadi %s', v.kalori);
  assert v.protein_g = 128,      format('protein ikut tertimpa jadi %s', v.protein_g);
  assert v.catatan = 'Tidur 7j20m', format('catatan ikut tertimpa jadi %s', v.catatan);
  assert v.target_kalori = 2850, format('target ikut tertimpa jadi %s', v.target_kalori);
end $$;

-- 3. Sumber healthkit tercatat apa adanya.
do $$
declare v public.daily_logs;
begin
  select * into v from public.simpan_berat_pagi(date '2026-09-21', 75.2, 'healthkit');
  assert v.sumber_berat = 'healthkit', format('sumber %s', v.sumber_berat);
end $$;

-- 4. Nilai di luar rentang ditolak.
do $$
begin
  begin
    perform public.simpan_berat_pagi(date '2026-09-20', 745);
    raise exception 'GAGAL: berat 745 kg diterima';
  exception
    when numeric_value_out_of_range then null;
  end;

  begin
    perform public.simpan_berat_pagi(date '2026-09-20', null);
    raise exception 'GAGAL: berat kosong diterima';
  exception
    when null_value_not_allowed then null;
  end;
end $$;

-- 5. Tidak menghasilkan baris untuk pengguna lain.
do $$
declare n integer;
begin
  select count(*) into n from public.daily_logs;
  assert n = 2, format('seharusnya 2 baris milik Dewi, bukan %s', n);
end $$;

reset role;

-- 6. Tanpa sesi, RPC menolak.
set request.jwt.claim.sub = '';
set role authenticated;
do $$
begin
  begin
    perform public.simpan_berat_pagi(date '2026-09-22', 70);
    raise exception 'GAGAL: RPC jalan tanpa sesi';
  exception
    when invalid_authorization_specification then null;
  end;
end $$;
reset role;

\echo 'RPC simpan_berat_pagi OK — upsert aman, kolom lain tidak tertimpa, validasi & sesi ditegakkan'
