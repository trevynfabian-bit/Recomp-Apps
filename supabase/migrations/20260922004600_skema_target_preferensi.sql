-- =============================================================================
-- Skema target & preferensi pengguna — aturan yang SAMA dengan form Pengaturan
--
-- Target harian dan tipe hari adalah preferensi pengguna yang paling sering
-- disunting (layar Target harian, sheet sunting satu target, matriks). Form di
-- app memeriksa isiannya lewat `periksaTarget` (@recomp/logika), tetapi form
-- bukan satu-satunya jalan menulis: web memakai tabel yang sama, dan PostgREST
-- menerima tulisan langsung. Karena itu aturannya dipasang juga di sini,
-- dengan angka yang sama persis (`RENTANG_TARGET`), dan kesamaannya dijaga
-- `npm run cek:paritas`.
--
-- Preferensi di `profiles` (satuan, tinggi, batas pinggang, batas bawah
-- kalori) sudah punya pemeriksaannya di migrasi sebelumnya; yang ditambah di
-- sini khusus tipe hari dan target.
--
-- Proyek Supabase-nya dipakai bersama web dan mungkin sudah berisi data.
-- Setiap aturan baru dipasang NOT VALID lalu dicoba divalidasi: baris baru
-- SELALU diperiksa, dan bila ada baris lama yang belum memenuhi, migrasi
-- tidak gagal — ia memberi tahu lewat NOTICE supaya barisnya dirapikan.
-- Migrasi ini aman dijalankan ulang.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pembantu: pasang CHECK / FK bila belum ada, lalu coba validasi.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.pasang_aturan(p_tabel text, p_nama text, p_definisi text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = p_nama and conrelid = format('public.%I', p_tabel)::regclass
  ) then
    execute format('alter table public.%I add constraint %I %s not valid', p_tabel, p_nama, p_definisi);
  end if;
  begin
    execute format('alter table public.%I validate constraint %I', p_tabel, p_nama);
  exception
    when check_violation or foreign_key_violation then
      raise notice 'Aturan % dipasang untuk baris baru; sebagian baris lama di % belum memenuhinya.', p_nama, p_tabel;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- day_types — daftar tipe hari milik pengguna
-- ---------------------------------------------------------------------------

-- Nama tampil di pemilih tipe hari; nama kosong adalah tombol tanpa label.
select pg_temp.pasang_aturan('day_types', 'day_types_nama_terisi', $c$check (btrim(nama) <> '')$c$);

-- Pasangan (id, pemilik) unik: dasar FK komposit dari target di bawah.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'day_types_id_pemilik_unik') then
    alter table public.day_types add constraint day_types_id_pemilik_unik unique (id, user_id);
  end if;
end $$;

-- Satu tipe hari bawaan per pengguna: hari tanpa latihan dan tanpa pilihan
-- manual jatuh ke tipe ini, jadi dua "bawaan" membuat hasilnya bergantung
-- pada urutan baris.
do $$
begin
  if exists (
    select 1 from public.day_types where is_default group by user_id having count(*) > 1
  ) then
    raise notice 'Sebagian pengguna punya lebih dari satu tipe hari bawaan; indeks satu-bawaan belum dipasang.';
  else
    create unique index if not exists day_types_satu_bawaan_idx
      on public.day_types (user_id) where is_default;
  end if;
end $$;

comment on column public.day_types.is_default is
  'Tipe hari bawaan: dipakai saat tidak ada latihan dan tidak ada pilihan manual. Paling banyak satu per pengguna.';
comment on column public.day_types.auto_detect is
  'Boleh menjadi hasil auto-deteksi dari latihan. Tipe hari tanpa target tetap sah; layar mengatakan "belum diisi".';

-- ---------------------------------------------------------------------------
-- day_type_targets — target ABSOLUT per (tipe hari x fase)
--
-- Rentang = RENTANG_TARGET di packages/logika/src/targetHarian.ts:
--   kalori 800–8000 kcal (sudah ada: day_type_targets_kalori_masuk_akal),
--   protein 0–500 g, lemak 0–400 g, batas sat fat 0–200 g.
-- ---------------------------------------------------------------------------

-- Pemeriksaan ">= 0" yang lama digantikan pemeriksaan rentang lengkap.
alter table public.day_type_targets drop constraint if exists day_type_targets_protein_positif;
alter table public.day_type_targets drop constraint if exists day_type_targets_lemak_positif;
alter table public.day_type_targets drop constraint if exists day_type_targets_sat_fat_positif;

select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_protein_rentang',
  'check (target_protein_g between 0 and 500)');
select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_lemak_rentang',
  'check (target_lemak_g between 0 and 400)');
select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_sat_fat_rentang',
  'check (batas_sat_fat_g between 0 and 200)');

-- Sat fat bagian dari lemak: batasnya tidak bisa melebihi target lemak.
select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_sat_fat_dalam_lemak',
  'check (batas_sat_fat_g <= target_lemak_g)');

-- Protein dan lemak saja tidak boleh melebihi kalorinya (4 & 9 kcal/g):
-- sisanya karbo, dan karbo negatif berarti target yang mustahil dipenuhi.
select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_makro_dalam_kalori',
  'check (target_protein_g * 4 + target_lemak_g * 9 <= target_kalori)');

-- Target hanya boleh menempel pada tipe hari MILIK pengguna yang sama.
-- FK tunggal ke day_types(id) tidak memeriksa pemilik, dan pemeriksaan FK
-- tidak tunduk pada RLS — tanpa ini, satu akun bisa menempelkan target ke tipe
-- hari akun lain (yang lalu ikut terhapus bersamanya).
select pg_temp.pasang_aturan('day_type_targets', 'day_type_targets_tipe_hari_milik_sendiri',
  'foreign key (day_type_id, user_id) references public.day_types (id, user_id) on delete cascade');

comment on table public.day_type_targets is
  'Target absolut per (tipe hari x fase). Aturan isiannya sama dengan periksaTarget '
  '(@recomp/logika). Hari yang sudah tercatat memegang snapshot di daily_logs; '
  'target yang diedit tidak menulis ulang hari yang sudah lewat.';
comment on column public.day_type_targets.batas_sat_fat_g is
  'Batas atas, bukan sasaran. Paling tinggi sama dengan target lemak.';

drop function pg_temp.pasang_aturan(text, text, text);
