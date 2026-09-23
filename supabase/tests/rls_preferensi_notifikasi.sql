-- =============================================================================
-- Uji settings_notifications: bawaan, jam pagi, nada netral, isolasi.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('f1a1b1c1-0000-0000-0000-000000000001', 'pref-a@contoh.test'),
  ('f2a2b2c2-0000-0000-0000-000000000002', 'pref-b@contoh.test');

set request.jwt.claim.sub = 'f1a1b1c1-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Dibaca pertama kali → baris bawaan; dibaca lagi → tidak berganda.
do $$
declare p public.settings_notifications;
begin
  p := public.pengaturan_notifikasi();
  assert p.timbang_aktif and p.ukuran_aktif and p.ringkasan_aktif and p.evaluasi_aktif and p.sumber_aktif,
    'semua jenis notifikasi seharusnya nyala secara bawaan';
  assert p.jam_timbang = time '06:30' and p.jam_timbang_akhir_pekan is null, 'jam bawaan seharusnya 06.30, akhir pekan sama';
  assert p.widget_aktif and p.notif_netral, 'widget & nada netral bawaan';
  perform public.pengaturan_notifikasi();
  assert (select count(*) from public.settings_notifications) = 1, 'pembacaan kedua tidak boleh menambah baris';
end $$;

-- 2. Perubahan yang sah tersimpan; jam di luar pagi / bukan kelipatan 15 ditolak.
do $$
declare v_gagal boolean;
begin
  update public.settings_notifications
     set jam_timbang = '06:45', jam_timbang_akhir_pekan = '08:00', ukuran_aktif = false, widget_aktif = false;
  assert (select jam_timbang_akhir_pekan from public.settings_notifications) = time '08:00', 'jam akhir pekan tersimpan';

  v_gagal := false;
  begin
    update public.settings_notifications set jam_timbang = '14:00';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jam timbang 14.00 seharusnya ditolak';

  v_gagal := false;
  begin
    update public.settings_notifications set jam_timbang = '06:40';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jam bukan kelipatan 15 menit seharusnya ditolak';

  v_gagal := false;
  begin
    update public.settings_notifications set jam_timbang_akhir_pekan = '03:45';
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'jam akhir pekan sebelum 04.00 seharusnya ditolak';

  -- Batas rentang sendiri sah.
  update public.settings_notifications set jam_timbang = '04:00', jam_timbang_akhir_pekan = '11:00';
end $$;

-- 3. Nada netral tidak bisa dimatikan.
do $$
declare v_gagal boolean := false;
begin
  begin
    update public.settings_notifications set notif_netral = false;
  exception when check_violation then v_gagal := true; end;
  assert v_gagal, 'notif_netral = false seharusnya ditolak: nada netral adalah janji, bukan pengaturan';
end $$;

-- 4. Tidak ada DELETE; pengguna lain tidak melihat & tidak mengubah.
do $$
declare v_gagal boolean := false;
begin
  begin
    delete from public.settings_notifications;
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'preferensi seharusnya tidak bisa dihapus';
end $$;

reset role;
set request.jwt.claim.sub = 'f2a2b2c2-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare v_gagal boolean := false;
begin
  assert (select count(*) from public.settings_notifications) = 0, 'B seharusnya tidak melihat preferensi A';
  update public.settings_notifications set widget_aktif = true;
  begin
    insert into public.settings_notifications (user_id) values ('f1a1b1c1-0000-0000-0000-000000000001');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'B seharusnya tidak bisa membuat preferensi atas nama A';
end $$;

reset role;
do $$
begin
  assert not (select widget_aktif from public.settings_notifications
               where user_id = 'f1a1b1c1-0000-0000-0000-000000000001'),
    'pembaruan B tidak boleh menyentuh preferensi A';
end $$;

set role anon;
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.pengaturan_notifikasi();
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa membaca preferensi';
end $$;

reset role;
delete from auth.users where id in ('f1a1b1c1-0000-0000-0000-000000000001', 'f2a2b2c2-0000-0000-0000-000000000002');
