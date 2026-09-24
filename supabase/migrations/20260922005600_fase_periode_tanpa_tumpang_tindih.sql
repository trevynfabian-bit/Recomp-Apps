-- =============================================================================
-- Riwayat fase tanpa tumpang tindih
--
-- `fase_pada_tanggal` dan snapshot target harian bergantung pada satu janji:
-- setiap tanggal masuk ke PALING BANYAK satu periode fase. `ganti_fase` sudah
-- menjaganya (menutup periode lama sehari sebelum yang baru), dan indeks unik
-- menjaga hanya ada satu periode berjalan. Tetapi tabelnya juga bisa ditulis
-- langsung lewat PostgREST oleh pemiliknya (web memakai proyek yang sama),
-- dan tulisan langsung bisa membuat dua periode TERTUTUP yang bertumpuk, atau
-- periode tertutup yang masuk ke dalam periode berjalan. Tanggal di area itu
-- lalu punya dua fase yang sama sahnya.
--
-- Pemicu di sini menolak tulisan yang membuat rentang tanggal satu pengguna
-- bertumpuk (galat 23P01, exclusion_violation). Rentang periode berjalan
-- dianggap terbuka ke depan. Tanpa ekstensi (btree_gist): pemeriksaannya
-- dilakukan pemicu dengan kunci per pengguna supaya dua tulisan bersamaan
-- tidak lolos berdua.
--
-- Baris lama tidak diubah. Bila sudah ada tumpang tindih, migrasi memberi
-- tahu lewat NOTICE supaya dirapikan. Aman dijalankan ulang.
-- =============================================================================

create or replace function public.fase_periode_tolak_tumpang_tindih()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bentrok record;
begin
  -- Satu penulis per pengguna pada satu waktu (dilepas di akhir transaksi).
  perform pg_advisory_xact_lock(hashtext('fase_periode:' || new.user_id::text));

  select p.fase, p.mulai_tanggal, p.selesai_tanggal
    into v_bentrok
    from public.fase_periode p
   where p.user_id = new.user_id
     and p.id is distinct from new.id
     and daterange(p.mulai_tanggal, p.selesai_tanggal, '[]')
         && daterange(new.mulai_tanggal, new.selesai_tanggal, '[]')
   limit 1;

  if found then
    raise exception using
      errcode = '23P01',
      message = format(
        'Periode fase %s (%s s.d. %s) bertumpuk dengan periode %s (%s s.d. %s).',
        new.fase, new.mulai_tanggal, coalesce(new.selesai_tanggal::text, 'sekarang'),
        v_bentrok.fase, v_bentrok.mulai_tanggal, coalesce(v_bentrok.selesai_tanggal::text, 'sekarang')
      ),
      hint = 'Setiap tanggal hanya boleh masuk ke satu periode fase. Ganti fase lewat ganti_fase.';
  end if;

  return new;
end;
$$;

comment on function public.fase_periode_tolak_tumpang_tindih() is
  'Pemicu: menolak periode fase yang rentang tanggalnya bertumpuk dengan periode lain milik pengguna yang sama.';

-- Pemicu tidak dipanggil langsung oleh siapa pun.
revoke all on function public.fase_periode_tolak_tumpang_tindih() from public, anon, authenticated;

drop trigger if exists fase_periode_tanpa_tumpang_tindih on public.fase_periode;
create trigger fase_periode_tanpa_tumpang_tindih
  before insert or update of user_id, mulai_tanggal, selesai_tanggal on public.fase_periode
  for each row execute function public.fase_periode_tolak_tumpang_tindih();

-- Laporkan tumpang tindih lama tanpa mengubahnya.
do $$
declare n integer;
begin
  select count(*) into n
    from public.fase_periode a
    join public.fase_periode b
      on a.user_id = b.user_id and a.id < b.id
     and daterange(a.mulai_tanggal, a.selesai_tanggal, '[]') && daterange(b.mulai_tanggal, b.selesai_tanggal, '[]');
  if n > 0 then
    raise notice 'fase_periode: % pasang periode lama bertumpuk; rapikan agar fase_pada_tanggal punya satu jawaban.', n;
  end if;
end $$;
