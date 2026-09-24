-- =============================================================================
-- Redistribusi mingguan: bentuk pekan & pemilik dijaga database
--
-- `terapkan_redistribusi` selalu menulis dengan benar: pekan mulai Senin
-- (`awal_minggu`), hari-harinya di dalam pekan itu, dan baris hari milik
-- pemilik penerapannya. Tetapi kedua tabel juga bisa ditulis langsung oleh
-- pemiliknya lewat PostgREST (web memakai proyek yang sama), dan tulisan
-- langsung lolos dari ketiga aturan itu:
--   • `minggu_mulai` hari Selasa → budget pekan itu tidak pernah menemukan
--     penerapannya (dicari per Senin), jadi redistribusinya diam-diam hilang;
--   • baris hari di luar pekannya → target hari lain ikut berubah dari
--     penerapan yang tidak menyebut hari itu;
--   • baris hari ber-`user_id` sendiri yang menempel ke penerapan milik orang
--     lain → FK memeriksa tanpa RLS, jadi yang tahu id-nya bisa menempel.
--
-- Aturan dipasang NOT VALID lalu dicoba divalidasi (baris baru SELALU
-- diperiksa; baris lama yang belum memenuhi dilaporkan lewat NOTICE, migrasi
-- tidak gagal). Aman dijalankan ulang.
-- =============================================================================

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

-- Pekan dimulai Senin (ISO), sama dengan `awal_minggu` dan `awalMinggu` TS.
select pg_temp.pasang_aturan('redistribusi_mingguan', 'redistribusi_mulai_senin',
  'check (extract(isodow from minggu_mulai) = 1)');

-- Baris hari milik pemilik penerapannya: FK gabungan (id, user_id).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'redistribusi_mingguan_id_pemilik_unik') then
    alter table public.redistribusi_mingguan
      add constraint redistribusi_mingguan_id_pemilik_unik unique (id, user_id);
  end if;
end $$;

select pg_temp.pasang_aturan('redistribusi_hari', 'redistribusi_hari_milik_pemilik_penerapan',
  'foreign key (redistribusi_id, user_id) references public.redistribusi_mingguan (id, user_id) on delete cascade');

-- Hari di dalam pekan penerapannya: lintas tabel, jadi lewat pemicu.
create or replace function public.redistribusi_hari_dalam_pekan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_senin date;
begin
  select m.minggu_mulai into v_senin from public.redistribusi_mingguan m where m.id = new.redistribusi_id;
  -- Penerapan tidak ditemukan: biar FK yang menolak dengan kodenya sendiri.
  if v_senin is not null and (new.tanggal < v_senin or new.tanggal > v_senin + 6) then
    raise exception using
      errcode = '23514',
      message = format('Tanggal %s di luar pekan penerapannya (%s s.d. %s).', new.tanggal, v_senin, v_senin + 6),
      constraint = 'redistribusi_hari_dalam_pekan';
  end if;
  return new;
end;
$$;

comment on function public.redistribusi_hari_dalam_pekan() is
  'Pemicu: baris redistribusi_hari harus bertanggal di dalam pekan penerapannya (Senin s.d. Minggu).';

revoke all on function public.redistribusi_hari_dalam_pekan() from public, anon, authenticated;

drop trigger if exists redistribusi_hari_dalam_pekan on public.redistribusi_hari;
create trigger redistribusi_hari_dalam_pekan
  before insert or update of redistribusi_id, tanggal on public.redistribusi_hari
  for each row execute function public.redistribusi_hari_dalam_pekan();
