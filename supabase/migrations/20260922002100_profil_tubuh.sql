-- ---------------------------------------------------------------------------
-- Pengerasan kolom profil tubuh: tinggi, jenis kelamin, satuan.
--
-- Ketiga kolomnya sudah ada sejak 000100, tapi hanya dua dari tiga yang
-- benar-benar dijaga: `satuan` dan `jenis_kelamin` punya CHECK, `tinggi_cm`
-- tidak. Itu bukan kekurangan kosmetik. Tinggi masuk ke DUA rumus sekaligus —
-- Mifflin-St Jeor pada TDEE dan Navy pada body fat — dan keduanya tetap
-- memberi angka yang kelihatan sah untuk tinggi 17 cm atau 1.780 cm. Salah
-- ketik satu kali akan merusak estimasi berpekan-pekan tanpa satu pun pesan
-- kesalahan.
--
-- Batasnya sengaja lebar (100–250 cm): ia menahan yang MUSTAHIL, bukan yang
-- tidak lazim. Hal yang sama untuk batas pinggang, yang dipakai
-- `statusBatasPinggang` dan memakai rentang yang sama dengan kolom pinggang di
-- `body_measurements` — dua angka yang dibandingkan satu sama lain sebaiknya
-- tidak punya batas yang berbeda.
--
-- Soal `satuan`: database SELALU menyimpan metrik (cm, kg). Kolom ini murni
-- pilihan TAMPILAN. Menyimpan angka dalam satuan yang berbeda-beda per
-- pengguna berarti setiap rumus harus tahu satuan pemiliknya, dan satu rumus
-- yang lupa akan salah 2,54 kali tanpa terlihat aneh.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_tinggi_masuk_akal'
  ) then
    alter table public.profiles
      add constraint profiles_tinggi_masuk_akal
      check (tinggi_cm is null or tinggi_cm between 100 and 250);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_batas_pinggang_masuk_akal'
  ) then
    alter table public.profiles
      add constraint profiles_batas_pinggang_masuk_akal
      check (batas_pinggang_cm is null or batas_pinggang_cm between 50 and 160);
  end if;
end $$;

comment on column public.profiles.tinggi_cm is
  'Tinggi badan dalam SENTIMETER, apa pun satuan tampilan pengguna. Dipakai '
  'Mifflin-St Jeor (TDEE) dan Navy (body fat); keduanya tidak punya cara '
  'mendeteksi tinggi yang salah ketik.';

comment on column public.profiles.jenis_kelamin is
  'pria | wanita. Rumus Navy memakai konstanta berbeda untuk keduanya, dan '
  'versi wanita juga butuh lingkar pinggul yang belum dicatat app ini — jadi '
  'nilai ini menentukan apakah estimasi body fat bisa dihitung sama sekali.';

comment on column public.profiles.satuan is
  'Satuan TAMPILAN saja: metrik | imperial. Database selalu menyimpan cm & kg, '
  'supaya tidak ada rumus yang perlu tahu satuan pemiliknya.';

comment on column public.profiles.batas_pinggang_cm is
  'Batas lingkar pinggang yang ditetapkan pengguna, dalam sentimeter. Rentangnya '
  'sama dengan body_measurements.pinggang_cm karena keduanya dibandingkan.';
