-- ---------------------------------------------------------------------------
-- Deret rata-rata bergerak 7 hari — sumber tunggal layar Tren.
--
-- `rata_rata_berat_7_hari(date)` yang sudah ada hanya menjawab SATU tanggal.
-- Layar Tren menggambar 30–90 titik sekaligus, dan memanggil fungsi itu sekali
-- per titik berarti puluhan round-trip untuk satu layar — di jaringan seluler
-- itu perbedaan antara grafik yang muncul seketika dan grafik yang mengisi
-- dirinya sepotong-sepotong.
--
-- Aturan perhitungannya sengaja SAMA PERSIS dengan `rataRata7Hari` di
-- `@recomp/logika`: jendela 7 hari yang berakhir di tanggal itu, hari tanpa
-- timbangan DILEWATI (bukan dihitung nol, karena itu akan menarik rata-rata
-- turun secara palsu), dan hasilnya dibulatkan ke 2 desimal. Kesamaan itu
-- dijaga mesin lewat `npm run cek:paritas`, bukan lewat kehati-hatian.
-- ---------------------------------------------------------------------------

-- Rentang terpanjang yang boleh diminta sekali jalan. Tanpa batas ini, satu
-- permintaan iseng bisa memindai seluruh riwayat pengguna sebanyak jumlah
-- harinya.
create or replace function public.deret_rata_rata_7_hari(
  p_dari date,
  p_sampai date
)
returns table (
  tanggal date,
  rata_rata_kg numeric,
  jumlah_timbangan integer,
  berat_harian_kg numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_maks_hari constant integer := 400;
begin
  if p_dari is null or p_sampai is null then
    raise exception 'Rentang tanggal tidak boleh kosong' using errcode = '22004';
  end if;

  if p_dari > p_sampai then
    raise exception 'Tanggal awal (%) melewati tanggal akhir (%)', p_dari, p_sampai
      using errcode = '22007';
  end if;

  if p_sampai - p_dari > v_maks_hari then
    raise exception 'Rentang maksimum % hari; diminta % hari', v_maks_hari, p_sampai - p_dari
      using errcode = '22003';
  end if;

  return query
  with hari as (
    select d::date as tanggal
    from generate_series(p_dari, p_sampai, interval '1 day') as d
  ),
  -- Jendela pertama butuh 6 hari SEBELUM p_dari; tanpa itu titik-titik awal
  -- akan memakai jendela yang tidak lengkap dan terbaca lebih rendah.
  timbangan as (
    select l.tanggal, l.berat_pagi_kg
    from public.daily_logs l
    where l.user_id = (select auth.uid())
      and l.berat_pagi_kg is not null
      and l.tanggal > p_dari - 7
      and l.tanggal <= p_sampai
  )
  select
    h.tanggal,
    (
      select round(avg(t.berat_pagi_kg), 2)
      from timbangan t
      where t.tanggal > h.tanggal - 7 and t.tanggal <= h.tanggal
    ),
    (
      select count(*)::integer
      from timbangan t
      where t.tanggal > h.tanggal - 7 and t.tanggal <= h.tanggal
    ),
    (select t.berat_pagi_kg from timbangan t where t.tanggal = h.tanggal)
  from hari h
  order by h.tanggal;
end;
$$;

comment on function public.deret_rata_rata_7_hari(date, date) is
  'Deret rata-rata bergerak 7 hari beserta berat harian mentahnya, satu baris '
  'per tanggal dalam rentang. Hari tanpa timbangan dilewati, bukan dihitung nol. '
  'Aturannya identik dengan rataRata7Hari/deretTren di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.deret_rata_rata_7_hari(date, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.deret_rata_rata_7_hari(date, date) to authenticated';
  end if;
end $$;
