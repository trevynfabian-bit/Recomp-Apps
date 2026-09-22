-- =============================================================================
-- Catatan bebas harian — pelengkap endpoint
--
-- `simpan_catatan_harian` sudah ada dari migrasi total makro. Yang ditambahkan
-- di sini adalah bagian yang membuatnya layak dipakai app sungguhan:
--   • batas panjang yang MENOLAK dengan pesan jelas, bukan gagal di CHECK tabel
--   • jalur baca, supaya app bisa memuat catatan hari itu
-- =============================================================================

/** Batas panjang catatan. Sama dengan CHECK di tabel, tapi ditolak lebih awal. */
create or replace function public.simpan_catatan_harian(
  p_tanggal date,
  p_catatan text
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_daily_log_id uuid;
  v_bersih text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_baris public.daily_logs;
begin
  -- Ditolak di sini supaya pesannya bisa dibaca pengguna; kalau dibiarkan
  -- sampai CHECK tabel, yang muncul hanya galat constraint yang tidak berguna.
  if v_bersih is not null and char_length(v_bersih) > 2000 then
    raise exception 'Catatan terlalu panjang (% karakter, batas 2000)', char_length(v_bersih)
      using errcode = '22001';
  end if;

  v_daily_log_id := public.baris_hari(p_tanggal);

  -- Catatan kosong disimpan sebagai NULL, bukan string kosong, supaya
  -- "belum diisi" dan "sengaja dikosongkan" tidak tertukar.
  update public.daily_logs
     set catatan = v_bersih
   where id = v_daily_log_id
  returning * into v_baris;

  return v_baris;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jalur baca: catatan satu tanggal
--
-- Mengembalikan NULL baik ketika harinya belum ada maupun ketika catatannya
-- memang kosong — bagi pemanggil keduanya berarti hal yang sama.
-- ---------------------------------------------------------------------------
create or replace function public.ambil_catatan_harian(p_tanggal date)
returns text
language sql
stable
set search_path = ''
as $$
  select catatan
    from public.daily_logs
   where user_id = (select auth.uid()) and tanggal = p_tanggal;
$$;

comment on function public.ambil_catatan_harian(date) is
  'Catatan bebas untuk satu tanggal, atau NULL bila belum ada.';

revoke all on function public.ambil_catatan_harian(date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ambil_catatan_harian(date) to authenticated';
  end if;
end $$;
