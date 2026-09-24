-- =============================================================================
-- Endpoint status pekerjaan: impor, sinkron, ekspor — satu panggilan
--
-- Layar Sumber data dan Impor & ekspor perlu tahu "apa yang sedang terjadi"
-- tanpa membaca dua tabel dan menafsirkannya sendiri. Satu penafsiran yang
-- paling mudah salah: impor yang ditinggal di tengah jalan (app tertutup)
-- tetap berstatus `berjalan` sampai ada impor baru, jadi layar akan memutar
-- indikator selamanya. Di sini impor berjalan yang diam lebih dari 10 menit
-- dilaporkan `terhenti` — ambang yang SAMA dengan `mulai_impor`, yang pada
-- saat itu juga mengizinkan impor baru menggantikannya.
--
-- Ekspor disusun di perangkat dari `ekspor_data_saya` (tidak ada pekerjaan di
-- server); jawabannya menyatakan itu, bukan diam.
-- Aman dijalankan ulang.
-- =============================================================================

create or replace function public.status_pekerjaan_saya()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_impor jsonb;
  v_sinkron jsonb;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  -- Impor terakhir per sumber.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id,
           'sumber', j.sumber,
           'status', case when j.status = 'berjalan' and j.diperbarui_pada <= now() - interval '10 minutes'
                          then 'terhenti' else j.status end,
           'total', j.total,
           'selesai', j.selesai,
           'persen', floor(j.selesai * 100.0 / j.total)::integer,
           'ringkas', j.ringkas,
           'hasil', j.hasil,
           'galat', j.galat,
           'dibuat_pada', j.dibuat_pada,
           'diperbarui_pada', j.diperbarui_pada,
           'selesai_pada', j.selesai_pada
         ) order by j.dibuat_pada desc), '[]'::jsonb)
    into v_impor
    from (
      select distinct on (sumber) *
        from public.import_jobs
       where user_id = v_user
       -- Waktu dibuat sama (satu transaksi): yang berjalan lebih penting.
       order by sumber, dibuat_pada desc, (status = 'berjalan') desc, diperbarui_pada desc
    ) j;

  -- Sinkron per koneksi, dengan satu keadaan yang sudah ditafsirkan.
  select coalesce(jsonb_agg(jsonb_build_object(
           'sumber', c.sumber,
           'mekanisme', c.mekanisme,
           'status', c.status,
           'keadaan', case when c.status = 'terputus' then 'terputus'
                           when c.galat_terakhir is not null then 'galat'
                           when c.sinkron_terakhir is null then 'belum_sinkron'
                           else 'baik' end,
           'terhubung_pada', c.terhubung_pada,
           'sinkron_terakhir', c.sinkron_terakhir,
           'galat_terakhir', c.galat_terakhir,
           'galat_pada', c.galat_pada
         ) order by c.sumber), '[]'::jsonb)
    into v_sinkron
    from public.health_connections c
   where c.user_id = v_user;

  return jsonb_build_object(
    'diperiksa_pada', now(),
    'impor', v_impor,
    'sinkron', v_sinkron,
    'ekspor', jsonb_build_object('disusun_di', 'perangkat', 'sumber', 'ekspor_data_saya')
  );
end;
$$;

comment on function public.status_pekerjaan_saya() is
  'Status impor terakhir per sumber (berjalan/selesai/gagal/terhenti), sinkron per koneksi (baik/galat/belum_sinkron/terputus), dan cara ekspor disusun.';

revoke all on function public.status_pekerjaan_saya() from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.status_pekerjaan_saya() to authenticated';
  end if;
end $$;
