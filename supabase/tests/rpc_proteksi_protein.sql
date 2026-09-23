-- =============================================================================
-- Uji proteksi protein pada redistribusi kalori.
--
-- Aturan PRD-nya satu kalimat — "protein tidak pernah dipotong" — dan justru
-- kalimat sependek itu yang paling mudah dilanggar diam-diam. Di sini yang
-- diuji bukan bahwa `terapkan_redistribusi` berlaku baik, melainkan bahwa
-- BARISNYA menolak penurunan target protein walau ditulis lewat jalur lain:
-- UPDATE langsung sekalipun.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('ffff5555-0000-0000-0000-000000000005', 'protein@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = 'ffff5555-0000-0000-0000-000000000005';

set request.jwt.claim.sub = 'ffff5555-0000-0000-0000-000000000005';
set role authenticated;

-- ---------------------------------------------------------------------------
-- Pekan 21–27 Sep, "hari ini" Rabu 23, dengan kelebihan yang perlu ditutup:
--   Sen 21 Angkat Beban 2850 / 3600 · Sel 22 Beban+Lari 3100 / 3800
--   Rab 23 Rest 2450 / 2600  ← HARI INI · Kam–Min tanpa baris (Rest 2450)
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff5555-0000-0000-0000-000000000005' and nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-21', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff5555-0000-0000-0000-000000000005' and nama = 'Beban+Lari';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff5555-0000-0000-0000-000000000005' and nama = 'Rest';
  perform public.setel_tipe_hari(date '2026-09-23', v_id);

  update public.daily_logs set kalori = 3600 where tanggal = date '2026-09-21';
  update public.daily_logs set kalori = 3800 where tanggal = date '2026-09-22';
  update public.daily_logs set kalori = 2600 where tanggal = date '2026-09-23';
end $$;

-- 1. Sebelum redistribusi: tidak ada yang digeser, dan penjaganya sudah aktif.
do $$
declare p jsonb;
begin
  p := public.proteksi_protein(date '2026-09-23', date '2026-09-23');
  assert (p->>'penjaga_aktif')::boolean, 'pemicu penjaga protein tidak terpasang';
  assert (p->>'utuh')::boolean, 'seharusnya utuh sebelum ada redistribusi';
  assert (p->>'jumlah_diredistribusi')::int = 0,
    format('jumlah_diredistribusi = %s, seharusnya 0', p->>'jumlah_diredistribusi');
  assert (p->>'kalori_dipindah')::int = 0, 'belum ada kalori yang digeser';
  assert jsonb_array_length(p->'rincian') = 7, 'rincian bukan tujuh hari';
  -- Hari tanpa baris pun punya angka rencana, bukan nol.
  assert (p->'rincian'->6->>'kalori_rencana')::int = 2450,
    format('kalori rencana Minggu = %s', p->'rincian'->6->>'kalori_rencana');
  assert (p->'rincian'->6->>'protein_g')::numeric = 165,
    format('protein Minggu = %s, seharusnya 165 (Rest Lean Gain)',
           p->'rincian'->6->>'protein_g');
end $$;

-- 2. Setelah redistribusi: KALORI bergeser, protein tidak — dan selisihnya
--    diperlihatkan per hari, bukan diklaim.
do $$
declare p jsonb; h jsonb;
begin
  perform public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null,
                                       date '2026-09-23', 'Kelebihan disebar rata');

  p := public.proteksi_protein(date '2026-09-23', date '2026-09-23');
  assert (p->>'utuh')::boolean, 'protein seharusnya utuh setelah redistribusi';
  assert (p->>'jumlah_diredistribusi')::int = 4,
    format('jumlah_diredistribusi = %s, seharusnya 4', p->>'jumlah_diredistribusi');
  assert (p->>'kalori_dipindah')::int = -1600,
    format('kalori_dipindah = %s, seharusnya -1600', p->>'kalori_dipindah');

  h := p->'rincian'->3;  -- Kamis 24
  assert (h->>'diredistribusi')::boolean, 'Kamis seharusnya ditandai diredistribusi';
  assert (h->>'kalori_rencana')::int = 2450, format('kalori rencana = %s', h->>'kalori_rencana');
  assert (h->>'kalori_berlaku')::int = 2050, format('kalori berlaku = %s', h->>'kalori_berlaku');
  assert (h->>'selisih_kalori')::int = -400, format('selisih kalori = %s', h->>'selisih_kalori');
  assert (h->>'selisih_protein')::int = 0, 'selisih protein seharusnya nol';
  assert (h->>'protein_g')::numeric = 165, format('protein = %s, seharusnya 165', h->>'protein_g');
  assert (h->>'protein_rencana')::numeric = 165, 'protein rencana berubah';
  assert not (h->>'protein_di_bawah_rencana')::boolean, 'protein jatuh di bawah rencana';

  -- Hari yang sudah berjalan tidak ikut ditandai.
  assert not (p->'rincian'->0->>'diredistribusi')::boolean, 'Senin ikut ditandai';
  assert (p->'rincian'->0->>'selisih_kalori')::int = 0, 'Senin ikut bergeser';
end $$;

-- 3. Inti task ini: UPDATE LANGSUNG yang menurunkan target protein pada hari
--    yang diredistribusi DITOLAK BARISNYA, bukan dipercayakan ke pemanggil.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.daily_logs set target_protein_g = 120
     where tanggal = date '2026-09-24';
  exception when check_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'menurunkan target protein hari yang diredistribusi seharusnya ditolak';
  assert (select target_protein_g from public.daily_logs where tanggal = date '2026-09-24') = 165,
    'target protein tetap berubah walau seharusnya ditolak';
end $$;

-- 4. Mengosongkannya sama saja dengan memotongnya sampai nol.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.daily_logs set target_protein_g = null
     where tanggal = date '2026-09-25';
  exception when check_violation then
    v_gagal := true;
  end;
  assert v_gagal, 'mengosongkan target protein seharusnya ditolak';
end $$;

-- 5. MENAIKKAN protein tetap boleh: yang dilarang memotongnya, bukan
--    menyesuaikannya ke atas.
do $$
begin
  update public.daily_logs set target_protein_g = 175
   where tanggal = date '2026-09-24';
  assert (select target_protein_g from public.daily_logs where tanggal = date '2026-09-24') = 175,
    'kenaikan target protein seharusnya diizinkan';
  -- Sekarang snapshot di ATAS rencana; itu bukan pelanggaran.
  assert (public.proteksi_protein(date '2026-09-23', date '2026-09-23')->>'utuh')::boolean,
    'protein di atas rencana seharusnya tetap dianggap utuh';
  -- Menurunkannya KEMBALI pun ditolak. Itu memang disengaja: penjaganya tidak
  -- menyimpan "asal" target protein, jadi satu-satunya aturan yang bisa
  -- ditegakkan tanpa menebak niat adalah "tidak pernah turun".
  declare v_gagal boolean := false;
  begin
    begin
      update public.daily_logs set target_protein_g = 165
       where tanggal = date '2026-09-24';
    exception when check_violation then
      v_gagal := true;
    end;
    assert v_gagal, 'penurunan kembali seharusnya tetap ditolak';
  end;
end $$;

-- 6. Hari yang TIDAK diredistribusi tidak dibekukan: menyunting rencananya sah.
do $$
begin
  update public.daily_logs set target_protein_g = 150 where tanggal = date '2026-09-21';
  assert (select target_protein_g from public.daily_logs where tanggal = date '2026-09-21') = 150,
    'hari tanpa redistribusi seharusnya masih bisa disunting';
  update public.daily_logs set target_protein_g = 180 where tanggal = date '2026-09-21';
end $$;

-- 7. Ganti tipe hari pada hari yang diredistribusi adalah penyegaran snapshot
--    yang sah: protein boleh turun karena rencananya memang berbeda.
do $$
declare v_id uuid; v public.daily_logs;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff5555-0000-0000-0000-000000000005' and nama = 'Padel';
  -- Rest Lean Gain protein 165 → Padel Lean Gain 175 (naik), jadi dipakai
  -- arah sebaliknya: dari Padel kembali ke Rest.
  select * into v from public.setel_tipe_hari(date '2026-09-26', v_id);
  assert v.target_protein_g = 175, format('protein Padel = %s, seharusnya 175', v.target_protein_g);
  -- Ganti tipe hari MEMBATALKAN redistribusi hari itu (001400), jadi target
  -- aslinya ikut hilang — dan hari itu tidak lagi terjaga.
  assert v.target_asli_kalori is null, 'ganti tipe hari seharusnya membatalkan target asli';

  select id into v_id from public.day_types
   where user_id = 'ffff5555-0000-0000-0000-000000000005' and nama = 'Rest';
  select * into v from public.setel_tipe_hari(date '2026-09-26', v_id);
  assert v.target_protein_g = 165,
    format('protein kembali ke Rest = %s, seharusnya 165', v.target_protein_g);
end $$;

-- 8. Ganti FASE juga penyegaran yang sah: Cut menurunkan kalori tapi MENAIKKAN
--    protein, jadi arah yang dijaga tidak pernah tertukar dengan arah fase.
do $$
declare v_protein numeric;
begin
  perform public.ganti_fase('Cut', date '2026-09-25');
  select target_protein_g into v_protein
    from public.daily_logs where tanggal = date '2026-09-25';
  assert v_protein = 175, format('protein Rest Cut = %s, seharusnya 175', v_protein);
  perform public.ganti_fase('Lean Gain', date '2026-09-25');
end $$;

-- 9. Isolasi & hak akses.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.proteksi_protein(date '2026-09-23', date '2026-09-23');
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;

  assert not has_function_privilege('anon', 'public.proteksi_protein(date, date)', 'execute'),
    'anon masih boleh membaca bukti proteksi protein';
  assert has_function_privilege('authenticated', 'public.proteksi_protein(date, date)', 'execute'),
    'authenticated seharusnya boleh membaca bukti proteksi protein';
end $$;

select '✓ proteksi protein: penurunan target protein pada hari yang diredistribusi ditolak barisnya, bukti per hari terbaca' as hasil;
