-- =============================================================================
-- Mutation simpan target: berlaku mulai hari ini dari JALAN MANA PUN, dan
-- tidak menimpa perubahan yang belum terlihat
--
-- 1. Penyegaran snapshot pindah ke pemicu tabel. Sebelumnya hanya
--    `simpan_target` yang menyegarkan snapshot hari ini: target yang diubah
--    lewat jalan lain (web memakai tabel yang sama, atau UPDATE langsung
--    lewat PostgREST) meninggalkan sisa kalori hari ini pada angka lama.
--    Kini setiap INSERT/UPDATE angka target menyegarkan snapshot hari ini &
--    mendatang yang sudah tercatat — tetap tidak menyentuh hari yang sudah
--    lewat maupun hari yang kalorinya sudah diredistribusi.
--
-- 2. Konkurensi optimistis. Target yang sama bisa disunting di web dan di
--    ponsel. Tiap butir `simpan_target` boleh membawa `diperbarui_pada` —
--    waktu baris itu terakhir berubah saat klien memuatnya. Bila barisnya
--    sudah berubah lagi sejak itu, SELURUH simpanan ditolak (40001) dan
--    klien memuat ulang, alih-alih diam-diam menimpa angka dari perangkat
--    lain. Butir tanpa `diperbarui_pada` tetap diterima seperti sebelumnya.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pemicu penyegaran snapshot
-- ---------------------------------------------------------------------------
create or replace function public.segarkan_snapshot_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.daily_logs l
     set target_kalori    = new.target_kalori,
         target_protein_g = new.target_protein_g,
         target_lemak_g   = new.target_lemak_g,
         batas_sat_fat_g  = new.batas_sat_fat_g
   where l.user_id = new.user_id
     and l.tanggal >= (now() at time zone 'Asia/Jakarta')::date
     and l.day_type_id = new.day_type_id
     and (l.fase = new.fase or (l.fase is null and public.fase_pada_tanggal(l.tanggal) = new.fase))
     -- Hari yang diredistribusi memegang angka redistribusinya.
     and l.target_asli_kalori is null
     and (l.target_kalori, l.target_protein_g, l.target_lemak_g, l.batas_sat_fat_g)
         is distinct from (new.target_kalori, new.target_protein_g, new.target_lemak_g, new.batas_sat_fat_g);
  return null;
end;
$$;

comment on function public.segarkan_snapshot_target() is
  'Target berubah → snapshot hari ini & mendatang ikut, dari jalan tulis mana pun. '
  'Hari lewat dan hari yang diredistribusi tidak disentuh.';

drop trigger if exists day_type_targets_segarkan_snapshot on public.day_type_targets;
create trigger day_type_targets_segarkan_snapshot
  after insert or update of target_kalori, target_protein_g, target_lemak_g, batas_sat_fat_g, fase, day_type_id
  on public.day_type_targets
  for each row execute function public.segarkan_snapshot_target();

-- Fungsi pemicu tidak dipanggil klien.
revoke all on function public.segarkan_snapshot_target() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.segarkan_snapshot_target() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.segarkan_snapshot_target() from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. simpan_target: konkurensi optimistis; penyegaran lewat pemicu di atas
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
  if jsonb_array_length(p_perubahan) > 100 then
    raise exception 'Paling banyak 100 target sekali simpan' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_perubahan) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Setiap butir perubahan harus berupa objek' using errcode = '22023';
  end if;

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

  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program)
     group by x.day_type_id, x.fase
    having count(*) > 1
  ) then
    raise exception 'Satu tipe hari dan fase disebut lebih dari sekali' using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid)
     where not exists (
       select 1 from public.day_types d where d.id = x.day_type_id and d.user_id = v_user_id)
  ) then
    raise exception 'Tipe hari tidak ditemukan' using errcode = '23503';
  end if;

  -- Kunci baris yang akan diubah, lalu periksa tidak ada yang berubah sejak
  -- klien memuatnya. Dikunci lebih dulu supaya tidak ada simpanan lain yang
  -- menyelinap di antara pemeriksaan dan penulisan.
  perform 1
     from public.day_type_targets t
     join jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program)
       on x.day_type_id = t.day_type_id and x.fase = t.fase
    where t.user_id = v_user_id
      for update of t;

  if exists (
    select 1
      from jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program, diperbarui_pada timestamptz)
      join public.day_type_targets t
        on t.day_type_id = x.day_type_id and t.fase = x.fase and t.user_id = v_user_id
     where x.diperbarui_pada is not null
       and t.updated_at is distinct from x.diperbarui_pada
  ) then
    raise exception 'Target ini sudah diubah di tempat lain sejak dimuat' using errcode = '40001';
  end if;

  -- Penyegaran snapshot hari ini & mendatang terjadi di pemicu
  -- day_type_targets_segarkan_snapshot, sama seperti jalan tulis lainnya.
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

  -- Hari yang kini memakai target baru, dan yang tetap memakai redistribusinya.
  select count(*) filter (where l.target_asli_kalori is null)::integer,
         count(*) filter (where l.target_asli_kalori is not null)::integer
    into v_disegarkan, v_tetap
    from public.daily_logs l
    join jsonb_to_recordset(p_perubahan) as x(day_type_id uuid, fase public.fase_program)
      on x.day_type_id = l.day_type_id
     and x.fase = coalesce(l.fase, public.fase_pada_tanggal(l.tanggal))
   where l.user_id = v_user_id
     and l.tanggal >= v_hari_ini;

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
  'Butir boleh membawa diperbarui_pada: bila baris sudah berubah sejak itu, ditolak 40001. '
  'Berlaku mulai hari ini lewat pemicu segarkan_snapshot_target.';
