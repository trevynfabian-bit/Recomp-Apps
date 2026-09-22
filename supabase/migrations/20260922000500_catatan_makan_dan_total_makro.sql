-- =============================================================================
-- Catatan makan & total makro harian
--
-- Keputusan desain: kolom makro di `daily_logs` BUKAN lagi angka yang ditulis
-- klien, melainkan hasil jumlah `food_logs` hari itu yang dijaga trigger.
--
-- Alasannya: bila klien menulis total sendiri sekaligus menyimpan entri
-- makanan, keduanya pasti melenceng cepat atau lambat — satu permintaan gagal
-- di tengah jalan sudah cukup. Dengan trigger, total tidak mungkin berbeda dari
-- isinya.
--
-- Konsekuensinya, "log harian manual" berarti menambah entri makanan bertanda
-- `manual` (boleh tanpa nama rinci), bukan mengetik total. Itu juga yang
-- dilakukan UI-nya.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Hitung ulang total satu hari dari entri makanannya
-- ---------------------------------------------------------------------------
create or replace function public.hitung_ulang_total_makro(p_daily_log_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.daily_logs d
     set kalori    = coalesce(t.kalori, 0),
         protein_g = coalesce(t.protein_g, 0),
         lemak_g   = coalesce(t.lemak_g, 0),
         karbo_g   = coalesce(t.karbo_g, 0),
         sat_fat_g = coalesce(t.sat_fat_g, 0)
    from (
      select
        sum(kalori)    as kalori,
        sum(protein_g) as protein_g,
        sum(lemak_g)   as lemak_g,
        sum(karbo_g)   as karbo_g,
        sum(sat_fat_g) as sat_fat_g
      from public.food_logs
      where daily_log_id = p_daily_log_id
    ) t
   where d.id = p_daily_log_id;
$$;

create or replace function public.trigger_total_makro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- DELETE dan UPDATE menyentuh baris lama; INSERT dan UPDATE menyentuh baris
  -- baru. Saat entri dipindah ke hari lain, KEDUANYA perlu dihitung ulang.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.hitung_ulang_total_makro(old.daily_log_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.hitung_ulang_total_makro(new.daily_log_id);
  end if;
  return null;
end;
$$;

drop trigger if exists food_logs_total_makro on public.food_logs;
create trigger food_logs_total_makro
  after insert or update or delete on public.food_logs
  for each row execute function public.trigger_total_makro();

-- ---------------------------------------------------------------------------
-- Dapatkan (atau buat) baris hari untuk satu tanggal
-- ---------------------------------------------------------------------------
create or replace function public.baris_hari(p_tanggal date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select id into v_id
    from public.daily_logs
   where user_id = v_user_id and tanggal = p_tanggal;

  if v_id is null then
    insert into public.daily_logs (user_id, tanggal)
    values (v_user_id, p_tanggal)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catat satu entri makanan
-- ---------------------------------------------------------------------------
create or replace function public.catat_makanan(
  p_tanggal date,
  p_nama_makanan text,
  p_kalori integer,
  p_protein_g numeric default 0,
  p_lemak_g numeric default 0,
  p_karbo_g numeric default 0,
  p_sat_fat_g numeric default 0,
  -- 'foto_ai' menandai ESTIMASI, 'manual' menandai data mentah.
  p_sumber public.sumber_makanan default 'manual',
  p_foto_url text default null
)
returns public.food_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_daily_log_id uuid;
  v_baris public.food_logs;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if coalesce(btrim(p_nama_makanan), '') = '' then
    raise exception 'Nama makanan tidak boleh kosong' using errcode = '22004';
  end if;

  v_daily_log_id := public.baris_hari(p_tanggal);

  insert into public.food_logs (
    user_id, daily_log_id, nama_makanan, foto_url,
    kalori, protein_g, lemak_g, karbo_g, sat_fat_g, sumber
  )
  values (
    v_user_id, v_daily_log_id, btrim(p_nama_makanan), p_foto_url,
    p_kalori, p_protein_g, p_lemak_g, p_karbo_g, p_sat_fat_g, p_sumber
  )
  returning * into v_baris;

  -- Total harian disegarkan oleh trigger, bukan oleh pemanggil.
  return v_baris;
end;
$$;

comment on function public.catat_makanan(date, text, integer, numeric, numeric, numeric, numeric, public.sumber_makanan, text) is
  'Menambah satu entri makanan pada tanggal tertentu, membuat baris hari bila '
  'belum ada. Total makro harian disegarkan otomatis oleh trigger.';

-- ---------------------------------------------------------------------------
-- Catatan bebas harian
-- ---------------------------------------------------------------------------
create or replace function public.simpan_catatan_harian(
  p_tanggal date,
  p_catatan text
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_daily_log_id uuid := public.baris_hari(p_tanggal);
  v_bersih text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_baris public.daily_logs;
begin
  -- Catatan kosong disimpan sebagai NULL, bukan string kosong, supaya
  -- "belum diisi" dan "sengaja dikosongkan" tidak tertukar.
  update public.daily_logs
     set catatan = v_bersih
   where id = v_daily_log_id
  returning * into v_baris;

  return v_baris;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ringkasan satu hari: total, target, dan berapa yang berupa estimasi
-- ---------------------------------------------------------------------------
create or replace function public.ringkasan_harian(p_tanggal date)
returns table (
  tanggal date,
  berat_pagi_kg numeric,
  sumber_berat public.sumber_berat,
  nama_tipe_hari text,
  fase public.fase_program,
  kalori integer,
  protein_g numeric,
  lemak_g numeric,
  karbo_g numeric,
  sat_fat_g numeric,
  target_kalori integer,
  target_protein_g numeric,
  target_lemak_g numeric,
  batas_sat_fat_g numeric,
  catatan text,
  jumlah_entri integer,
  jumlah_estimasi integer
)
language sql
stable
set search_path = ''
as $$
  select
    p_tanggal,
    l.berat_pagi_kg,
    l.sumber_berat,
    tgt.nama_tipe_hari,
    tgt.fase,
    coalesce(l.kalori, 0),
    coalesce(l.protein_g, 0),
    coalesce(l.lemak_g, 0),
    coalesce(l.karbo_g, 0),
    coalesce(l.sat_fat_g, 0),
    tgt.target_kalori,
    tgt.target_protein_g,
    tgt.target_lemak_g,
    tgt.batas_sat_fat_g,
    l.catatan,
    coalesce(f.jumlah, 0)::integer,
    coalesce(f.estimasi, 0)::integer
  from public.ambil_target_harian(p_tanggal) tgt
  left join public.daily_logs l
    on l.user_id = (select auth.uid()) and l.tanggal = p_tanggal
  left join lateral (
    select
      count(*) as jumlah,
      count(*) filter (where sumber = 'foto_ai') as estimasi
    from public.food_logs
    where daily_log_id = l.id
  ) f on true;
$$;

comment on function public.ringkasan_harian(date) is
  'Satu baris ringkasan hari: total makro, target berlaku, catatan, dan berapa '
  'entri makanan yang berupa estimasi foto AI.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.baris_hari(date)',
    'public.catat_makanan(date, text, integer, numeric, numeric, numeric, numeric, public.sumber_makanan, text)',
    'public.simpan_catatan_harian(date, text)',
    'public.ringkasan_harian(date)',
    'public.hitung_ulang_total_makro(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      -- hitung_ulang_total_makro hanya dipakai trigger, tidak diberikan ke klien.
      if fn <> 'public.hitung_ulang_total_makro(uuid)' then
        execute format('grant execute on function %s to authenticated', fn);
      end if;
    end if;
  end loop;
end $$;
