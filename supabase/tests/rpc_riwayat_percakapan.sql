-- =============================================================================
-- Uji endpoint riwayat percakapan coach.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('7a7a7a7a-0000-0000-0000-00000000000a', 'riwayat-a@contoh.test'),
  ('7a7a7a7a-0000-0000-0000-00000000000b', 'riwayat-b@contoh.test');

-- Tiga utas A dengan waktu terakhir berbeda; utas 3 berisi 5 pesan, pesan
-- terakhir utas 2 adalah kartu penolakan.
do $$
declare u uuid := '7a7a7a7a-0000-0000-0000-00000000000a'; p1 uuid; p2 uuid; p3 uuid; i int;
begin
  insert into public.percakapan (user_id, judul) values (u, 'Utas satu') returning id into p1;
  insert into public.percakapan (user_id, judul) values (u, 'Utas dua') returning id into p2;
  insert into public.percakapan (user_id, judul) values (u, 'Utas tiga') returning id into p3;
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks) values (p1, u, 'pengguna', 'Protein saya cukup?');
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks) values (p2, u, 'pengguna', 'Dosis metformin?');
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, penolakan)
  values (p2, u, 'coach', '', '{"kategori": "dosis-obat"}'::jsonb);
  for i in 1..5 loop
    insert into public.pesan_coach (percakapan_id, user_id, peran, teks)
    values (p3, u, case when i % 2 = 1 then 'pengguna' else 'coach' end, format('Pesan   ke-%s', i));
  end loop;
  update public.percakapan set diperbarui_pada = now() - interval '3 hour' where id = p1;
  update public.percakapan set diperbarui_pada = now() - interval '2 hour' where id = p2;
  update public.percakapan set diperbarui_pada = now() - interval '1 hour' where id = p3;
  perform set_config('uji.p3', p3::text, false);
end $$;

set request.jwt.claim.sub = '7a7a7a7a-0000-0000-0000-00000000000a';
set role authenticated;

-- 1. Daftar utas: terbaru dulu, jumlah pesan, cuplikan (kartu disebut jenisnya).
do $$
declare r jsonb;
begin
  r := public.riwayat_percakapan_saya();
  assert jsonb_array_length(r->'utas') = 3 and r->'berikutnya' = 'null'::jsonb, format('riwayat %s', r);
  assert r->'utas'->0->>'judul' = 'Utas tiga' and r->'utas'->2->>'judul' = 'Utas satu', 'urutan utas bukan terbaru dulu';
  assert (r->'utas'->0->>'jumlah_pesan')::int = 5, 'jumlah pesan utas tiga';
  assert r->'utas'->0->'terakhir'->>'cuplikan' = 'Pesan ke-5', format('cuplikan dirapikan %s', r->'utas'->0->'terakhir');
  assert r->'utas'->1->'terakhir'->>'cuplikan' = 'Batas medis', format('cuplikan kartu %s', r->'utas'->1->'terakhir');
end $$;

-- 2. Halaman: batas 2 → kursor; halaman berikutnya berisi sisanya saja.
do $$
declare r jsonb; r2 jsonb;
begin
  r := public.riwayat_percakapan_saya(null, 2);
  assert jsonb_array_length(r->'utas') = 2 and r->>'berikutnya' is not null, format('halaman 1 %s', r);
  r2 := public.riwayat_percakapan_saya((r->>'berikutnya')::timestamptz, 2);
  assert jsonb_array_length(r2->'utas') = 1 and r2->'utas'->0->>'judul' = 'Utas satu' and r2->'berikutnya' = 'null'::jsonb,
    format('halaman 2 %s', r2);
end $$;

-- 3. Pesan satu utas: urutan tulis; halaman terbaru dulu, kursor ke yang lebih lama.
do $$
declare r jsonb; r2 jsonb;
begin
  r := public.pesan_percakapan(current_setting('uji.p3')::uuid, null, 3);
  assert r->>'judul' = 'Utas tiga' and jsonb_array_length(r->'pesan') = 3, format('pesan %s', r);
  assert r->'pesan'->0->>'teks' = 'Pesan   ke-3' and r->'pesan'->2->>'teks' = 'Pesan   ke-5', 'halaman terbaru dalam urutan tulis';
  assert r->>'lebih_lama' is not null, 'kursor lebih lama hilang';
  r2 := public.pesan_percakapan(current_setting('uji.p3')::uuid, (r->>'lebih_lama')::bigint, 3);
  assert jsonb_array_length(r2->'pesan') = 2 and r2->'pesan'->0->>'teks' = 'Pesan   ke-1' and r2->'lebih_lama' = 'null'::jsonb,
    format('halaman lebih lama %s', r2);
end $$;

-- 4. Batas halaman di luar rentang ditolak.
do $$
declare v text;
begin
  begin perform public.riwayat_percakapan_saya(null, 0); exception when others then v := sqlstate; end;
  assert v = '22003', format('batas 0: %s', v);
  v := null;
  begin perform public.pesan_percakapan(current_setting('uji.p3')::uuid, null, 500); exception when others then v := sqlstate; end;
  assert v = '22003', format('batas 500: %s', v);
end $$;

-- 5. Isolasi: B tidak melihat utas A; utas A dan utas yang tidak ada dijawab sama.
set request.jwt.claim.sub = '7a7a7a7a-0000-0000-0000-00000000000b';
do $$
declare v text; v2 text;
begin
  assert jsonb_array_length(public.riwayat_percakapan_saya()->'utas') = 0, 'B melihat utas A';
  begin perform public.pesan_percakapan(current_setting('uji.p3')::uuid); exception when others then v := sqlstate; end;
  begin perform public.pesan_percakapan(gen_random_uuid()); exception when others then v2 := sqlstate; end;
  assert v = 'P0002' and v2 = 'P0002', format('utas orang lain %s / tidak ada %s, seharusnya sama-sama P0002', v, v2);
end $$;

-- 6. Tanpa sesi ditolak; anon tidak punya hak.
set request.jwt.claim.sub = '';
do $$
declare v text;
begin
  begin perform public.riwayat_percakapan_saya(); exception when others then v := sqlstate; end;
  assert v = '28000', format('tanpa sesi: %s', v);
end $$;
reset role;
set role anon;
do $$
declare v boolean := false;
begin
  begin perform public.riwayat_percakapan_saya(); exception when insufficient_privilege then v := true; end;
  assert v, 'anon bisa memanggil riwayat_percakapan_saya';
end $$;

reset role;
reset request.jwt.claim.sub;
delete from auth.users where id in ('7a7a7a7a-0000-0000-0000-00000000000a', '7a7a7a7a-0000-0000-0000-00000000000b');
select '✓ riwayat percakapan: terbaru dulu dengan cuplikan, halaman berkursor, pesan dalam urutan tulis, isolasi & hak akses' as hasil;
