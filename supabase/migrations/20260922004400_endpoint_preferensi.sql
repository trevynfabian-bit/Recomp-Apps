-- ---------------------------------------------------------------------------
-- Endpoint preferensi widget & pengingat.
--
--   pengaturan_notifikasi()               — baca (baris bawaan dibuat bila belum ada)
--   simpan_pengaturan_notifikasi(jsonb)   — ubah SEBAGIAN, tervalidasi, atomik
--
-- Kenapa endpoint, bukan UPDATE langsung: CHECK tabel tetap penjaga terakhir,
-- tapi pesannya ("violates check constraint settings_notifications_jam_pagi")
-- tidak layak tampil. Endpoint ini menolak dengan kalimat yang bisa dibaca
-- pengguna, menolak kunci yang tidak dikenal (salah ketik di klien tidak
-- diam-diam diabaikan), dan hanya menyentuh kolom yang dikirim — dua perangkat
-- yang mengubah hal berbeda tidak saling menimpa.
-- ---------------------------------------------------------------------------

create or replace function public.simpan_pengaturan_notifikasi(p_perubahan jsonb)
returns public.settings_notifications
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_kunci text;
  v_boleh text[] := array[
    'timbang_aktif', 'ukuran_aktif', 'ringkasan_aktif', 'evaluasi_aktif', 'sumber_aktif',
    'jam_timbang', 'jam_timbang_akhir_pekan', 'widget_aktif'];
  v_jam time;
  v_baris public.settings_notifications;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_perubahan is null or jsonb_typeof(p_perubahan) <> 'object' then
    raise exception 'Perubahan harus berupa objek' using errcode = '22023';
  end if;

  for v_kunci in select jsonb_object_keys(p_perubahan) loop
    if v_kunci = 'notif_netral' then
      raise exception 'Nada netral bukan pengaturan; notifikasi selalu netral.' using errcode = '22023';
    end if;
    if not v_kunci = any (v_boleh) then
      raise exception 'Pengaturan tidak dikenal: %', v_kunci using errcode = '22023';
    end if;
    if v_kunci like '%\_aktif' and jsonb_typeof(p_perubahan -> v_kunci) <> 'boolean' then
      raise exception '% harus benar/salah', v_kunci using errcode = '22023';
    end if;
    if v_kunci like 'jam\_%' then
      if v_kunci = 'jam_timbang_akhir_pekan' and jsonb_typeof(p_perubahan -> v_kunci) = 'null' then
        continue;  -- null = akhir pekan memakai jam hari kerja
      end if;
      if jsonb_typeof(p_perubahan -> v_kunci) <> 'string'
         or (p_perubahan ->> v_kunci) !~ '^\d{2}:\d{2}(:00)?$' then
        raise exception 'Jam harus berformat JJ:MM' using errcode = '22023';
      end if;
      v_jam := (p_perubahan ->> v_kunci)::time;
      if v_jam < time '04:00' or v_jam > time '11:00' then
        raise exception 'Jam timbang harus antara 04.00 dan 11.00 — timbangan pagi yang dibandingkan dari hari ke hari.'
          using errcode = '22023';
      end if;
      if extract(minute from v_jam)::integer % 15 <> 0 then
        raise exception 'Jam timbang harus kelipatan 15 menit.' using errcode = '22023';
      end if;
    end if;
  end loop;

  perform public.pengaturan_notifikasi();

  update public.settings_notifications s
     set timbang_aktif = coalesce((p_perubahan ->> 'timbang_aktif')::boolean, s.timbang_aktif),
         ukuran_aktif = coalesce((p_perubahan ->> 'ukuran_aktif')::boolean, s.ukuran_aktif),
         ringkasan_aktif = coalesce((p_perubahan ->> 'ringkasan_aktif')::boolean, s.ringkasan_aktif),
         evaluasi_aktif = coalesce((p_perubahan ->> 'evaluasi_aktif')::boolean, s.evaluasi_aktif),
         sumber_aktif = coalesce((p_perubahan ->> 'sumber_aktif')::boolean, s.sumber_aktif),
         jam_timbang = coalesce((p_perubahan ->> 'jam_timbang')::time, s.jam_timbang),
         jam_timbang_akhir_pekan = case when p_perubahan ? 'jam_timbang_akhir_pekan'
                                        then (p_perubahan ->> 'jam_timbang_akhir_pekan')::time
                                        else s.jam_timbang_akhir_pekan end,
         widget_aktif = coalesce((p_perubahan ->> 'widget_aktif')::boolean, s.widget_aktif)
   where s.user_id = v_user
  returning * into v_baris;

  return v_baris;
end;
$$;

comment on function public.simpan_pengaturan_notifikasi(jsonb) is
  'Ubah sebagian preferensi widget & pengingat dengan validasi berpesan jelas. Kunci tak dikenal ditolak.';

revoke all on function public.simpan_pengaturan_notifikasi(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.simpan_pengaturan_notifikasi(jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.simpan_pengaturan_notifikasi(jsonb) to authenticated';
  end if;
end $$;
