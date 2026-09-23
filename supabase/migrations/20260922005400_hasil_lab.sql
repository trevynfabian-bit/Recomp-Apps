-- =============================================================================
-- Hasil lab: lab_results + lab_result_markers, dengan RLS
--
-- Hasil lab adalah data kesehatan paling sensitif di app ini. Aturannya:
--
--   • Disimpan apa adanya dari kertas hasil lab (data mentah): nilai, satuan,
--     dan rentang rujukan MILIK LABORATORIUM. Tidak ada kolom tafsiran
--     ("tinggi", "normal") — posisi terhadap rentang dihitung saat dibaca,
--     dan artinya dibicarakan dengan dokter.
--   • Aturan isinya sama dengan form (`periksaHasilLab` di @recomp/logika;
--     dijaga `npm run cek:paritas`): panel 1–60 huruf, tanggal 1/1/2000
--     sampai hari ini, penanda bernama unik (tanpa beda huruf besar) dengan
--     nilai >= 0 dan paling banyak tiga desimal, satuan terisi, batas bawah
--     rujukan tidak melebihi batas atas, dan panjang teks dibatasi
--     (`BATAS_PANJANG_LAB`).
--   • Satu hasil lab selalu punya setidaknya satu penanda — dijaga pemicu
--     tertunda (diperiksa saat transaksi selesai), jadi hasil lab dan
--     penandanya bisa ditulis dalam satu transaksi tanpa keadaan antara yang
--     terlihat.
--   • RLS tertutup sejak awal, mengikuti migrasi rls_data_kesehatan: hanya
--     pemilik, kebijakan hanya untuk `authenticated`, tanpa TRUNCATE /
--     REFERENCES / TRIGGER, dan penanda hanya bisa menempel pada hasil lab
--     milik pemilik yang sama (FK komposit).
-- =============================================================================

create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Tanggal pengambilan sampel.
  tanggal date not null,
  -- Nama panel, mis. "Profil lipid".
  nama text not null,
  laboratorium text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_results_id_pemilik_unik unique (id, user_id),
  constraint lab_results_nama_wajar check (nama = btrim(nama) and char_length(nama) between 1 and 60),
  constraint lab_results_laboratorium_wajar
    check (laboratorium is null or (laboratorium = btrim(laboratorium) and char_length(laboratorium) between 1 and 80)),
  constraint lab_results_tanggal_awal check (tanggal >= date '2000-01-01')
);

create index if not exists lab_results_user_tanggal_idx on public.lab_results (user_id, tanggal desc);

comment on table public.lab_results is
  'Hasil lab sebagai data mentah dari kertas hasilnya. Tanpa kolom tafsiran; rentang rujukan milik laboratorium.';

create table if not exists public.lab_result_markers (
  id uuid primary key default gen_random_uuid(),
  lab_result_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Urutan seperti diisi, mulai 1.
  urutan smallint not null,
  nama text not null,
  nilai numeric not null,
  satuan text not null,
  -- Rentang rujukan dari laboratorium; salah satu atau keduanya boleh kosong.
  rujukan_min numeric,
  rujukan_maks numeric,
  created_at timestamptz not null default now(),
  constraint lab_result_markers_hasil_milik_sendiri
    foreign key (lab_result_id, user_id) references public.lab_results (id, user_id) on delete cascade,
  constraint lab_result_markers_urutan_unik unique (lab_result_id, urutan),
  constraint lab_result_markers_urutan_positif check (urutan >= 1),
  constraint lab_result_markers_nama_wajar check (nama = btrim(nama) and char_length(nama) between 1 and 60),
  constraint lab_result_markers_satuan_wajar check (satuan = btrim(satuan) and char_length(satuan) between 1 and 20),
  -- Sama dengan uraiNilaiLab: 0 sampai 999999,999, paling banyak tiga desimal.
  constraint lab_result_markers_nilai_wajar check (nilai >= 0 and nilai < 1000000 and scale(nilai) <= 3),
  constraint lab_result_markers_rujukan_min_wajar
    check (rujukan_min is null or (rujukan_min >= 0 and rujukan_min < 1000000 and scale(rujukan_min) <= 3)),
  constraint lab_result_markers_rujukan_maks_wajar
    check (rujukan_maks is null or (rujukan_maks >= 0 and rujukan_maks < 1000000 and scale(rujukan_maks) <= 3)),
  constraint lab_result_markers_rentang_urut
    check (rujukan_min is null or rujukan_maks is null or rujukan_min <= rujukan_maks)
);

-- Nama penanda unik per hasil lab tanpa beda huruf besar ("LDL" = "ldl").
create unique index if not exists lab_result_markers_nama_unik
  on public.lab_result_markers (lab_result_id, lower(nama));
create index if not exists lab_result_markers_user_idx on public.lab_result_markers (user_id);

comment on table public.lab_result_markers is
  'Penanda satu hasil lab: nilai, satuan, dan rentang rujukan dari laboratorium, apa adanya.';

-- ---------------------------------------------------------------------------
-- Pemicu: updated_at, tanggal tidak di masa depan, setidaknya satu penanda
-- ---------------------------------------------------------------------------
drop trigger if exists lab_results_set_updated_at on public.lab_results;
create trigger lab_results_set_updated_at
  before update on public.lab_results
  for each row execute function public.set_updated_at();

create or replace function public.jaga_tanggal_hasil_lab()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tanggal > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal pengambilan sampel tidak bisa di masa depan' using errcode = '22007';
  end if;
  return new;
end;
$$;

drop trigger if exists lab_results_tanggal_tidak_depan on public.lab_results;
create trigger lab_results_tanggal_tidak_depan
  before insert or update of tanggal on public.lab_results
  for each row execute function public.jaga_tanggal_hasil_lab();

-- Diperiksa saat transaksi selesai: hasil lab yang ada harus punya penanda.
create or replace function public.jaga_hasil_lab_berpenanda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Dua cabang terpisah: NEW/OLD tiap tabel punya kolom berbeda.
  if tg_table_name = 'lab_results' then
    v_id := new.id;
  else
    v_id := old.lab_result_id;
  end if;
  if exists (select 1 from public.lab_results r where r.id = v_id)
     and not exists (select 1 from public.lab_result_markers m where m.lab_result_id = v_id) then
    raise exception 'Hasil lab butuh setidaknya satu penanda' using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists lab_results_berpenanda on public.lab_results;
create constraint trigger lab_results_berpenanda
  after insert on public.lab_results
  deferrable initially deferred
  for each row execute function public.jaga_hasil_lab_berpenanda();

drop trigger if exists lab_result_markers_hasil_tetap_berpenanda on public.lab_result_markers;
create constraint trigger lab_result_markers_hasil_tetap_berpenanda
  after delete or update of lab_result_id on public.lab_result_markers
  deferrable initially deferred
  for each row execute function public.jaga_hasil_lab_berpenanda();

-- ---------------------------------------------------------------------------
-- RLS & hak
-- ---------------------------------------------------------------------------
alter table public.lab_results enable row level security;
alter table public.lab_result_markers enable row level security;

drop policy if exists lab_results_milik_sendiri on public.lab_results;
drop policy if exists lab_result_markers_milik_sendiri on public.lab_result_markers;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    create policy lab_results_milik_sendiri on public.lab_results
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
    create policy lab_result_markers_milik_sendiri on public.lab_result_markers
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
    execute 'grant select, insert, update, delete on public.lab_results to authenticated';
    execute 'grant select, insert, update, delete on public.lab_result_markers to authenticated';
    execute 'revoke truncate, references, trigger on public.lab_results from authenticated';
    execute 'revoke truncate, references, trigger on public.lab_result_markers from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.lab_results from anon';
    execute 'revoke all on public.lab_result_markers from anon';
  end if;
end $$;

-- Fungsi pemicu tidak dipanggil klien.
revoke all on function public.jaga_tanggal_hasil_lab() from public;
revoke all on function public.jaga_hasil_lab_berpenanda() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.jaga_tanggal_hasil_lab() from anon';
    execute 'revoke all on function public.jaga_hasil_lab_berpenanda() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.jaga_tanggal_hasil_lab() from authenticated';
    execute 'revoke all on function public.jaga_hasil_lab_berpenanda() from authenticated';
  end if;
end $$;
