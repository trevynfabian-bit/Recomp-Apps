-- =============================================================================
-- e1RM Epley di database: kembaran `e1rmEpley` (@recomp/logika)
--
-- PRD: "sistem ... menghitung e1RM". App menghitungnya di TypeScript, tetapi
-- jalur server (evaluasi 4 mingguan, konteks coach, ekspor) tidak punya
-- rumusnya, sehingga sumbu kekuatan di server tidak bisa dibaca dari set
-- Hevy yang sudah tersimpan. Di sini rumusnya dipasang SEKALI, persis sama
-- dengan TypeScript, dan hasilnya disimpan per set sebagai kolom turunan.
--
-- Aturannya (sama dengan `e1rmEpley`):
--   • tanpa beban (berat badan), beban ≤ 0, repetisi < 1 atau > 12 → NULL;
--   • 1 repetisi → bebannya sendiri, dibulatkan satu desimal;
--   • selain itu beban × (1 + reps / 30), dihitung dalam bilangan bulat
--     (gram × (30 + reps), dibagi 3000 untuk persepuluhan kg, dibulatkan
--     setengah ke atas) supaya 6,75 kg × 8 menjadi 8,6 di kedua sisi.
-- Kesamaannya dijaga `npm run cek:paritas` pada kisi beban × repetisi.
-- Aman dijalankan ulang.
-- =============================================================================

create or replace function public.e1rm_epley(p_beban_kg numeric, p_reps integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_beban_kg is null or p_beban_kg <= 0 or p_reps is null or p_reps < 1 or p_reps > 12 then null
    when p_reps = 1 then round(p_beban_kg, 1)
    else floor((round(p_beban_kg * 1000) * (30 + p_reps) + 1500) / 3000) / 10
  end;
$$;

comment on function public.e1rm_epley(numeric, integer) is
  'e1RM Epley satu set (kg, satu desimal); NULL bila tidak layak diperkirakan. Kembaran TS: e1rmEpley (dijaga cek:paritas).';

revoke all on function public.e1rm_epley(numeric, integer) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.e1rm_epley(numeric, integer) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.e1rm_epley(numeric, integer) to service_role';
  end if;
end $$;

-- Kolom turunan: selalu sama dengan beban & repetisinya, tidak bisa ditulis
-- terpisah, dan baris lama ikut terisi saat kolom ditambahkan.
alter table public.workout_sets
  add column if not exists e1rm_kg numeric(6, 1)
  generated always as (public.e1rm_epley(beban_kg, reps)) stored;

comment on column public.workout_sets.e1rm_kg is
  'e1RM Epley set ini (kg); NULL untuk berat badan atau repetisi di luar 1–12.';
