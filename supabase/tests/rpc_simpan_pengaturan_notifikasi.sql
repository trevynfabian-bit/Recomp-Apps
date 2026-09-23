-- =============================================================================
-- Uji endpoint simpan_pengaturan_notifikasi.
-- =============================================================================
\set ON_ERROR_STOP on

reset role;
reset request.jwt.claim.sub;

insert into auth.users (id, email)
values
  ('b9b9b9b9-0000-0000-0000-000000000001', 'endp-a@contoh.test'),
  ('b8b8b8b8-0000-0000-0000-000000000002', 'endp-b@contoh.test');

set request.jwt.claim.sub = 'b9b9b9b9-0000-0000-0000-000000000001';
set role authenticated;

-- 1. Perubahan sebagian: hanya kolom yang dikirim yang berubah.
do $$
declare p public.settings_notifications;
begin
  -- Belum pernah membaca: baris bawaan dibuat oleh endpoint.
  p := public.simpan_pengaturan_notifikasi('{"ukuran_aktif": false}');
  assert not p.ukuran_aktif and p.timbang_aktif and p.jam_timbang = time '06:30',
    'hanya ukuran_aktif yang seharusnya berubah';

  p := public.simpan_pengaturan_notifikasi('{"jam_timbang": "07:15", "jam_timbang_akhir_pekan": "08:30", "widget_aktif": false}');
  assert p.jam_timbang = time '07:15' and p.jam_timbang_akhir_pekan = time '08:30' and not p.widget_aktif
    and not p.ukuran_aktif, format('hasil = %s', row(p.*));

  -- null = akhir pekan memakai jam hari kerja lagi.
  p := public.simpan_pengaturan_notifikasi('{"jam_timbang_akhir_pekan": null}');
  assert p.jam_timbang_akhir_pekan is null and p.jam_timbang = time '07:15', 'jam akhir pekan seharusnya kembali null';

  -- Objek kosong: tidak ada yang berubah.
  p := public.simpan_pengaturan_notifikasi('{}');
  assert p.jam_timbang = time '07:15', 'objek kosong tidak boleh mengubah apa pun';
end $$;

-- 2. Penolakan berpesan jelas (22023), bukan pelanggaran CHECK mentah.
do $$
declare
  kasus text[] := array[
    '{"jam_timbang": "14:00"}',
    '{"jam_timbang": "06:40"}',
    '{"jam_timbang": "6 pagi"}',
    '{"jam_timbang": 630}',
    '{"timbang_aktif": "ya"}',
    '{"notif_netral": false}',
    '{"nada": "tegas"}',
    '[]'
  ];
  pesan text[] := array[
    'Jam timbang harus antara 04.00 dan 11.00',
    'Jam timbang harus kelipatan 15 menit.',
    'Jam harus berformat JJ:MM',
    'Jam harus berformat JJ:MM',
    'timbang_aktif harus benar/salah',
    'Nada netral bukan pengaturan',
    'Pengaturan tidak dikenal: nada',
    'Perubahan harus berupa objek'
  ];
  i integer;
  v_pesan text;
begin
  for i in 1 .. array_length(kasus, 1) loop
    v_pesan := null;
    begin
      perform public.simpan_pengaturan_notifikasi(kasus[i]::jsonb);
    exception when invalid_parameter_value then
      get stacked diagnostics v_pesan = message_text;
    end;
    assert v_pesan like pesan[i] || '%', format('kasus %s: pesan "%s", seharusnya diawali "%s"', kasus[i], v_pesan, pesan[i]);
  end loop;
  -- Penolakan tidak mengubah apa pun (satu kunci buruk menolak seluruh perubahan).
  begin
    perform public.simpan_pengaturan_notifikasi('{"widget_aktif": true, "jam_timbang": "14:00"}');
  exception when invalid_parameter_value then null; end;
  assert not (select widget_aktif from public.settings_notifications), 'perubahan yang ditolak tidak boleh tersimpan sebagian';
end $$;

-- 3. Isolasi: B mengubah preferensinya sendiri saja.
reset role;
set request.jwt.claim.sub = 'b8b8b8b8-0000-0000-0000-000000000002';
set role authenticated;
do $$
begin
  perform public.simpan_pengaturan_notifikasi('{"widget_aktif": true, "jam_timbang": "05:00"}');
  assert (select count(*) from public.settings_notifications) = 1, 'B hanya melihat barisnya sendiri';
end $$;
reset role;
do $$
begin
  assert (select jam_timbang from public.settings_notifications where user_id = 'b9b9b9b9-0000-0000-0000-000000000001') = time '07:15',
    'perubahan B tidak boleh menyentuh A';
end $$;

set role anon;
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.simpan_pengaturan_notifikasi('{}');
  exception when insufficient_privilege then v_gagal := true; end;
  assert v_gagal, 'anon seharusnya tidak bisa menyimpan preferensi';
end $$;

reset role;
delete from auth.users where id in ('b9b9b9b9-0000-0000-0000-000000000001', 'b8b8b8b8-0000-0000-0000-000000000002');
