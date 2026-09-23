-- ---------------------------------------------------------------------------
-- body_measurements — ukuran tubuh mingguan.
--
-- Lima bagian yang diminta PRD (pinggang, dada, lengan, paha, leher), dengan
-- lengan dan paha DIPISAH kiri/kanan. Merata-ratakan keduanya di satu kolom
-- akan menyembunyikan justru hal yang ingin dilihat pada recomposition:
-- ketimpangan sisi, dan sisi mana yang benar-benar bertambah.
--
-- Empat keputusan yang layak dicatat:
--
-- 1. SATU pencatatan per tanggal. Tanpa itu, tren mingguan bisa bercabang —
--    dua angka pinggang di tanggal sama, dan grafik memilih sendiri yang mana.
-- 2. Tiap kolom NULLABLE, tapi barisnya harus berisi setidaknya satu ukuran.
--    Orang yang pekan ini cuma mengukur pinggang tidak boleh terhalang, tapi
--    baris kosong melompong bukan pencatatan — ia cuma tanggal tanpa isi.
-- 3. Batas per bagian tubuh BUKAN penghakiman atas tubuh siapa pun: batasnya
--    sengaja lebar, dan tugasnya satu — menahan salah ketik yang mustahil
--    (85 jadi 8,5 atau 850). Satu angka liar merusak seluruh tren di layar.
--    Angkanya sama dengan RENTANG di `SheetCatatUkuran`.
-- 4. Lingkar PINGGUL tidak ada di sini, karena PRD tidak memintanya. Harganya
--    nyata dan harus dinyatakan: rumus Navy versi wanita memakai pinggul, jadi
--    selama kolomnya tidak ada, estimasi body fat untuk pengguna wanita tetap
--    dilewati — bukan dihitung dengan rumus pria, yang akan menghasilkan angka
--    yang kelihatan sah padahal salah sistematis.
--
-- Ketelitiannya numeric(5,1): satu desimal adalah ketelitian meteran kain,
-- bukan lebih. Menyimpan lebih banyak desimal hanya memberi kesan presisi yang
-- tidak dimiliki alat ukurnya.
-- ---------------------------------------------------------------------------

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sudah dinormalisasi ke Asia/Jakarta oleh pemanggil, sama seperti daily_logs.
  tanggal date not null,
  pinggang_cm numeric(5, 1),
  dada_cm numeric(5, 1),
  leher_cm numeric(5, 1),
  lengan_kiri_cm numeric(5, 1),
  lengan_kanan_cm numeric(5, 1),
  paha_kiri_cm numeric(5, 1),
  paha_kanan_cm numeric(5, 1),
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ukuran_satu_per_tanggal unique (user_id, tanggal),

  -- Penjaga salah ketik, bukan penilaian atas tubuh. Lihat catatan 3 di atas.
  constraint ukuran_pinggang_masuk_akal
    check (pinggang_cm is null or pinggang_cm between 50 and 160),
  constraint ukuran_dada_masuk_akal
    check (dada_cm is null or dada_cm between 60 and 170),
  constraint ukuran_leher_masuk_akal
    check (leher_cm is null or leher_cm between 25 and 60),
  constraint ukuran_lengan_kiri_masuk_akal
    check (lengan_kiri_cm is null or lengan_kiri_cm between 18 and 60),
  constraint ukuran_lengan_kanan_masuk_akal
    check (lengan_kanan_cm is null or lengan_kanan_cm between 18 and 60),
  constraint ukuran_paha_kiri_masuk_akal
    check (paha_kiri_cm is null or paha_kiri_cm between 30 and 95),
  constraint ukuran_paha_kanan_masuk_akal
    check (paha_kanan_cm is null or paha_kanan_cm between 30 and 95),

  -- Baris tanpa satu pun ukuran bukan pencatatan; ia cuma tanggal tanpa isi,
  -- dan ia akan muncul di grafik sebagai titik yang tidak mewakili apa pun.
  constraint ukuran_ada_isinya check (
    num_nonnulls(
      pinggang_cm, dada_cm, leher_cm,
      lengan_kiri_cm, lengan_kanan_cm, paha_kiri_cm, paha_kanan_cm
    ) > 0
  ),
  constraint ukuran_catatan_wajar check (catatan is null or char_length(catatan) <= 500)
);

comment on table public.body_measurements is
  'Ukuran tubuh mingguan, satu baris per tanggal. Lengan & paha dipisah '
  'kiri/kanan supaya ketimpangan sisi tidak tersembunyi oleh rata-rata.';

comment on column public.body_measurements.pinggang_cm is
  'Lingkar pinggang. Dipakai estimasi body fat Navy dan batas pinggang di profil.';

-- Grafik & riwayat selalu membaca dari yang terbaru ke belakang.
create index if not exists body_measurements_user_tanggal_idx
  on public.body_measurements (user_id, tanggal desc);

drop trigger if exists body_measurements_set_updated_at on public.body_measurements;
create trigger body_measurements_set_updated_at
  before update on public.body_measurements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — data kesehatan, jadi isolasinya syarat, bukan pilihan.
-- ---------------------------------------------------------------------------
alter table public.body_measurements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'body_measurements' and policyname = 'ukuran_milik_sendiri'
  ) then
    create policy ukuran_milik_sendiri on public.body_measurements
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on public.body_measurements to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.body_measurements from anon';
  end if;
end $$;
