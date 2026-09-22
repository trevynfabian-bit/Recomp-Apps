-- =============================================================================
-- RPC: simpan berat pagi
--
-- Ditulis sebagai fungsi database, bukan UPSERT dari klien, karena satu hari
-- adalah SATU baris `daily_logs` yang juga memuat makro, catatan, dan tipe hari.
-- UPSERT dari klien akan menimpa kolom-kolom itu dengan nilai default saat
-- barisnya sudah ada. Fungsi ini hanya menyentuh kolom berat.
--
-- SECURITY INVOKER (bawaan): fungsi berjalan sebagai pemanggil, jadi RLS tetap
-- berlaku penuh — pengguna tidak bisa menulis berat ke hari milik orang lain.
-- =============================================================================

create or replace function public.simpan_berat_pagi(
  p_tanggal date,
  p_berat_kg numeric,
  p_sumber public.sumber_berat default 'manual'
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_baris public.daily_logs;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if p_berat_kg is null then
    raise exception 'Berat tidak boleh kosong' using errcode = '22004';
  end if;

  -- Batasnya sama dengan CHECK di tabel; dicek di sini agar pesannya jelas.
  if p_berat_kg < 30 or p_berat_kg > 250 then
    raise exception 'Berat % kg di luar rentang wajar (30–250)', p_berat_kg
      using errcode = '22003';
  end if;

  insert into public.daily_logs (user_id, tanggal, berat_pagi_kg, sumber_berat)
  values (v_user_id, p_tanggal, round(p_berat_kg, 2), p_sumber)
  on conflict (user_id, tanggal) do update
    -- HANYA kolom berat yang disentuh; makro, catatan, dan tipe hari dibiarkan.
    set berat_pagi_kg = excluded.berat_pagi_kg,
        sumber_berat  = excluded.sumber_berat
  returning * into v_baris;

  return v_baris;
end;
$$;

comment on function public.simpan_berat_pagi(date, numeric, public.sumber_berat) is
  'Menyimpan berat pagi untuk satu tanggal. Membuat baris daily_logs bila belum '
  'ada, atau memperbarui HANYA kolom berat bila sudah ada. RLS tetap berlaku.';

-- Hanya pengguna yang sudah login yang boleh memanggilnya.
revoke all on function public.simpan_berat_pagi(date, numeric, public.sumber_berat) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.simpan_berat_pagi(date, numeric, public.sumber_berat) to authenticated';
  end if;
end $$;
