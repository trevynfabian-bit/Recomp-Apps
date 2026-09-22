-- =============================================================================
-- Uji perhitungan & penerapan redistribusi kalori mingguan.
--
-- Skema-nya sudah diuji di rpc_redistribusi_skema.sql. Di sini yang diuji
-- aturan PRD yang tidak bisa dijamin bentuk tabel: pratinjau tidak menulis,
-- maksimal sekali per pekan, pembulatan 50 kkal, batas bawah dibaca dari PROFIL
-- dan tidak pernah dilanggar, hari yang sudah berjalan tidak disentuh, target
-- asli disimpan, dan protein tetap utuh.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('ffff3333-0000-0000-0000-000000000003', 'redis-hitung@contoh.test'),
  ('ffff4444-0000-0000-0000-000000000004', 'redis-lain@contoh.test');

update public.profiles set fase_aktif = 'Lean Gain'
 where user_id = 'ffff3333-0000-0000-0000-000000000003';

set request.jwt.claim.sub = 'ffff3333-0000-0000-0000-000000000003';
set role authenticated;

-- ---------------------------------------------------------------------------
-- Pekan uji: Senin 2026-09-21 s/d Minggu 2026-09-27, "hari ini" Rabu 23.
--
--   Sen 21  Angkat Beban  target 2850   terpakai 3600
--   Sel 22  Beban+Lari    target 3100   terpakai 3800
--   Rab 23  Rest          target 2450   terpakai 2600   ← HARI INI
--   Kam–Min tanpa baris → Rest bawaan 2450 masing-masing
--
--   budget_total 18.200 · terpakai 10.000 · sisa 8.200
--   target_mendatang 9.800 → perlu dipindah = 8.200 − 9.800 = −1.600
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff3333-0000-0000-0000-000000000003' and nama = 'Angkat Beban';
  perform public.setel_tipe_hari(date '2026-09-21', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff3333-0000-0000-0000-000000000003' and nama = 'Beban+Lari';
  perform public.setel_tipe_hari(date '2026-09-22', v_id);

  select id into v_id from public.day_types
   where user_id = 'ffff3333-0000-0000-0000-000000000003' and nama = 'Rest';
  perform public.setel_tipe_hari(date '2026-09-23', v_id);

  update public.daily_logs set kalori = 3600 where tanggal = date '2026-09-21';
  update public.daily_logs set kalori = 3800 where tanggal = date '2026-09-22';
  update public.daily_logs set kalori = 2600 where tanggal = date '2026-09-23';
end $$;

-- 1. Pratinjau tidak menulis APA PUN — tiga hari log tetap tiga, jejak kosong.
do $$
declare n_log integer; n_jejak integer; n_hari integer; h jsonb;
begin
  select count(*) into n_log from public.daily_logs;
  select count(*) into n_jejak from public.redistribusi_mingguan;
  select count(*) into n_hari from public.redistribusi_hari;

  h := public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
  perform public.hitung_redistribusi(date '2026-09-23', 'tumpuk_satu_hari', null, date '2026-09-23');

  assert (select count(*) from public.daily_logs) = n_log, 'pratinjau membuat baris log baru';
  assert (select count(*) from public.redistribusi_mingguan) = n_jejak, 'pratinjau menulis jejak';
  assert (select count(*) from public.redistribusi_hari) = n_hari, 'pratinjau menulis jejak harian';
  assert (h->>'diterapkan') is null, 'pratinjau seharusnya tidak mengaku diterapkan';
end $$;

-- 2. Sebar rata: −1.600 dibagi 4 hari = −400/hari, tanpa sisa & tanpa lantai.
do $$
declare h jsonb;
begin
  h := public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');

  assert (h->>'perlu_dipindah')::int = -1600,
    format('perlu_dipindah = %s, seharusnya -1600', h->>'perlu_dipindah');
  assert (h->>'terserap')::int = -1600, format('terserap = %s', h->>'terserap');
  assert (h->>'tersisa')::int = 0, format('tersisa = %s, seharusnya 0', h->>'tersisa');
  assert not (h->>'dibatasi_lantai')::boolean, 'seharusnya tidak kena lantai';
  assert (h->>'kelipatan_kcal')::int = 50, 'kelipatan pembulatan seharusnya 50';
  assert (h->>'batas_bawah_kalori')::int = 1800, 'batas bawah bawaan seharusnya 1800';
  assert (h->>'sebab') is null, format('sebab = %s, seharusnya kosong', h->>'sebab');

  assert jsonb_array_length(h->'hari') = 4,
    format('%s hari diusulkan, seharusnya 4 (Kam–Min)', jsonb_array_length(h->'hari'));
  assert (h->'hari'->0->>'tanggal') = '2026-09-24', 'hari pertama usulan bukan Kamis';
  assert (h->'hari'->0->>'target_lama')::int = 2450, 'target lama Kamis bukan 2450';
  assert (h->'hari'->0->>'target_baru')::int = 2050,
    format('target baru Kamis = %s, seharusnya 2050', h->'hari'->0->>'target_baru');
  assert (h->'hari'->3->>'target_baru')::int = 2050, 'target baru Minggu bukan 2050';
  -- Semua usulan adalah kelipatan 50.
  assert (select bool_and(((x->>'target_baru')::int) % 50 = 0)
            from jsonb_array_elements(h->'hari') as x),
    'ada target baru yang bukan kelipatan 50';
end $$;

-- 3. `abaikan` tidak mengubah apa pun dan TIDAK menghanguskan kuota pekan.
do $$
declare h jsonb;
begin
  h := public.terapkan_redistribusi(date '2026-09-23', 'abaikan', null, date '2026-09-23');
  assert (h->>'sebab') = 'abaikan', format('sebab = %s', h->>'sebab');
  assert not (h->>'diterapkan')::boolean, 'abaikan seharusnya tidak diterapkan';
  assert (h->>'terserap')::int = 0, 'abaikan seharusnya tidak menyerap apa pun';
  assert (h->>'tersisa')::int = -1600, 'seluruh selisih seharusnya dilaporkan tersisa';
  assert (select count(*) from public.redistribusi_mingguan) = 0,
    'abaikan seharusnya tidak mencatat jejak';
end $$;

-- 4. Tumpuk satu hari tanpa sasaran → hari TERAKHIR pekan, dan di situ lantai
--    menahan: 2450 − 1600 = 850, tertahan di 1800, jadi selisihnya −650.
do $$
declare h jsonb;
begin
  h := public.hitung_redistribusi(date '2026-09-23', 'tumpuk_satu_hari', null, date '2026-09-23');

  assert (h->>'dibatasi_lantai')::boolean, 'seharusnya kena lantai';
  assert (h->'hari'->3->>'tanggal') = '2026-09-27', 'sasaran bawaan bukan hari terakhir';
  assert (h->'hari'->3->>'target_baru')::int = 1800,
    format('target baru Minggu = %s, seharusnya tertahan 1800', h->'hari'->3->>'target_baru');
  assert (h->'hari'->3->>'kena_lantai')::boolean, 'Minggu seharusnya ditandai kena lantai';
  assert (h->'hari'->0->>'selisih')::int = 0, 'hari lain seharusnya tidak berubah';
  assert (h->>'terserap')::int = -650, format('terserap = %s, seharusnya -650', h->>'terserap');
  assert (h->>'tersisa')::int = -950,
    format('tersisa = %s, seharusnya -950 (tertahan lantai)', h->>'tersisa');
end $$;

-- 5. Sasaran bisa ditunjuk; yang lain tetap utuh.
do $$
declare h jsonb;
begin
  h := public.hitung_redistribusi(date '2026-09-23', 'tumpuk_satu_hari',
                                  date '2026-09-24', date '2026-09-23');
  assert (h->'hari'->0->>'target_baru')::int = 1800, 'Kamis seharusnya yang dipotong';
  assert (h->'hari'->3->>'selisih')::int = 0, 'Minggu seharusnya tidak tersentuh';
end $$;

-- 6. Batas bawah dibaca dari PROFIL, bukan dari argumen pemanggil.
do $$
declare h jsonb;
begin
  update public.profiles set batas_bawah_kalori = 2200
   where user_id = 'ffff3333-0000-0000-0000-000000000003';

  h := public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
  assert (h->>'batas_bawah_kalori')::int = 2200, 'batas profil tidak terbaca';
  assert (h->'hari'->0->>'target_baru')::int = 2200,
    format('target baru = %s, seharusnya tertahan 2200', h->'hari'->0->>'target_baru');
  assert (h->>'terserap')::int = -1000, format('terserap = %s, seharusnya -250×4', h->>'terserap');
  assert (h->>'tersisa')::int = -600, format('tersisa = %s, seharusnya -600', h->>'tersisa');

  -- Batas di luar rentang masuk akal ditolak database, bukan diam-diam dipakai.
  begin
    update public.profiles set batas_bawah_kalori = 200
     where user_id = 'ffff3333-0000-0000-0000-000000000003';
    assert false, 'batas 200 kkal seharusnya ditolak';
  exception when check_violation then
    null;
  end;

  update public.profiles set batas_bawah_kalori = 1800
   where user_id = 'ffff3333-0000-0000-0000-000000000003';
end $$;

-- 7. Penerapan: hanya hari mendatang yang ditulis, protein & hari lampau utuh,
--    dan TOTAL pekan tidak ikut mengecil.
do $$
declare
  h jsonb; b jsonb;
  v_protein_sebelum numeric[]; v_protein_sesudah numeric[];
  v_total_sebelum integer;
begin
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  v_total_sebelum := (b->>'budget_total')::int;
  assert v_total_sebelum = 18200, format('budget_total awal = %s', v_total_sebelum);

  select array_agg(coalesce(target_protein_g, -1) order by tanggal)
    into v_protein_sebelum
    from public.daily_logs where tanggal between date '2026-09-21' and date '2026-09-27';

  h := public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null,
                                    date '2026-09-23', 'Kelebihan Sen–Rab disebar rata');
  assert (h->>'diterapkan')::boolean, 'seharusnya diterapkan';
  assert (h->>'redistribusi_id') is not null, 'id jejak tidak dikembalikan';

  -- Hari mendatang: target baru + target ASLI tersimpan.
  assert (select count(*) from public.daily_logs
           where tanggal between date '2026-09-24' and date '2026-09-27'
             and target_kalori = 2050 and target_asli_kalori = 2450) = 4,
    'empat hari mendatang seharusnya bertarget 2050 dengan asli 2450';
  -- Baris yang baru dibuat bukan pilihan manual pengguna.
  assert (select bool_and(not day_type_override) from public.daily_logs
           where tanggal between date '2026-09-24' and date '2026-09-27'),
    'hari yang dibuat redistribusi seharusnya tidak ditandai override';

  -- Hari yang sudah berjalan sama sekali tidak disentuh.
  assert (select count(*) from public.daily_logs
           where tanggal between date '2026-09-21' and date '2026-09-23'
             and target_asli_kalori is not null) = 0,
    'hari yang sudah berjalan ikut ditulis';
  assert (select target_kalori from public.daily_logs where tanggal = date '2026-09-21') = 2850,
    'target hari lampau berubah';
  assert (select target_kalori from public.daily_logs where tanggal = date '2026-09-23') = 2450,
    'target HARI INI berubah';

  -- Protein: dibandingkan per hari, bukan diklaim.
  select array_agg(coalesce(target_protein_g, -1) order by tanggal)
    into v_protein_sesudah
    from public.daily_logs where tanggal between date '2026-09-21' and date '2026-09-27';
  assert v_protein_sebelum = v_protein_sesudah[1:array_length(v_protein_sebelum, 1)],
    format('target protein berubah: %s → %s', v_protein_sebelum, v_protein_sesudah);

  -- Yang paling menentukan: budget pekan TIDAK ikut mengecil sebesar potongan.
  b := public.budget_mingguan(date '2026-09-23', date '2026-09-23');
  assert (b->>'budget_total')::int = v_total_sebelum,
    format('budget_total jadi %s, seharusnya tetap %s — redistribusi membatalkan dirinya sendiri',
           b->>'budget_total', v_total_sebelum);
  assert (b->>'target_mendatang')::int = 8200,
    format('target_mendatang = %s, seharusnya 2050×4', b->>'target_mendatang');
end $$;

-- 8. Jejaknya lengkap dan utuh secara aritmetika.
do $$
declare r public.redistribusi_mingguan; n integer;
begin
  select * into r from public.redistribusi_mingguan where minggu_mulai = date '2026-09-21';
  assert r.opsi = 'sebar_rata', format('opsi tercatat = %s', r.opsi);
  assert r.perlu_dipindah = -1600 and r.terserap = -1600 and r.tersisa = 0,
    format('jejak = %s/%s/%s', r.perlu_dipindah, r.terserap, r.tersisa);
  assert not r.dibatasi_lantai, 'jejak seharusnya tidak menandai lantai';
  assert r.alasan = 'Kelebihan Sen–Rab disebar rata', 'alasan tidak tersimpan';

  select count(*) into n from public.redistribusi_hari where redistribusi_id = r.id;
  assert n = 4, format('%s baris jejak harian, seharusnya 4', n);
  assert (select count(*) from public.redistribusi_hari
           where redistribusi_id = r.id and target_lama = 2450 and target_baru = 2050) = 4,
    'jejak harian tidak memuat target lama & baru yang benar';
end $$;

-- 9. Setelah diterapkan, pekan itu sudah pas: tidak ada lagi yang perlu
--    dipindah, jadi permintaan ulang berhenti di situ — bukan di kuota.
do $$
declare h jsonb;
begin
  h := public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
  assert (h->>'perlu_dipindah')::int = 0,
    format('perlu_dipindah = %s, seharusnya 0 setelah diterapkan', h->>'perlu_dipindah');
  assert (h->>'sebab') = 'sudah pas', format('sebab = %s', h->>'sebab');

  h := public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
  assert not (h->>'diterapkan')::boolean, 'tidak ada yang perlu dipindah, tapi tetap diterapkan';
end $$;

-- 10. Maksimal SEKALI per pekan — ditagih justru saat pengguna kelebihan LAGI
--     setelah redistribusi pertama, yaitu satu-satunya keadaan di mana
--     penerapan kedua benar-benar akan mengubah sesuatu.
do $$
begin
  update public.daily_logs set kalori = kalori + 600 where tanggal = date '2026-09-23';
  -- Sekarang ada kelebihan baru yang belum tertutup.
  assert (public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null,
                                     date '2026-09-23')->>'perlu_dipindah')::int = -600,
    'kelebihan baru tidak terbaca';

  begin
    perform public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
    assert false, 'redistribusi kedua di pekan yang sama seharusnya ditolak';
  exception when unique_violation then
    null;
  end;

  assert (select count(*) from public.redistribusi_mingguan
           where minggu_mulai = date '2026-09-21') = 1,
    'pekan itu punya lebih dari satu penerapan';
  -- Penolakan tidak boleh menyisakan tulisan separuh jalan.
  assert (select count(*) from public.daily_logs
           where tanggal between date '2026-09-24' and date '2026-09-27'
             and target_kalori = 2050) = 4,
    'target hari mendatang ikut berubah walau penerapannya ditolak';
end $$;

-- 11. Pembulatan 50 kkal menyisakan selisih, dan sisanya dinyatakan, bukan
--     dibuang. Pekan 14–20 Sep dengan "hari ini" Rabu 16:
--       terpakai 7.810 · sisa 9.340 · target_mendatang 9.800 → perlu −460
--       −460 ÷ 4 = −115/hari → 2450 − 115 = 2335 → dibulatkan 2350 (−100)
--       terserap −400, tersisa −60 (belum tertutup)
do $$
declare h jsonb; v_id uuid;
begin
  select id into v_id from public.day_types
   where user_id = 'ffff3333-0000-0000-0000-000000000003' and nama = 'Rest';
  perform public.setel_tipe_hari(date '2026-09-14', v_id);
  perform public.setel_tipe_hari(date '2026-09-15', v_id);
  perform public.setel_tipe_hari(date '2026-09-16', v_id);
  update public.daily_logs set kalori = 2600 where tanggal = date '2026-09-14';
  update public.daily_logs set kalori = 2600 where tanggal = date '2026-09-15';
  update public.daily_logs set kalori = 2610 where tanggal = date '2026-09-16';

  h := public.hitung_redistribusi(date '2026-09-16', 'sebar_rata', null, date '2026-09-16');
  assert (h->>'perlu_dipindah')::int = -460,
    format('perlu_dipindah = %s, seharusnya -460', h->>'perlu_dipindah');
  assert (h->'hari'->0->>'target_baru')::int = 2350,
    format('target baru = %s, seharusnya 2350 (kelipatan 50)', h->'hari'->0->>'target_baru');
  assert (h->>'terserap')::int = -400, format('terserap = %s, seharusnya -400', h->>'terserap');
  assert (h->>'tersisa')::int = -60,
    format('tersisa = %s, seharusnya -60 — sisanya harus dinyatakan', h->>'tersisa');

  -- Pekan lain punya kuotanya sendiri.
  h := public.terapkan_redistribusi(date '2026-09-16', 'sebar_rata', null, date '2026-09-16');
  assert (h->>'diterapkan')::boolean, 'pekan lain seharusnya masih boleh diterapkan';
  assert (select count(*) from public.redistribusi_mingguan) = 2,
    'seharusnya ada dua penerapan di dua pekan berbeda';
end $$;

-- 12. Pekan tanpa hari tersisa tidak bisa diatur, dan tidak menulis apa pun.
do $$
declare h jsonb; n integer;
begin
  select count(*) into n from public.redistribusi_mingguan;
  h := public.terapkan_redistribusi(date '2026-09-21', 'sebar_rata', null, date '2026-09-27');
  assert (h->>'sebab') = 'tanpa hari tersisa', format('sebab = %s', h->>'sebab');
  assert not (h->>'diterapkan')::boolean, 'seharusnya tidak diterapkan';
  assert (select count(*) from public.redistribusi_mingguan) = n, 'jejak baru tercatat';
end $$;

-- 13. Isolasi: pengguna lain tidak melihat jejak maupun target pengguna A.
reset role;
set request.jwt.claim.sub = 'ffff4444-0000-0000-0000-000000000004';
set role authenticated;

do $$
declare h jsonb;
begin
  assert (select count(*) from public.redistribusi_mingguan) = 0,
    'pengguna lain bisa melihat jejak redistribusi orang';
  assert (select count(*) from public.redistribusi_hari) = 0,
    'pengguna lain bisa melihat jejak harian orang';

  h := public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
  -- Pengguna B belum makan apa pun: seluruh jatah masih utuh, jadi tidak ada
  -- yang perlu dipindah.
  assert (h->>'diterapkan')::boolean is not true or (h->>'terserap')::int <> 0,
    'hasil pengguna B tidak konsisten dengan datanya sendiri';
end $$;

do $$
begin
  reset role;
  assert (select count(*) from public.daily_logs
           where user_id = 'ffff3333-0000-0000-0000-000000000003'
             and tanggal between date '2026-09-24' and date '2026-09-27'
             and target_kalori = 2050) = 4,
    'target pengguna A berubah setelah pengguna B menerapkan redistribusi';
end $$;

-- 14. Tanpa sesi login tidak ada yang bisa dihitung maupun diterapkan.
reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.hitung_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
    assert false, 'hitung tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;
  begin
    perform public.terapkan_redistribusi(date '2026-09-23', 'sebar_rata', null, date '2026-09-23');
    assert false, 'terapkan tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then
    null;
  end;
end $$;

-- 15. Peran anon tidak boleh menjalankan keduanya.
do $$
begin
  assert not has_function_privilege('anon',
    'public.hitung_redistribusi(date, public.opsi_redistribusi, date, date)', 'execute'),
    'anon masih boleh menghitung redistribusi';
  assert not has_function_privilege('anon',
    'public.terapkan_redistribusi(date, public.opsi_redistribusi, date, date, text)', 'execute'),
    'anon masih boleh menerapkan redistribusi';
  assert has_function_privilege('authenticated',
    'public.terapkan_redistribusi(date, public.opsi_redistribusi, date, date, text)', 'execute'),
    'authenticated seharusnya boleh menerapkan redistribusi';
end $$;

select '✓ redistribusi: pratinjau tidak menulis, sekali per pekan, lantai dari profil ditegakkan, protein & hari lampau utuh' as hasil;
