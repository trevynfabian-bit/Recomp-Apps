-- ---------------------------------------------------------------------------
-- Konfigurasi copy notifikasi netral.
--
-- Isi notifikasi lahir di KATALOG_NOTIFIKASI (@recomp/logika) dan terbundel di
-- app. Tabel ini membuatnya bisa DIPERBAIKI tanpa rilis TestFlight baru —
-- kalimat yang ternyata janggal di layar kunci cukup diubah di sini, dan
-- perangkat memakainya saat menjadwalkan ulang.
--
-- Justru karena bisa diubah tanpa rilis, aturannya dipindah ke DATABASE:
--   • nada netral — `pelanggaran_nada` adalah kembaran SQL dari
--     `pelanggaranNada` di TypeScript (daftar kata yang sama, aturan batas kata
--     yang sama, tanda seru), dan dijaga sama oleh `npm run cek:paritas`;
--   • tanpa angka — layar kunci terbaca tanpa kunci dibuka;
--   • panjang yang muat di banner layar kunci.
-- Kalimat yang melanggar ditolak CHECK, bukan diperiksa oleh orang yang
-- kebetulan ingat. Perangkat juga memeriksa ulang sebelum memakai (lapis
-- kedua), dan jatuh ke kalimat terbundel bila ada yang lolos.
-- ---------------------------------------------------------------------------

/**
 * Pelanggaran nada dalam sebuah teks; daftar kosong berarti netral.
 * KEMBARAN `pelanggaranNada` (packages/logika/src/pengingat.ts): kata terlarang
 * dicocokkan sebagai AWAL kata (tidak didahului huruf), tanpa peduli huruf
 * besar-kecil, ditambah tanda seru.
 */
create or replace function public.pelanggaran_nada(p_teks text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(k order by i), '{}') ||
         case when position('!' in coalesce(p_teks, '')) > 0 then array['!'] else '{}'::text[] end
    from unnest(array['melebihi', 'kelebihan', 'berlebih', 'gagal', 'awas', 'jangan', 'peringatan', 'terlalu'])
         with ordinality as t (k, i)
   where lower(coalesce(p_teks, '')) ~ ('(^|[^[:alpha:]])' || k)
$$;

comment on function public.pelanggaran_nada(text) is
  'Kembaran SQL pelanggaranNada (TS). Dijaga sama oleh npm run cek:paritas.';

create table if not exists public.copy_notifikasi (
  jenis text primary key,
  nama text not null,
  kapan text not null,
  judul text not null,
  isi text not null,
  diperbarui_pada timestamptz not null default now(),

  constraint copy_notifikasi_jenis_sah
    check (jenis in ('timbang', 'ukuran', 'ringkasan', 'evaluasi', 'sumber')),
  constraint copy_notifikasi_netral
    check (cardinality(public.pelanggaran_nada(nama || ' ' || kapan || ' ' || judul || ' ' || isi)) = 0),
  -- Layar kunci terbaca tanpa kunci dibuka: tanpa berat, kalori, atau ukuran.
  constraint copy_notifikasi_tanpa_angka check (judul !~ '[0-9]' and isi !~ '[0-9]'),
  -- Judul banner iOS terpotong di sekitar 40 karakter; isi sekitar empat baris.
  constraint copy_notifikasi_judul_muat check (char_length(judul) between 1 and 40),
  constraint copy_notifikasi_isi_muat check (char_length(isi) between 1 and 150),
  constraint copy_notifikasi_nama_isi check (char_length(nama) between 1 and 60 and char_length(kapan) between 1 and 200)
);

comment on table public.copy_notifikasi is
  'Kalimat notifikasi per jenis. CHECK menjaga nada netral & tanpa angka; perubahan berlaku tanpa rilis app.';

drop trigger if exists copy_notifikasi_set_diperbarui on public.copy_notifikasi;
create or replace function public.copy_notifikasi_diperbarui()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.diperbarui_pada := now();
  return new;
end;
$$;
create trigger copy_notifikasi_set_diperbarui
  before update on public.copy_notifikasi
  for each row execute function public.copy_notifikasi_diperbarui();

-- Awal: sama persis dengan KATALOG_NOTIFIKASI (dijaga cek:paritas). Baris yang
-- sudah ada TIDAK ditimpa — perbaikan kalimat di produksi bertahan melewati
-- migrasi berikutnya.
insert into public.copy_notifikasi (jenis, nama, kapan, judul, isi)
values
  ('timbang', 'Timbang pagi',
   'Hanya dikirim bila berat pagi belum tercatat — dari app atau Apple Health.',
   'Timbang pagi',
   'Setelah bangun, sebelum sarapan — kalau sempat. Satu ketukan untuk mencatat.'),
  ('ukuran', 'Ukur pekanan',
   'Minggu pagi, hanya bila pinggang belum diukur pekan ini.',
   'Ukur pekanan',
   'Pinggang dan lainnya, dengan meteran yang biasa. Cukup dua menit.'),
  ('ringkasan', 'Ringkasan mingguan siap',
   'Senin pagi, saat ringkasan pekan lalu selesai dibuat.',
   'Ringkasan pekan lalu',
   'Angka pekan kemarin sudah dirangkum. Buka untuk membacanya.'),
  ('evaluasi', 'Evaluasi empat pekan siap',
   'Setiap empat pekan, saat arah berat, pinggang, dan kekuatan selesai dibaca.',
   'Evaluasi empat pekan',
   'Arah berat, pinggang, dan kekuatan sudah dibaca bersama. Buka untuk melihat rekomendasinya.'),
  ('sumber', 'Sumber data terputus',
   'Bila sebuah sumber berhenti mengirim data lebih dari sehari. Paling sering sekali sehari.',
   'Sumber data perlu disambungkan',
   'Satu sumber berhenti mengirim data. Ketuk untuk melihat yang mana.')
on conflict (jenis) do nothing;

-- Konfigurasi, bukan data pengguna: semua pengguna login membaca baris yang
-- sama; tidak ada yang menulis selain pengelola (service role / SQL editor).
alter table public.copy_notifikasi enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'copy_notifikasi' and policyname = 'copy_dibaca_pengguna_login'
  ) then
    create policy copy_dibaca_pengguna_login on public.copy_notifikasi
      for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.copy_notifikasi from authenticated';
    execute 'grant select on public.copy_notifikasi to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.copy_notifikasi from anon';
  end if;
end $$;

revoke all on function public.pelanggaran_nada(text) from public;
revoke execute on function public.copy_notifikasi_diperbarui() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.pelanggaran_nada(text) from anon';
  end if;
  -- CHECK memanggil fungsi ini sebagai PENULIS; pengelola (service role) harus bisa.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.pelanggaran_nada(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.pelanggaran_nada(text) to service_role';
  end if;
end $$;
