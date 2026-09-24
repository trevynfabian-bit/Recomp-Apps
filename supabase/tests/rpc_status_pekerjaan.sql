-- =============================================================================
-- Uji endpoint status pekerjaan (impor, sinkron, ekspor).
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'status-a@contoh.test'),
  ('5a5a5a5a-0000-0000-0000-00000000000b', 'status-b@contoh.test');

-- Koneksi A: Apple Health baik, WHOOP galat, Strava terputus, Hevy belum sinkron.
insert into public.health_connections (user_id, sumber, status, akun_eksternal, sinkron_terakhir, galat_terakhir, galat_pada) values
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'apple_health', 'terhubung', null, now() - interval '1 hour', null, null),
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'whoop', 'terhubung', 'st-w', now() - interval '2 hour', 'Izin ditolak', now()),
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'strava', 'terputus', null, null, null, null),
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'hevy', 'terhubung', null, null, null, null);

set request.jwt.claim.sub = '5a5a5a5a-0000-0000-0000-00000000000a';
set role authenticated;

-- 1. Impor: terakhir per sumber, dengan persen; kosong sebelum ada impor.
do $$
declare s jsonb; j public.import_jobs;
begin
  s := public.status_pekerjaan_saya();
  assert jsonb_array_length(s->'impor') = 0, 'impor seharusnya kosong';
  assert s->'ekspor'->>'disusun_di' = 'perangkat', 'ekspor tidak dinyatakan';

  j := public.mulai_impor('ukuran_lama', 40, 'uji lama', '[]'::jsonb);
  perform public.selesaikan_impor(j.id, null);
  j := public.mulai_impor('ukuran_lama', 8, 'uji baru', '[]'::jsonb);
  s := public.status_pekerjaan_saya();
  assert jsonb_array_length(s->'impor') = 1, format('%s impor, seharusnya 1 per sumber', jsonb_array_length(s->'impor'));
  assert s->'impor'->0->>'ringkas' = 'uji baru' and s->'impor'->0->>'status' = 'berjalan', format('impor %s', s->'impor'->0);
  assert (s->'impor'->0->>'persen')::int = 0, 'persen awal';
end $$;

-- 2. Impor yang diam lebih dari 10 menit dilaporkan `terhenti`, dan pada saat
--    yang sama `mulai_impor` mengizinkan impor baru (ambang yang sama).
reset role;
update public.import_jobs set diperbarui_pada = now() - interval '9 minutes'
 where user_id = '5a5a5a5a-0000-0000-0000-00000000000a' and status = 'berjalan';
set role authenticated;
do $$
declare v text;
begin
  assert public.status_pekerjaan_saya()->'impor'->0->>'status' = 'berjalan', '9 menit diam masih berjalan';
  begin perform public.mulai_impor('ukuran_lama', 5, 'terlalu cepat', '[]'::jsonb); exception when others then v := sqlstate; end;
  assert v = '55006', format('impor baru saat yang lama masih berjalan: %s', v);
end $$;
reset role;
update public.import_jobs set diperbarui_pada = now() - interval '11 minutes'
 where user_id = '5a5a5a5a-0000-0000-0000-00000000000a' and status = 'berjalan';
set role authenticated;
do $$
declare j public.import_jobs;
begin
  assert public.status_pekerjaan_saya()->'impor'->0->>'status' = 'terhenti', '11 menit diam seharusnya terhenti';
  j := public.mulai_impor('ukuran_lama', 5, 'pengganti', '[]'::jsonb);
  assert public.status_pekerjaan_saya()->'impor'->0->>'ringkas' = 'pengganti', 'impor pengganti tidak jadi yang terakhir';
end $$;

-- 3. Sinkron: satu keadaan per koneksi.
do $$
declare s jsonb; k jsonb;
begin
  s := public.status_pekerjaan_saya();
  select jsonb_object_agg(x->>'sumber', x->>'keadaan') into k from jsonb_array_elements(s->'sinkron') x;
  assert k = '{"apple_health": "baik", "whoop": "galat", "strava": "terputus", "hevy": "belum_sinkron"}'::jsonb, format('keadaan sinkron %s', k);
  assert s::text not like '%st-w%', 'id akun luar tidak perlu dikirim ke layar status';
end $$;

-- 4. Isolasi: B melihat miliknya sendiri (kosong).
set request.jwt.claim.sub = '5a5a5a5a-0000-0000-0000-00000000000b';
do $$
declare s jsonb;
begin
  s := public.status_pekerjaan_saya();
  assert jsonb_array_length(s->'impor') = 0 and jsonb_array_length(s->'sinkron') = 0, format('B melihat status A: %s', s);
end $$;

-- 5. Tanpa sesi ditolak; anon tidak punya hak.
set request.jwt.claim.sub = '';
do $$
declare v text;
begin
  begin perform public.status_pekerjaan_saya(); exception when others then v := sqlstate; end;
  assert v = '28000', format('tanpa sesi: %s', v);
end $$;
reset role;
set role anon;
do $$
declare v boolean := false;
begin
  begin perform public.status_pekerjaan_saya(); exception when insufficient_privilege then v := true; end;
  assert v, 'anon bisa memanggil status_pekerjaan_saya';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('5a5a5a5a-0000-0000-0000-00000000000a', '5a5a5a5a-0000-0000-0000-00000000000b');
select '✓ status pekerjaan: impor terakhir per sumber (terhenti setelah 10 menit diam, sama dengan mulai_impor), keadaan sinkron, ekspor di perangkat' as hasil;
