-- =============================================================================
-- API simpan & muat target per tipe hari
--
-- Dua RPC untuk layar Target harian dan penyedia target di app:
--
--   muat_target()            → tipe hari + SELURUH target (tiap tipe hari x
--                              tiap fase) dalam satu snapshot. Satu panggilan,
--                              bukan dua, supaya daftar tipe hari dan targetnya
--                              tidak pernah terbaca dari dua saat berbeda.
--
--   simpan_target(perubahan) → upsert beberapa target sekaligus, SEMUA ATAU
--                              TIDAK SAMA SEKALI (satu transaksi), lalu
--                              menyegarkan snapshot hari ini & ke depan.
--
-- Aturan isian (rentang, sat fat <= lemak, protein+lemak <= kalori, tipe hari
-- milik sendiri) dijaga tabelnya sendiri — lihat skema_target_preferensi.
-- RPC ini menambah yang tidak bisa dijaga satu baris: kelengkapan isian,
-- butir ganda dalam satu permintaan, dan pesan yang terbaca.
--
-- "Berlaku mulai hari ini": hari yang sudah lewat memegang snapshot-nya
-- (`daily_logs.target_*`), jadi menyunting target tidak menulis ulang sisa
-- kalori tiga pekan lalu. Hari ini dan hari mendatang yang SUDAH punya baris
-- ikut disegarkan — kecuali hari yang kalorinya sudah diredistribusi: angka
-- redistribusi itu diterapkan sadar oleh pengguna, dan menimpanya diam-diam
-- (atau menurunkan proteinnya, yang dijaga `jaga_protein_redistribusi`)
-- bukan hak penyuntingan target. Jumlah hari itu dikembalikan supaya app
-- bisa mengatakannya.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- muat_target
-- ---------------------------------------------------------------------------
create or replace function public.muat_target()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'tipe_hari', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', d.id, 'nama', d.nama, 'auto_detect', d.auto_detect,
                 'is_default', d.is_default, 'urutan', d.urutan)
               order by d.urutan, d.nama)
        from public.day_types d
       where d.user_id = v_user_id
    ), '[]'::jsonb),
    'target', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', t.id, 'day_type_id', t.day_type_id, 'fase', t.fase,
                 'target_kalori', t.target_kalori, 'target_protein_g', t.target_protein_g,
                 'target_lemak_g', t.target_lemak_g, 'batas_sat_fat_g', t.batas_sat_fat_g,
                 'updated_at', t.updated_at)
               order by t.day_type_id, t.fase)
        from public.day_type_targets t
       where t.user_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.muat_target() is
  'Tipe hari dan seluruh target (tiap tipe hari x tiap fase) milik pengguna, dalam satu snapshot.';

-- ---------------------------------------------------------------------------
-- simpan_target
-- ---------------------------------------------------------------------------
create or replace function public.simpan_target(p_perubahan jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_tersimpan jsonb;
  v_disegarkan integer := 0;
  v_tetap integer := 0;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if p_perubahan is null or jsonb_typeof(p_perubahan) <> 'array' or jsonb_array_length(p_perubahan) = 0 then
    raise exception 'Tidak ada target untuk disimpan' using errcode = '22023';
  end if;
  -- 4 tipe hari x 3 fase = 12 di awal; 100 memberi ruang tipe hari tambahan
  -- tanpa membuka pintu untuk permintaan raksasa.
  if jsonb_array_length(p_perubahan) > 100 then
    raise exception 'Paling banyak 100 target sekali simpan' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_perubahan) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Setiap butir perubahan harus berupa objek' using errcode = '22023';
  end if;

  -- Kolom yang tidak disebut akan terbaca NULL: target setengah jadi ditolak
  -- utuh, bukan diisi angka karangan.
  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(
             day_type_id uuid, fase public.fase_program, target_kalori integer,
             target_protein_g numeric, target_lemak_g numeric, batas_sat_fat_g numeric)
     where x.day_type_id is null or x.fase is null or x.target_kalori is null
        or x.target_protein_g is null or x.target_lemak_g is null or x.batas_sat_fat_g is null
  ) then
    raise exception 'Setiap target butuh tipe hari, fase, kalori, protein, lemak, dan batas sat fat'
      using errcode = '22023';
  end if;

  -- Dua butir untuk (tipe hari x fase) yang sama: yang mana yang dimaksud?
  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program)
     group by x.day_type_id, x.fase
    having count(*) > 1
  ) then
    raise exception 'Satu tipe hari dan fase disebut lebih dari sekali' using errcode = '22023';
  end if;

  -- Pesan yang terbaca lebih dulu; FK komposit tetap penjaga terakhirnya.
  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid)
     where not exists (
       select 1 from public.day_types d where d.id = x.day_type_id and d.user_id = v_user_id)
  ) then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  with tersimpan as (
    insert into public.day_type_targets (
      user_id, day_type_id, fase,
      target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g
    )
    select v_user_id, x.day_type_id, x.fase,
           x.target_kalori, x.target_protein_g, x.target_lemak_g, x.batas_sat_fat_g
      from jsonb_to_recordset(p_perubahan) as x(
             day_type_id uuid, fase public.fase_program, target_kalori integer,
             target_protein_g numeric, target_lemak_g numeric, batas_sat_fat_g numeric)
    on conflict (day_type_id, fase) do update
      set target_kalori    = excluded.target_kalori,
          target_protein_g = excluded.target_protein_g,
          target_lemak_g   = excluded.target_lemak_g,
          batas_sat_fat_g  = excluded.batas_sat_fat_g
    returning *
  )
  select jsonb_agg(
           jsonb_build_object(
             'id', t.id, 'day_type_id', t.day_type_id, 'fase', t.fase,
             'target_kalori', t.target_kalori, 'target_protein_g', t.target_protein_g,
             'target_lemak_g', t.target_lemak_g, 'batas_sat_fat_g', t.batas_sat_fat_g,
             'updated_at', t.updated_at)
           order by t.day_type_id, t.fase)
    into v_tersimpan
    from tersimpan t;

  -- Berlaku mulai hari ini: snapshot hari ini & mendatang yang sudah ada.
  update public.daily_logs l
     set target_kalori    = t.target_kalori,
         target_protein_g = t.target_protein_g,
         target_lemak_g   = t.target_lemak_g,
         batas_sat_fat_g  = t.batas_sat_fat_g
    from public.day_type_targets t
   where t.user_id = v_user_id
     and (t.day_type_id, t.fase) in (
       select x.day_type_id, x.fase
         from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program))
     and l.user_id = v_user_id
     and l.tanggal >= v_hari_ini
     and l.day_type_id = t.day_type_id
     and coalesce(l.fase, public.fase_pada_tanggal(l.tanggal)) = t.fase
     and l.target_asli_kalori is null;
  get diagnostics v_disegarkan = row_count;

  select count(*)::integer into v_tetap
    from public.daily_logs l
    join jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program)
      on x.day_type_id = l.day_type_id
     and x.fase = coalesce(l.fase, public.fase_pada_tanggal(l.tanggal))
   where l.user_id = v_user_id
     and l.tanggal >= v_hari_ini
     and l.target_asli_kalori is not null;

  return jsonb_build_object(
    'target', v_tersimpan,
    'berlaku_mulai', v_hari_ini,
    'hari_disegarkan', v_disegarkan,
    'hari_diredistribusi_tetap', v_tetap
  );
end;
$$;

comment on function public.simpan_target(jsonb) is
  'Upsert beberapa target (tipe hari x fase) sekaligus, semua atau tidak sama sekali. '
  'Berlaku mulai hari ini; hari lewat dan hari yang sudah diredistribusi tidak disentuh.';

-- --- Hak akses -------------------------------------------------------------
revoke all on function public.muat_target() from public;
revoke all on function public.simpan_target(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.muat_target() from anon';
    execute 'revoke all on function public.simpan_target(jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.muat_target() to authenticated';
    execute 'grant execute on function public.simpan_target(jsonb) to authenticated';
  end if;
end $$;
