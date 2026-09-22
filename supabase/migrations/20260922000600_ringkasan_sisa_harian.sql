-- =============================================================================
-- Ringkasan sisa harian
--
-- Angka "sisa" dihitung DI SERVER, bukan hanya di klien. Alasannya ada di PRD:
-- widget lock screen membaca angka yang dihitung server karena WidgetKit tidak
-- bisa menjalankan paket TypeScript bersama.
--
-- Aturannya sengaja dibuat sama persis dengan `src/lib/makro.ts`:
--   • sisa = target − terpakai  (boleh negatif)
--   • sat fat adalah BATAS, bukan sasaran; `sat_fat_terlampaui` menandainya
--   • karbo tidak ditargetkan, jadi tidak punya sisa
-- Kalau salah satu sisi diubah, sisi lainnya harus ikut.
-- =============================================================================

create or replace function public.ringkasan_sisa_harian(p_tanggal date)
returns table (
  tanggal date,
  nama_tipe_hari text,
  fase public.fase_program,
  berat_pagi_kg numeric,
  sumber_berat public.sumber_berat,

  terpakai_kalori integer,
  terpakai_protein_g numeric,
  terpakai_lemak_g numeric,
  terpakai_karbo_g numeric,
  terpakai_sat_fat_g numeric,

  target_kalori integer,
  target_protein_g numeric,
  target_lemak_g numeric,
  batas_sat_fat_g numeric,

  -- Boleh negatif: negatif berarti sudah melewati target/batas.
  sisa_kalori integer,
  sisa_protein_g numeric,
  sisa_lemak_g numeric,
  sisa_sat_fat_g numeric,

  -- Penanda fakta, bukan peringatan; nada UI-nya tetap netral.
  sat_fat_terlampaui boolean,
  kalori_terlampaui boolean,

  catatan text,
  jumlah_entri integer,
  jumlah_estimasi integer
)
language sql
stable
set search_path = ''
as $$
  select
    r.tanggal,
    r.nama_tipe_hari,
    r.fase,
    r.berat_pagi_kg,
    r.sumber_berat,

    r.kalori,
    r.protein_g,
    r.lemak_g,
    r.karbo_g,
    r.sat_fat_g,

    r.target_kalori,
    r.target_protein_g,
    r.target_lemak_g,
    r.batas_sat_fat_g,

    r.target_kalori    - r.kalori,
    r.target_protein_g - r.protein_g,
    r.target_lemak_g   - r.lemak_g,
    r.batas_sat_fat_g  - r.sat_fat_g,

    -- NULL target berarti "tidak ditargetkan", bukan "terlampaui".
    coalesce(r.sat_fat_g > r.batas_sat_fat_g, false),
    coalesce(r.kalori > r.target_kalori, false),

    r.catatan,
    r.jumlah_entri,
    r.jumlah_estimasi
  from public.ringkasan_harian(p_tanggal) r;
$$;

comment on function public.ringkasan_sisa_harian(date) is
  'Ringkasan satu hari beserta SISA tiap makro. Aturannya dijaga sama dengan '
  'src/lib/makro.ts; kalau satu sisi diubah, sisi lain harus ikut.';

-- ---------------------------------------------------------------------------
-- Rata-rata berat 7 hari — dasar layar Tren dan konteks AI coach.
--
-- Memakai rata-rata bergerak atas hari yang BENAR-BENAR ditimbang dalam
-- jendela 7 hari; hari yang terlewat tidak dianggap nol (itu akan menarik
-- rata-rata turun secara palsu), melainkan dilewati.
-- ---------------------------------------------------------------------------
create or replace function public.rata_rata_berat_7_hari(p_tanggal date)
returns table (
  tanggal date,
  rata_rata_kg numeric,
  jumlah_timbangan integer
)
language sql
stable
set search_path = ''
as $$
  select
    p_tanggal,
    round(avg(berat_pagi_kg), 2),
    count(*)::integer
  from public.daily_logs
  where user_id = (select auth.uid())
    and berat_pagi_kg is not null
    and tanggal > p_tanggal - 7
    and tanggal <= p_tanggal;
$$;

comment on function public.rata_rata_berat_7_hari(date) is
  'Rata-rata berat pagi dalam jendela 7 hari yang berakhir di tanggal tersebut. '
  'Hari tanpa timbangan dilewati, bukan dihitung nol.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.ringkasan_sisa_harian(date) from public;
revoke all on function public.rata_rata_berat_7_hari(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ringkasan_sisa_harian(date) to authenticated';
    execute 'grant execute on function public.rata_rata_berat_7_hari(date) to authenticated';
  end if;
end $$;
