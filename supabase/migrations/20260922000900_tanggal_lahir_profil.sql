-- =============================================================================
-- profiles.tanggal_lahir
--
-- Dibutuhkan rumus Mifflin-St Jeor pada estimasi TDEE, yang memakai usia.
-- Kolom ini tidak ada di skema awal PRD, tapi tanpanya salah satu dari tiga
-- metode TDEE tidak bisa dihitung sama sekali.
--
-- Nullable: pengguna lama tidak punya nilainya, dan estimasi TDEE memang
-- dirancang untuk tetap berjalan dengan metode yang tersedia saja.
-- =============================================================================
alter table public.profiles add column if not exists tanggal_lahir date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tanggal_lahir_masuk_akal') then
    alter table public.profiles
      add constraint profiles_tanggal_lahir_masuk_akal
      check (
        tanggal_lahir is null
        or (tanggal_lahir > date '1900-01-01' and tanggal_lahir < current_date)
      );
  end if;
end $$;

comment on column public.profiles.tanggal_lahir is
  'Dipakai rumus Mifflin-St Jeor pada estimasi TDEE. Boleh null; estimasi '
  'tetap berjalan dengan metode lain bila kosong.';
