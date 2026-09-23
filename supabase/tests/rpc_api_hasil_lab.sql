-- =============================================================================
-- Uji service CRUD hasil lab: muat_hasil_lab, simpan_hasil_lab, hapus_hasil_lab.
-- Satu transaksi (tidak pernah setengah), teks dirapikan seperti form, pesan
-- terbaca, konkurensi optimistis, dan hanya milik sendiri.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email) values
  ('1ab10001-0000-4000-8000-000000000001', 'api-lab-ani@contoh.test'),
  ('1ab10002-0000-4000-8000-000000000002', 'api-lab-budi@contoh.test')
on conflict do nothing;

set request.jwt.claim.sub = '1ab10001-0000-4000-8000-000000000001';
set role authenticated;

create temp table id_lab (nama text primary key, id uuid, diperbarui_pada text);
grant select, insert, update on id_lab to authenticated;

-- 1. Tambah: teks dirapikan, laboratorium kosong → NULL, penanda urut seperti diisi.
do $$
declare h jsonb;
begin
  h := public.simpan_hasil_lab(jsonb_build_object(
    'nama', '  Profil lipid ', 'tanggal', '2026-09-03', 'laboratorium', '   ',
    'penanda', jsonb_build_array(
      jsonb_build_object('nama', ' Kolesterol LDL ', 'nilai', 138, 'satuan', ' mg/dL ', 'rujukanMin', null, 'rujukanMaks', 130),
      jsonb_build_object('nama', 'TSH', 'nilai', 2.345, 'satuan', 'mIU/L', 'rujukanMin', 0.4, 'rujukanMaks', 4))));
  assert h->>'nama' = 'Profil lipid' and h->'laboratorium' = 'null'::jsonb, format('perapian: %s', h);
  assert jsonb_array_length(h->'penanda') = 2 and h->'penanda'->0->>'nama' = 'Kolesterol LDL' and h->'penanda'->0->>'satuan' = 'mg/dL',
    format('penanda: %s', h->'penanda');
  assert (h->'penanda'->1->>'nilai')::numeric = 2.345, 'nilai apa adanya';
  insert into id_lab values ('lipid', (h->>'id')::uuid, h->>'diperbarui_pada');
  assert jsonb_array_length(public.muat_hasil_lab()) = 1, 'muat memuat hasil yang baru ditambah';
end $$;

-- 2. Ubah: penanda diganti seluruhnya; waktu berubah; waktu basi ditolak.
do $$
declare
  v_id uuid := (select id from id_lab where nama = 'lipid');
  v_waktu text := (select diperbarui_pada from id_lab where nama = 'lipid');
  h jsonb;
  v_kode text;
begin
  perform pg_sleep(0.01);
  h := public.simpan_hasil_lab(jsonb_build_object(
    'nama', 'Profil lipid', 'tanggal', '2026-09-03', 'laboratorium', 'Lab klinik', 'diperbarui_pada', v_waktu,
    'penanda', jsonb_build_array(jsonb_build_object('nama', 'Kolesterol HDL', 'nilai', 48, 'satuan', 'mg/dL', 'rujukanMin', 40))), v_id);
  assert h->>'laboratorium' = 'Lab klinik' and jsonb_array_length(h->'penanda') = 1 and h->'penanda'->0->>'nama' = 'Kolesterol HDL',
    format('ubah: %s', h);
  assert (select count(*) from public.lab_result_markers where lab_result_id = v_id) = 1, 'penanda lama tertinggal';
  assert (h->>'diperbarui_pada')::timestamptz > v_waktu::timestamptz, 'waktu diperbarui tidak berubah';

  -- Mengirim waktu lama (dari sebelum ubahan di atas): ditolak, tidak ada yang berubah.
  begin
    perform public.simpan_hasil_lab(jsonb_build_object(
      'nama', 'Tertimpa', 'tanggal', '2026-09-03', 'diperbarui_pada', v_waktu,
      'penanda', jsonb_build_array(jsonb_build_object('nama', 'X', 'nilai', 1, 'satuan', 'g'))), v_id);
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '40001', format('waktu basi: kode %s', coalesce(v_kode, 'DITERIMA'));
  assert (select nama from public.lab_results where id = v_id) = 'Profil lipid', 'ubahan basi tersimpan';
end $$;

-- 3. Kiriman cacat & aturan tabel: pesan/kode terbaca, dan TIDAK ada yang setengah tersimpan.
do $$
declare
  v_kasus record;
  v_kode text;
  v_pesan text;
  v_n int := (select count(*) from public.lab_results);
begin
  for v_kasus in
    select * from (values
      ('tanpa penanda', '{"nama":"Panel","tanggal":"2026-09-01","penanda":[]}'::jsonb, '22023', 'Isi setidaknya satu penanda'),
      ('penanda bukan daftar', '{"nama":"Panel","tanggal":"2026-09-01","penanda":{}}'::jsonb, '22023', 'Penanda dikirim sebagai daftar'),
      ('nilai berupa teks', '{"nama":"Panel","tanggal":"2026-09-01","penanda":[{"nama":"X","nilai":"5,3","satuan":"g"}]}'::jsonb, '22023', 'Setiap penanda butuh'),
      ('tanpa tanggal', '{"nama":"Panel","penanda":[{"nama":"X","nilai":1,"satuan":"g"}]}'::jsonb, '22023', 'Hasil lab butuh nama panel'),
      ('tanggal besok', jsonb_build_object('nama', 'Panel', 'tanggal', ((now() at time zone 'Asia/Jakarta')::date + 1)::text,
         'penanda', jsonb_build_array(jsonb_build_object('nama', 'X', 'nilai', 1, 'satuan', 'g'))), '22007', 'Tanggal pengambilan sampel'),
      ('penanda ganda beda huruf', '{"nama":"Panel","tanggal":"2026-09-01","penanda":[{"nama":"LDL","nilai":1,"satuan":"g"},{"nama":"ldl","nilai":2,"satuan":"g"}]}'::jsonb, '23505', null),
      ('nilai empat desimal (penanda kedua)', '{"nama":"Panel","tanggal":"2026-09-01","penanda":[{"nama":"A","nilai":1,"satuan":"g"},{"nama":"B","nilai":1.2345,"satuan":"g"}]}'::jsonb, '23514', null)
    ) as t(nama, isi, kode, awal_pesan)
  loop
    v_kode := null; v_pesan := null;
    begin
      perform public.simpan_hasil_lab(v_kasus.isi);
    exception when others then v_kode := sqlstate; v_pesan := sqlerrm;
    end;
    assert v_kode = v_kasus.kode, format('%s: kode %s, seharusnya %s', v_kasus.nama, coalesce(v_kode, 'DITERIMA'), v_kasus.kode);
    assert v_kasus.awal_pesan is null or v_pesan like v_kasus.awal_pesan || '%', format('%s: pesan "%s"', v_kasus.nama, v_pesan);
  end loop;
  assert (select count(*) from public.lab_results) = v_n, 'kiriman yang ditolak meninggalkan hasil lab setengah jadi';
end $$;

-- 4. Akun lain: tidak memuat, tidak mengubah, tidak menghapus.
set request.jwt.claim.sub = '1ab10002-0000-4000-8000-000000000002';
do $$
declare v_id uuid := (select id from id_lab where nama = 'lipid'); v_kode text;
begin
  assert jsonb_array_length(public.muat_hasil_lab()) = 0, 'hasil lab akun lain termuat';
  begin
    perform public.simpan_hasil_lab('{"nama":"Diambil alih","tanggal":"2026-09-01","penanda":[{"nama":"X","nilai":1,"satuan":"g"}]}'::jsonb, v_id);
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = 'P0002', format('mengubah hasil lab akun lain: kode %s', coalesce(v_kode, 'DITERIMA'));
  v_kode := null;
  begin
    perform public.hapus_hasil_lab(v_id);
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = 'P0002', format('menghapus hasil lab akun lain: kode %s', coalesce(v_kode, 'DITERIMA'));
end $$;

-- 5. Hapus milik sendiri: hasil & penandanya hilang.
set request.jwt.claim.sub = '1ab10001-0000-4000-8000-000000000001';
do $$
declare v_id uuid := (select id from id_lab where nama = 'lipid');
begin
  perform public.hapus_hasil_lab(v_id);
  assert jsonb_array_length(public.muat_hasil_lab()) = 0, 'hasil lab tidak terhapus';
  assert not exists (select 1 from public.lab_result_markers where lab_result_id = v_id), 'penanda tertinggal';
end $$;

-- 6. Tanpa sesi & anon.
reset request.jwt.claim.sub;
do $$
declare v_kode text;
begin
  begin
    perform public.muat_hasil_lab();
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '28000', format('tanpa sesi: kode %s', v_kode);
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.simpan_hasil_lab(jsonb, uuid)', 'execute'), 'anon boleh menyimpan hasil lab';
  assert not has_function_privilege('anon', 'public.muat_hasil_lab()', 'execute'), 'anon boleh memuat hasil lab';
end $$;

delete from auth.users where id in ('1ab10001-0000-4000-8000-000000000001', '1ab10002-0000-4000-8000-000000000002');

select '✓ API hasil lab: satu transaksi, teks dirapikan, pesan terbaca, waktu basi ditolak, milik sendiri saja' as hasil;
