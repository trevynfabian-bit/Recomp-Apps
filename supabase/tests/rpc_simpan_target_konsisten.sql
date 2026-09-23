-- =============================================================================
-- Uji mutation simpan target: berlaku mulai hari ini dari jalan tulis mana pun
-- (termasuk UPDATE langsung seperti web), dan konkurensi optimistis yang
-- menolak menimpa perubahan dari perangkat lain.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email) values ('51a40001-0000-4000-8000-000000000001', 'simpan-ani@contoh.test')
on conflict do nothing;

set request.jwt.claim.sub = '51a40001-0000-4000-8000-000000000001';
set role authenticated;

-- Kemarin, hari ini, besok (diredistribusi) — semuanya Rest.
do $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
begin
  perform public.setel_tipe_hari(v_hari_ini - 1, v_rest);
  perform public.setel_tipe_hari(v_hari_ini, v_rest);
  perform public.setel_tipe_hari(v_hari_ini + 1, v_rest);
  update public.daily_logs set target_asli_kalori = target_kalori, target_kalori = target_kalori - 150
   where tanggal = v_hari_ini + 1;
end $$;

-- 1. UPDATE langsung ke tabel (jalan web): hari ini ikut, kemarin & hari
--    yang diredistribusi tidak.
do $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_fase public.fase_program := (select fase_aktif from public.profiles);
  v_kemarin integer := (select target_kalori from public.daily_logs where tanggal = v_hari_ini - 1);
  v_besok integer := (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 1);
begin
  update public.day_type_targets set target_kalori = 2525, target_protein_g = 172
   where day_type_id = v_rest and fase = v_fase;
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini) = 2525, 'hari ini ikut UPDATE langsung';
  assert (select target_protein_g from public.daily_logs where tanggal = v_hari_ini) = 172, 'protein hari ini ikut';
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini - 1) = v_kemarin, 'kemarin tersentuh';
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini + 1) = v_besok, 'hari yang diredistribusi tersentuh';

  -- Fase lain tidak menyentuh snapshot hari ini.
  update public.day_type_targets set target_kalori = 2111
   where day_type_id = v_rest and fase <> v_fase and fase = (select min(f) from unnest(enum_range(null::public.fase_program)) f where f <> v_fase);
  assert (select target_kalori from public.daily_logs where tanggal = v_hari_ini) = 2525, 'target fase lain mengubah hari ini';
end $$;

-- 2. Konkurensi optimistis.
do $$
declare
  v_rest uuid := (select id from public.day_types where nama = 'Rest');
  v_padel uuid := (select id from public.day_types where nama = 'Padel');
  v_fase public.fase_program := (select fase_aktif from public.profiles);
  v_dimuat timestamptz := (select updated_at from public.day_type_targets where day_type_id = v_rest and fase = v_fase);
  v_padel_lama integer := (select target_kalori from public.day_type_targets where day_type_id = v_padel and fase = v_fase);
  v_kode text;
  h jsonb;
begin
  -- Klien memuat (v_dimuat), lalu perangkat lain mengubah barisnya.
  perform pg_sleep(0.01);
  update public.day_type_targets set target_kalori = 2540 where day_type_id = v_rest and fase = v_fase;

  -- Simpanan dengan waktu muat lama ditolak — seluruhnya, termasuk butir Padel yang sah.
  begin
    perform public.simpan_target(jsonb_build_array(
      jsonb_build_object('day_type_id', v_rest, 'fase', v_fase, 'diperbarui_pada', v_dimuat,
        'target_kalori', 2600, 'target_protein_g', 170, 'target_lemak_g', 80, 'batas_sat_fat_g', 23),
      jsonb_build_object('day_type_id', v_padel, 'fase', v_fase,
        'target_kalori', 2999, 'target_protein_g', 170, 'target_lemak_g', 80, 'batas_sat_fat_g', 23)));
  exception when others then v_kode := sqlstate;
  end;
  assert v_kode = '40001', format('simpanan basi: kode %s', coalesce(v_kode, 'DITERIMA'));
  assert (select target_kalori from public.day_type_targets where day_type_id = v_rest and fase = v_fase) = 2540,
    'perubahan perangkat lain tertimpa';
  assert (select target_kalori from public.day_type_targets where day_type_id = v_padel and fase = v_fase) = v_padel_lama,
    'butir lain ikut tersimpan walau simpanan ditolak';

  -- Dengan waktu muat terbaru: diterima, dan balasan membawa waktu baru untuk simpanan berikutnya.
  h := public.simpan_target(jsonb_build_array(jsonb_build_object(
    'day_type_id', v_rest, 'fase', v_fase,
    'diperbarui_pada', (select updated_at from public.day_type_targets where day_type_id = v_rest and fase = v_fase),
    'target_kalori', 2600, 'target_protein_g', 170, 'target_lemak_g', 80, 'batas_sat_fat_g', 23)));
  assert (h->'target'->0->>'target_kalori')::int = 2600, 'simpanan terbaru ditolak';
  assert (h->'target'->0->>'updated_at')::timestamptz > v_dimuat, 'balasan tanpa waktu baru';
  assert (h->>'hari_disegarkan')::int = 1 and (h->>'hari_diredistribusi_tetap')::int = 1,
    format('hitungan hari: %s / %s', h->>'hari_disegarkan', h->>'hari_diredistribusi_tetap');
  assert (select target_kalori from public.daily_logs where tanggal = (now() at time zone 'Asia/Jakarta')::date) = 2600,
    'hari ini ikut simpan_target';

  -- Tanpa diperbarui_pada: tetap diterima seperti sebelumnya.
  perform public.simpan_target(jsonb_build_array(jsonb_build_object(
    'day_type_id', v_padel, 'fase', v_fase,
    'target_kalori', 2750, 'target_protein_g', 160, 'target_lemak_g', 80, 'batas_sat_fat_g', 24)));
end $$;

-- 3. Fungsi pemicu tidak bisa dipanggil klien.
reset role;
do $$
begin
  assert not has_function_privilege('authenticated', 'public.segarkan_snapshot_target()', 'execute'),
    'klien bisa memanggil fungsi pemicu';
end $$;

delete from auth.users where id = '51a40001-0000-4000-8000-000000000001';

select '✓ simpan target: berlaku mulai hari ini dari jalan mana pun, perubahan perangkat lain tidak tertimpa' as hasil;
