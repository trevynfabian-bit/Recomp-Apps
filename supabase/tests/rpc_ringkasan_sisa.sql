-- =============================================================================
-- Uji ringkasan sisa harian & rata-rata 7 hari.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('77777777-7777-7777-7777-777777777777', 'gilang@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = '77777777-7777-7777-7777-777777777777';

set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
set role authenticated;

-- Siapkan hari: tipe Angkat Beban (Lean Gain → 2850/180/82/25), konsumsi
-- 1980/128/61/198/17 — persis angka yang dipakai layar depan.
do $$
declare v_id uuid;
begin
  select day_type_id into v_id from public.v_tipe_hari_aktif where nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);
  perform public.simpan_berat_pagi(date '2026-09-22', 74.6);
  perform public.catat_makanan(date '2026-09-22', 'Total hari ini', 1980, 128, 61, 198, 17);
end $$;

-- 1. Sisa dihitung sebagai target − terpakai.
do $$
declare r record;
begin
  select * into r from public.ringkasan_sisa_harian(date '2026-09-22');
  assert r.sisa_kalori = 870,     format('sisa kalori %s, seharusnya 870', r.sisa_kalori);
  assert r.sisa_protein_g = 52,   format('sisa protein %s, seharusnya 52', r.sisa_protein_g);
  assert r.sisa_lemak_g = 21,     format('sisa lemak %s, seharusnya 21', r.sisa_lemak_g);
  assert r.sisa_sat_fat_g = 8,    format('sisa sat fat %s, seharusnya 8', r.sisa_sat_fat_g);
  assert not r.sat_fat_terlampaui, 'sat fat belum terlampaui';
  assert not r.kalori_terlampaui,  'kalori belum terlampaui';
  assert r.berat_pagi_kg = 74.6,  format('berat %s', r.berat_pagi_kg);
  assert r.nama_tipe_hari = 'Angkat Beban', format('tipe hari %s', r.nama_tipe_hari);
end $$;

-- 2. Melewati batas sat fat menghasilkan sisa NEGATIF + penanda terlampaui.
do $$
declare r record;
begin
  perform public.catat_makanan(date '2026-09-22', 'Keju tambahan', 200, 12, 16, 2, 12);

  select * into r from public.ringkasan_sisa_harian(date '2026-09-22');
  assert r.terpakai_sat_fat_g = 29, format('sat fat terpakai %s', r.terpakai_sat_fat_g);
  assert r.sisa_sat_fat_g = -4,     format('sisa sat fat %s, seharusnya -4', r.sisa_sat_fat_g);
  assert r.sat_fat_terlampaui,      'sat fat seharusnya ditandai terlampaui';
  assert r.sisa_kalori = 670,       format('sisa kalori %s, seharusnya 670', r.sisa_kalori);
  assert not r.kalori_terlampaui,   'kalori belum terlampaui';
end $$;

-- 3. Melewati target kalori ditandai juga.
do $$
declare r record;
begin
  perform public.catat_makanan(date '2026-09-22', 'Makan malam besar', 900, 50, 30, 90, 5);

  select * into r from public.ringkasan_sisa_harian(date '2026-09-22');
  assert r.sisa_kalori = -230,  format('sisa kalori %s, seharusnya -230', r.sisa_kalori);
  assert r.kalori_terlampaui,   'kalori seharusnya ditandai terlampaui';
end $$;

-- 4. Karbo tidak punya target, jadi tidak punya sisa.
do $$
declare r record;
begin
  select * into r from public.ringkasan_sisa_harian(date '2026-09-22');
  assert r.terpakai_karbo_g = 290, format('karbo terpakai %s, seharusnya 290', r.terpakai_karbo_g);
end $$;

-- 5. Rata-rata 7 hari melewati hari yang tidak ditimbang, tidak menghitungnya nol.
do $$
declare r record;
begin
  perform public.simpan_berat_pagi(date '2026-09-20', 74.8);
  perform public.simpan_berat_pagi(date '2026-09-18', 74.2);
  -- 19 & 21 sengaja dikosongkan.

  select * into r from public.rata_rata_berat_7_hari(date '2026-09-22');
  assert r.jumlah_timbangan = 3, format('jumlah timbangan %s, seharusnya 3', r.jumlah_timbangan);
  -- (74.6 + 74.8 + 74.2) / 3 = 74.53
  assert r.rata_rata_kg = 74.53, format('rata-rata %s, seharusnya 74.53', r.rata_rata_kg);
end $$;

-- 6. Jendela 7 hari benar-benar membatasi: timbangan lama tidak ikut.
do $$
declare r record;
begin
  perform public.simpan_berat_pagi(date '2026-09-10', 60.0);

  select * into r from public.rata_rata_berat_7_hari(date '2026-09-22');
  assert r.jumlah_timbangan = 3,
    format('timbangan 12 hari lalu ikut terhitung (%s)', r.jumlah_timbangan);
end $$;

-- 7. Timbangan pengguna lain tidak ikut.
do $$
declare r record;
begin
  select * into r from public.rata_rata_berat_7_hari(date '2026-09-22');
  assert r.jumlah_timbangan = 3, format('data pengguna lain ikut (%s)', r.jumlah_timbangan);
end $$;

reset role;

\echo 'Ringkasan sisa OK — sisa negatif & penanda terlampaui benar, rata-rata 7 hari melewati hari kosong'
