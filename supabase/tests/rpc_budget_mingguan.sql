-- =============================================================================
-- Uji perhitungan budget kalori mingguan (`budget_mingguan`).
--
-- Fokusnya tiga aturan yang gampang salah dan efeknya baru terasa berpekan-
-- pekan kemudian:
--   1. TOTAL pekan memakai target ASLI, tapi LAJU memakai target BERLAKU.
--   2. HARI INI bukan hari tersisa.
--   3. Pembanding laju = jumlah target hari yang sudah berjalan, bukan
--      proporsi hari.
-- Angka-angka di bawah dipilih supaya ketiganya bisa dibedakan: kalau salah
-- satu aturan dibalik, angka yang keluar berbeda dan assert-nya jatuh.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('ffff1111-0000-0000-0000-000000000001', 'budget-a@contoh.test'),
  ('ffff2222-0000-0000-0000-000000000002', 'budget-b@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = 'ffff1111-0000-0000-0000-000000000001';

set request.jwt.claim.sub = 'ffff1111-0000-0000-0000-000000000001';
set role authenticated;

-- ---------------------------------------------------------------------------
-- Pekan uji: Senin 2026-09-21 s/d Minggu 2026-09-27, "hari ini" Rabu 23.
--
--   Sen 21  Angkat Beban  target 2850                 terpakai 2900
--   Sel 22  Beban+Lari    target 2900 (asli 3100)     terpakai 3300  ← dipotong
--   Rab 23  Rest          target 2450   ← HARI INI    terpakai 1200
--   Kam 24  Angkat Beban  target 2850                 belum jalan
--   Jum–Min tidak punya baris → jatuh ke tipe hari bawaan (Rest, 2450)
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff1111-0000-0000-0000-000000000001' and nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-21', v_id);
  perform public.setel_tipe_hari(date '2026-09-24', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff1111-0000-0000-0000-000000000001' and nama = 'Beban+Lari';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff1111-0000-0000-0000-000000000001' and nama = 'Rest';
  perform public.setel_tipe_hari(date '2026-09-23', v_id);

  update public.daily_logs set kalori = 2900, protein_g = 180 where tanggal = date '2026-09-21';
  -- Redistribusi Selasa: target berlaku turun, target ASLI disimpan.
  update public.daily_logs
     set kalori = 3300, protein_g = 190,
         target_asli_kalori = target_kalori, target_kalori = 2900
   where tanggal = date '2026-09-22';
  update public.daily_logs set kalori = 1200, protein_g = 95 where tanggal = date '2026-09-23';
end $$;

-- 1. Bentuk keluaran & rincian tujuh hari.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');

  assert (b->>'minggu_mulai') = '2026-09-21',
    format('minggu_mulai = %s, seharusnya 2026-09-21', b->>'minggu_mulai');
  assert (b->>'hari_ini') = '2026-09-23', format('hari_ini = %s', b->>'hari_ini');
  assert jsonb_array_length(b->'rincian') = 7,
    format('rincian %s hari, seharusnya 7', jsonb_array_length(b->'rincian'));
  -- Hari tanpa baris tetap muncul dengan tipe hari bawaan, bukan hilang.
  assert (b->'rincian'->6->>'tanggal') = '2026-09-27', 'hari terakhir pekan bukan 27 Sep';
  assert (b->'rincian'->6->>'nama_tipe_hari') = 'Rest',
    format('tipe hari Minggu = %s, seharusnya Rest bawaan', b->'rincian'->6->>'nama_tipe_hari');
  assert (b->'rincian'->6->>'target_kalori')::int = 2450,
    format('target Minggu = %s, seharusnya 2450', b->'rincian'->6->>'target_kalori');
  -- Selisih hanya untuk hari yang sudah/sedang berjalan.
  assert (b->'rincian'->0->>'selisih')::int = 50,
    format('selisih Senin = %s, seharusnya 2900-2850', b->'rincian'->0->>'selisih');
  assert (b->'rincian'->6->'selisih') = 'null'::jsonb, 'hari mendatang seharusnya tanpa selisih';
end $$;

-- 2. Aturan 1 — TOTAL memakai target ASLI.
--    2850 + 3100 + 2450 + 2850 + 2450×3 = 18.600.
--    Kalau total ikut memakai target yang sudah dipotong, hasilnya 18.400 dan
--    redistribusi membatalkan dirinya sendiri.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  assert (b->>'budget_total')::int = 18600,
    format('budget_total = %s, seharusnya 18600 (memakai target asli)', b->>'budget_total');
  assert (b->>'budget_total')::int <> 18400,
    'budget_total memakai target yang sudah dipotong redistribusi';
  assert (b->>'terpakai')::int = 7400, format('terpakai = %s, seharusnya 7400', b->>'terpakai');
  assert (b->>'sisa')::int = 11200, format('sisa = %s, seharusnya 11200', b->>'sisa');
end $$;

-- 3. Aturan 2 — HARI INI bukan hari tersisa.
--    Kam–Min = 4 hari, bukan 5. Sisa 11.200 dibagi 4 = 2.800; kalau hari ini
--    ikut dihitung, angkanya jadi 2.240 dan terlihat jauh lebih longgar.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  assert (b->>'hari_tersisa')::int = 4,
    format('hari_tersisa = %s, seharusnya 4 (hari ini tidak dihitung)', b->>'hari_tersisa');
  assert (b->>'target_mendatang')::int = 10200,
    format('target_mendatang = %s, seharusnya 10200', b->>'target_mendatang');
  assert (b->>'sisa_per_hari')::int = 2800,
    format('sisa_per_hari = %s, seharusnya 2800', b->>'sisa_per_hari');
  assert (b->>'rencana_per_hari')::int = 2550,
    format('rencana_per_hari = %s, seharusnya 2550', b->>'rencana_per_hari');
end $$;

-- 4. Aturan 3 — pembanding laju = jumlah TARGET BERLAKU hari yang berjalan.
--    2850 + 2900 + 2450 = 8.200. Tiga pembanding yang salah dan hasilnya:
--      • proporsi hari  : round(18600 × 3/7) = 7.971
--      • pakai target asli: 2850 + 3100 + 2450 = 8.400
--      • rata-rata      : round(18600/7 × 3)  = 7.971
do $$
declare b jsonb; l jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  l := b->'laju';

  assert (l->>'seharusnya')::int = 8200,
    format('laju.seharusnya = %s, seharusnya 8200', l->>'seharusnya');
  assert (l->>'seharusnya')::int <> 7971, 'laju memakai proporsi hari, bukan target harian';
  assert (l->>'seharusnya')::int <> 8400, 'laju memakai target asli, bukan target berlaku';
  assert (l->>'selisih')::int = -800, format('laju.selisih = %s, seharusnya -800', l->>'selisih');
  assert (l->>'status') = 'lebih lambat',
    format('status laju = %s, seharusnya lebih lambat', l->>'status');
  assert (l->>'ambang_kcal')::int = 300, 'ambang bawaan seharusnya 300';
end $$;

-- 5. Ambang menentukan status, bukan tanda selisih semata.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23', 900);
  assert (b->'laju'->>'status') = 'sesuai laju',
    format('selisih -800 dengan ambang 900 = %s, seharusnya sesuai laju',
           b->'laju'->>'status');
  assert (b->'laju'->>'ambang_kcal')::int = 900, 'ambang tidak ikut dilaporkan';

  -- Ambang negatif tidak punya arti dan harus ditolak, bukan diam-diam dipakai.
  begin
    perform public.budget_mingguan(date '2026-09-23', date '2026-09-23', -1);
    assert false, 'ambang negatif seharusnya ditolak';
  exception when numeric_value_out_of_range then
    null;
  end;
end $$;

-- 6. Pekan yang SELURUHNYA masih di depan → `belum mulai`, bukan "lebih lambat".
--    Tanpa argumen hari-ini yang terpisah, keadaan ini tidak pernah tercapai.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-28', date '2026-09-23');
  assert (b->>'minggu_mulai') = '2026-09-28', format('minggu_mulai = %s', b->>'minggu_mulai');
  assert (b->>'hari_tersisa')::int = 7, format('hari_tersisa = %s, seharusnya 7', b->>'hari_tersisa');
  assert (b->>'terpakai')::int = 0, 'pekan mendatang seharusnya belum terpakai';
  assert (b->>'budget_total')::int = 17150,
    format('budget_total pekan bawaan = %s, seharusnya 2450×7', b->>'budget_total');
  assert (b->'laju'->>'status') = 'belum mulai',
    format('status = %s, seharusnya belum mulai', b->'laju'->>'status');
  assert (b->'laju'->>'seharusnya')::int = 0, 'pembanding seharusnya 0 saat belum mulai';
  assert (b->'laju'->>'selisih')::int = 0, 'selisih seharusnya 0 saat belum mulai';
end $$;

-- 7. Pekan yang seluruhnya LAMPAU → tidak ada hari tersisa, dan "per hari"
--    dikosongkan alih-alih dibagi nol.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-14', date '2026-09-23');
  assert (b->>'hari_tersisa')::int = 0, format('hari_tersisa = %s', b->>'hari_tersisa');
  assert (b->'sisa_per_hari') = 'null'::jsonb, 'sisa_per_hari seharusnya kosong';
  assert (b->'rencana_per_hari') = 'null'::jsonb, 'rencana_per_hari seharusnya kosong';
  assert (b->'laju'->>'status') = 'lebih lambat',
    format('pekan lampau tanpa catatan = %s', b->'laju'->>'status');
end $$;

-- 8. Target memakai fase yang berlaku PADA TANGGAL ITU, bukan fase hari ini.
--    Periode tertutup memegang fasenya sendiri selamanya.
reset role;
set request.jwt.claim.sub = 'ffff2222-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare b jsonb;
begin
  -- Fase aktif pengguna B tetap bawaan (Maintenance): Rest = 2300.
  b := public.budget_mingguan(date '2026-09-16', date '2026-09-23');
  assert (b->>'budget_total')::int = 16100,
    format('budget_total Maintenance = %s, seharusnya 2300×7', b->>'budget_total');

  -- Pekan itu sebenarnya dijalani dalam fase Cut yang sudah ditutup.
  insert into public.fase_periode (user_id, fase, mulai_tanggal, selesai_tanggal)
  values ('ffff2222-0000-0000-0000-000000000002', 'Cut',
          date '2026-09-14', date '2026-09-20');

  b := public.budget_mingguan(date '2026-09-16', date '2026-09-23');
  assert (b->>'budget_total')::int = 14000,
    format('budget_total Cut = %s, seharusnya 2000×7 menurut riwayat fase',
           b->>'budget_total');
end $$;

-- 9. Isolasi: budget pengguna B tidak memuat catatan pengguna A sama sekali.
do $$
declare b jsonb;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  assert (b->>'terpakai')::int = 0,
    format('terpakai pengguna B = %s, seharusnya 0 — catatan A ikut terbaca',
           b->>'terpakai');
  assert (b->>'budget_total')::int = 16100,
    format('budget_total pengguna B = %s, seharusnya 2300×7 (fase aktifnya sendiri)',
           b->>'budget_total');
end $$;

-- 10. Tanpa sesi login tidak ada budget untuk dihitung.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.budget_mingguan(date '2026-09-23', date '2026-09-23');
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;
end $$;

-- 11. Peran anon tidak boleh mengeksekusi RPC-nya sama sekali.
do $$
begin
  assert not has_function_privilege('anon', 'public.budget_mingguan(date, date, integer)', 'execute'),
    'anon masih boleh menjalankan budget_mingguan';
  assert has_function_privilege('authenticated', 'public.budget_mingguan(date, date, integer)', 'execute'),
    'authenticated seharusnya boleh menjalankan budget_mingguan';
end $$;

select '✓ budget mingguan: total dari target asli, laju dari target berlaku, hari ini bukan hari tersisa' as hasil;
