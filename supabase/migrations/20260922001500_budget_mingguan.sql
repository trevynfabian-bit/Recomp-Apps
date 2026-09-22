-- ---------------------------------------------------------------------------
-- Budget kalori mingguan.
--
-- Budget mingguan BUKAN angka tetap: ia jumlah target harian sepanjang pekan,
-- dan target harian bergantung tipe hari. Pekan berisi dua hari Beban+Lari
-- punya budget lebih besar daripada pekan penuh Rest — itu memang yang
-- diinginkan, bukan kebocoran.
--
-- Tiga aturan yang harus sama persis dengan `budgetMingguan`/`lajuBudget` di
-- @recomp/logika, dan ketiganya gampang salah:
--
-- 1. TOTAL memakai `target_asli_kalori` bila ada, tapi LAJU memakai target
--    yang berlaku. Kalau total ikut turun saat target dipotong redistribusi,
--    defisit pekan tidak pernah berkurang dan fiturnya membatalkan dirinya
--    sendiri; sebaliknya kalau laju dibandingkan dengan target asli, hari yang
--    sudah dipotong akan selalu terbaca "lebih lambat".
-- 2. HARI INI tidak dihitung sebagai hari tersisa. Konsumsi hari ini sudah
--    ikut dikurangkan dari sisa; memberinya jatah lagi berarti menghitungnya
--    dua kali dan membuat "bila dibagi rata" tampak lebih longgar daripada
--    yang sebenarnya.
-- 3. Laju dibandingkan dengan jumlah TARGET hari yang sudah berjalan, bukan
--    proporsi hari (3 dari 7). Target harian berbeda-beda, jadi proporsi hari
--    menyesatkan pada pekan yang hari beratnya menumpuk di awal atau akhir.
--
-- Pekan acuan dan "hari ini" sengaja DIPISAH jadi dua argumen. Tanpa itu,
-- pekan yang seluruhnya masih di depan tidak bisa diminta sama sekali, dan
-- status `belum mulai` — yang ada di TypeScript — jadi tidak pernah tercapai
-- lewat RPC.
-- ---------------------------------------------------------------------------

create or replace function public.budget_mingguan(
  p_tanggal date default null,
  p_hari_ini date default null,
  p_ambang_kcal integer default 300
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date := coalesce(p_hari_ini, (now() at time zone 'Asia/Jakarta')::date);
  v_acuan date := coalesce(p_tanggal, v_hari_ini);
  v_senin date;
  v_rincian jsonb;
  v_budget_total integer;
  v_terpakai integer;
  v_target_mendatang integer;
  v_hari_tersisa integer;
  v_hari_berjalan integer;
  v_seharusnya integer;
  v_selisih integer;
  v_status_laju text;
  v_sisa integer;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_ambang_kcal is null or p_ambang_kcal < 0 then
    raise exception 'Ambang laju tidak boleh negatif' using errcode = '22003';
  end if;

  v_senin := public.awal_minggu(v_acuan);

  with hari as (
    select (v_senin + i)::date as tanggal from generate_series(0, 6) as i
  ),
  -- Tipe hari BAWAAN dipakai untuk hari yang belum punya baris sama sekali;
  -- tanpa ini, hari mendatang ber-target nol dan budget pekan terlihat jauh
  -- lebih kecil daripada rencananya.
  bawaan as (
    select d.id from public.day_types d
     where d.user_id = v_user_id and d.is_default
     limit 1
  ),
  isi as (
    select
      h.tanggal,
      coalesce(l.day_type_id, (select id from bawaan)) as day_type_id,
      l.target_kalori as snap_kalori,
      l.target_asli_kalori,
      l.target_protein_g as snap_protein,
      coalesce(l.kalori, 0) as terpakai_kalori,
      coalesce(l.protein_g, 0) as terpakai_protein_g,
      case
        when h.tanggal < v_hari_ini then 'lampau'
        when h.tanggal = v_hari_ini then 'hari ini'
        else 'mendatang'
      end as status
    from hari h
    left join public.daily_logs l
      on l.user_id = v_user_id and l.tanggal = h.tanggal
  ),
  lengkap as (
    select
      i.*,
      dt.nama as nama_tipe_hari,
      -- Snapshot menang; kalau belum ada, pakai target berlaku untuk fase
      -- yang berlaku PADA TANGGAL ITU.
      coalesce(i.snap_kalori, t.target_kalori, 0) as target_kalori,
      coalesce(i.snap_protein, t.target_protein_g, 0) as target_protein_g
    from isi i
    left join public.day_types dt on dt.id = i.day_type_id
    left join public.day_type_targets t
      on t.day_type_id = i.day_type_id
     and t.fase = public.fase_pada_tanggal(i.tanggal)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tanggal', l.tanggal,
          'nama_tipe_hari', l.nama_tipe_hari,
          'target_kalori', l.target_kalori,
          'target_asli_kalori', l.target_asli_kalori,
          'target_protein_g', l.target_protein_g,
          'terpakai_kalori', l.terpakai_kalori,
          'terpakai_protein_g', l.terpakai_protein_g,
          'status', l.status,
          -- Selisih hanya bermakna untuk hari yang sudah/sedang berjalan.
          'selisih', case when l.status = 'mendatang' then null
                          else l.terpakai_kalori - l.target_kalori end
        )
        order by l.tanggal
      ),
      '[]'::jsonb
    ),
    coalesce(sum(coalesce(l.target_asli_kalori, l.target_kalori)), 0)::integer,
    coalesce(sum(l.terpakai_kalori) filter (where l.status <> 'mendatang'), 0)::integer,
    coalesce(sum(l.target_kalori) filter (where l.status = 'mendatang'), 0)::integer,
    count(*) filter (where l.status = 'mendatang')::integer,
    count(*) filter (where l.status <> 'mendatang')::integer,
    -- Pembanding laju: target hari yang SUDAH berjalan, bukan target asli.
    coalesce(sum(l.target_kalori) filter (where l.status <> 'mendatang'), 0)::integer
  into
    v_rincian, v_budget_total, v_terpakai, v_target_mendatang,
    v_hari_tersisa, v_hari_berjalan, v_seharusnya
  from lengkap l;

  v_sisa := v_budget_total - v_terpakai;

  if v_hari_berjalan = 0 then
    -- Seluruh pekan masih di depan: belum ada apa pun untuk dibandingkan.
    v_seharusnya := 0;
    v_selisih := 0;
    v_status_laju := 'belum mulai';
  else
    v_selisih := v_terpakai - v_seharusnya;
    if abs(v_selisih) <= p_ambang_kcal then
      v_status_laju := 'sesuai laju';
    elsif v_selisih > 0 then
      v_status_laju := 'lebih cepat';
    else
      v_status_laju := 'lebih lambat';
    end if;
  end if;

  return jsonb_build_object(
    'minggu_mulai', v_senin,
    'hari_ini', v_hari_ini,
    'budget_total', v_budget_total,
    'terpakai', v_terpakai,
    'sisa', v_sisa,
    'hari_tersisa', v_hari_tersisa,
    'target_mendatang', v_target_mendatang,
    -- floor(x + 0,5), BUKAN round(). `Math.round` di JavaScript membulatkan
    -- setengah ke arah plus tak hingga, sedangkan `round()` di Postgres
    -- membulatkan setengah menjauhi nol. Keduanya sama untuk angka positif dan
    -- BERBEDA untuk negatif — dan `sisa` memang boleh negatif saat jatah pekan
    -- sudah terlampaui, jadi perbedaannya bukan kasus khayalan.
    'sisa_per_hari', case when v_hari_tersisa > 0
                          then floor(v_sisa::numeric / v_hari_tersisa + 0.5)::integer end,
    'rencana_per_hari', case when v_hari_tersisa > 0
                             then floor(v_target_mendatang::numeric / v_hari_tersisa + 0.5)::integer end,
    'laju', jsonb_build_object(
      'seharusnya', v_seharusnya,
      'selisih', v_selisih,
      'status', v_status_laju,
      'ambang_kcal', p_ambang_kcal
    ),
    'rincian', v_rincian
  );
end;
$$;

comment on function public.budget_mingguan(date, date, integer) is
  'Budget kalori pekan yang memuat tanggal acuan: rincian tujuh hari, total, '
  'sisa, dan status laju. Aturannya identik dengan budgetMingguan/lajuBudget '
  'di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.budget_mingguan(date, date, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.budget_mingguan(date, date, integer) to authenticated';
  end if;
end $$;
