-- =============================================================================
-- Uji tabel hasil lab: aturan isi sama dengan form, setidaknya satu penanda,
-- tanpa tanggal di masa depan, dan tertutup per pemilik.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email) values
  ('1ab00001-0000-4000-8000-000000000001', 'lab-ani@contoh.test'),
  ('1ab00002-0000-4000-8000-000000000002', 'lab-budi@contoh.test')
on conflict do nothing;

set request.jwt.claim.sub = '1ab00001-0000-4000-8000-000000000001';
set role authenticated;

-- 1. Hasil lab + penanda dalam satu transaksi: diterima.
do $$
declare v_id uuid;
begin
  insert into public.lab_results (user_id, tanggal, nama, laboratorium)
  values ((select auth.uid()), date '2026-09-03', 'Profil lipid', 'Lab klinik') returning id into v_id;
  insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan, rujukan_min, rujukan_maks) values
    (v_id, (select auth.uid()), 1, 'Kolesterol LDL', 138, 'mg/dL', null, 130),
    (v_id, (select auth.uid()), 2, 'Kolesterol HDL', 48, 'mg/dL', 40, null),
    (v_id, (select auth.uid()), 3, 'TSH', 2.345, 'mIU/L', 0.4, 4);
  set constraints all immediate;
end $$;

-- 2. Aturan isi, masing-masing ditolak dengan aturannya sendiri.
do $$
declare
  v_id uuid := (select id from public.lab_results where nama = 'Profil lipid');
  v_kasus record;
  v_kode text;
  v_aturan text;
begin
  for v_kasus in
    select * from (values
      ('panel 61 huruf', format($q$insert into public.lab_results (user_id, tanggal, nama) values (auth.uid(), date '2026-01-01', %L)$q$, repeat('x', 61)), '23514', 'lab_results_nama_wajar'),
      ('panel berspasi di tepi', $q$insert into public.lab_results (user_id, tanggal, nama) values (auth.uid(), date '2026-01-01', ' Profil ')$q$, '23514', 'lab_results_nama_wajar'),
      ('laboratorium 81 huruf', format($q$insert into public.lab_results (user_id, tanggal, nama, laboratorium) values (auth.uid(), date '2026-01-01', 'Panel', %L)$q$, repeat('x', 81)), '23514', 'lab_results_laboratorium_wajar'),
      ('tanggal sebelum 2000', $q$insert into public.lab_results (user_id, tanggal, nama) values (auth.uid(), date '1999-12-31', 'Panel')$q$, '23514', 'lab_results_tanggal_awal'),
      ('tanggal besok', $q$insert into public.lab_results (user_id, tanggal, nama) values (auth.uid(), (now() at time zone 'Asia/Jakarta')::date + 1, 'Panel')$q$, '22007', null),
      ('nilai empat desimal', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'X', 5.1234, 'g')$q$, v_id), '23514', 'lab_result_markers_nilai_wajar'),
      ('nilai negatif', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'X', -1, 'g')$q$, v_id), '23514', 'lab_result_markers_nilai_wajar'),
      ('nilai sejuta', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'X', 1000000, 'g')$q$, v_id), '23514', 'lab_result_markers_nilai_wajar'),
      ('satuan kosong', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'X', 1, '')$q$, v_id), '23514', 'lab_result_markers_satuan_wajar'),
      ('satuan 21 huruf', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'X', 1, %L)$q$, v_id, repeat('u', 21)), '23514', 'lab_result_markers_satuan_wajar'),
      ('rentang terbalik', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan, rujukan_min, rujukan_maks) values (%L, auth.uid(), 9, 'X', 1, 'g', 5, 2)$q$, v_id), '23514', 'lab_result_markers_rentang_urut'),
      ('penanda ganda beda huruf', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 9, 'kolesterol ldl', 1, 'mg/dL')$q$, v_id), '23505', 'lab_result_markers_nama_unik'),
      ('urutan ganda', format($q$insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan) values (%L, auth.uid(), 1, 'Trigliserida', 1, 'mg/dL')$q$, v_id), '23505', 'lab_result_markers_urutan_unik')
    ) as t(nama, perintah, kode, aturan)
  loop
    v_kode := null; v_aturan := null;
    begin
      execute v_kasus.perintah;
      set constraints all immediate;
    exception when others then
      v_kode := sqlstate;
      get stacked diagnostics v_aturan = constraint_name;
    end;
    assert v_kode = v_kasus.kode, format('%s: kode %s, seharusnya %s', v_kasus.nama, coalesce(v_kode, 'DITERIMA'), v_kasus.kode);
    assert v_kasus.aturan is null or v_aturan = v_kasus.aturan, format('%s: ditolak %s, seharusnya %s', v_kasus.nama, v_aturan, v_kasus.aturan);
  end loop;
end $$;

-- 3. Setidaknya satu penanda: hasil lab kosong dan menghapus penanda terakhir ditolak.
do $$
declare v_kode text; v_id uuid := (select id from public.lab_results where nama = 'Profil lipid');
begin
  begin
    insert into public.lab_results (user_id, tanggal, nama) values ((select auth.uid()), date '2026-02-01', 'Tanpa penanda');
    set constraints all immediate;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23514', format('hasil lab tanpa penanda: kode %s', coalesce(v_kode, 'DITERIMA'));

  v_kode := null;
  begin
    delete from public.lab_result_markers where lab_result_id = v_id;
    set constraints all immediate;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23514', format('menghapus semua penanda: kode %s', coalesce(v_kode, 'DITERIMA'));
  assert (select count(*) from public.lab_result_markers where lab_result_id = v_id) = 3, 'penanda terhapus walau ditolak';

  -- Menghapus SATU penanda (masih ada yang lain) boleh.
  delete from public.lab_result_markers where lab_result_id = v_id and nama = 'TSH';
  set constraints all immediate;
end $$;

-- 4. Akun lain: tidak membaca, tidak mengubah, tidak menempelkan penanda.
reset role;
create temp table hasil_ani as select id from public.lab_results where nama = 'Profil lipid';
grant select on hasil_ani to authenticated;
set request.jwt.claim.sub = '1ab00002-0000-4000-8000-000000000002';
set role authenticated;
do $$
declare v_kode text; v_n int;
begin
  assert not exists (select 1 from public.lab_results), 'hasil lab akun lain terbaca';
  assert not exists (select 1 from public.lab_result_markers), 'penanda akun lain terbaca';
  update public.lab_results set nama = 'Diubah' where id = (select id from hasil_ani);
  get diagnostics v_n = row_count;
  assert v_n = 0, 'hasil lab akun lain terubah';
  begin
    insert into public.lab_result_markers (lab_result_id, user_id, urutan, nama, nilai, satuan)
    values ((select id from hasil_ani), auth.uid(), 5, 'Titipan', 1, 'g');
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '23503', format('penanda ke hasil lab akun lain: kode %s', coalesce(v_kode, 'DITERIMA'));
end $$;

-- 5. Menghapus hasil lab ikut menghapus penandanya.
set request.jwt.claim.sub = '1ab00001-0000-4000-8000-000000000001';
do $$
begin
  delete from public.lab_results where nama = 'Profil lipid';
  set constraints all immediate;
  assert not exists (select 1 from public.lab_result_markers), 'penanda tertinggal setelah hasil lab dihapus';
end $$;

-- 6. anon tidak menyentuh apa pun.
reset role;
reset request.jwt.claim.sub;
set role anon;
do $$
declare v_kode text;
begin
  begin
    perform 1 from public.lab_results limit 1;
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '42501', format('anon membaca hasil lab: kode %s', coalesce(v_kode, 'DITERIMA'));
end $$;
reset role;

delete from auth.users where id in ('1ab00001-0000-4000-8000-000000000001', '1ab00002-0000-4000-8000-000000000002');

select '✓ hasil lab: aturan isi = form, setidaknya satu penanda, tanpa tanggal depan, tertutup per pemilik' as hasil;
