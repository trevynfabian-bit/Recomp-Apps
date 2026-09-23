-- =============================================================================
-- Uji estimasi body fat Navy.
--
-- Angka harapannya dihitung tangan dari rumusnya, bukan disalin dari keluaran:
--
--   pria · tinggi 178 cm · pinggang 85,4 cm · leher 38,5 cm
--   selisih 46,9 → 495 / (1,0324 − 0,19077·log10 46,9 + 0,15456·log10 178) − 450
--   log10 46,9 = 1,6712…  log10 178 = 2,2504…
--   penyebut = 1,0324 − 0,31882… + 0,34782… = 1,06140…
--   495 / 1,06140… = 466,3866… → 16,386…% → 16,4%
--
-- Yang lebih penting daripada angkanya: alasan penolakan harus DIBEDAKAN.
-- "Pinggang ≤ leher" dan "profil belum lengkap" menuntut tindakan yang berbeda
-- dari pengguna, dan menyamakan keduanya jadi "tidak bisa dihitung" membuat
-- orang memperbaiki hal yang salah.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values
  ('aaaa8888-0000-0000-0000-000000000008', 'bf-a@contoh.test'),
  ('aaaa9999-0000-0000-0000-000000000009', 'bf-b@contoh.test');

set request.jwt.claim.sub = 'aaaa8888-0000-0000-0000-000000000008';
set role authenticated;

-- 1. Tanpa pencatatan ukuran sama sekali: kodenya `catatan`, bukan keluhan
--    soal profil yang sebenarnya sudah benar.
do $$
declare b jsonb;
begin
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'catatan', format('kurang = %s, seharusnya catatan', b->>'kurang');
  assert (b->'persen') = 'null'::jsonb, 'persen seharusnya kosong';
  assert (b->>'ketidakpastian')::int = 4, 'ketidakpastian seharusnya tetap dilaporkan';
  assert (b->>'metode') = 'Navy', 'metodenya seharusnya disebut';
end $$;

-- 2. Ada ukuran, profil belum lengkap → alasannya profil, bukan ukuran.
do $$
declare b jsonb; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 3;
begin
  perform public.simpan_ukuran(v_tgl, 85.4, null, 38.5);

  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'jenis-kelamin',
    format('kurang = %s, seharusnya jenis-kelamin', b->>'kurang');

  update public.profiles set jenis_kelamin = 'pria';
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'tinggi', format('kurang = %s, seharusnya tinggi', b->>'kurang');
end $$;

-- 3. Profil lengkap → angka yang dihitung tangan di atas.
do $$
declare b jsonb;
begin
  update public.profiles set tinggi_cm = 178;
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);

  assert (b->>'kurang') is null, format('kurang = %s, seharusnya kosong', b->>'kurang');
  assert (b->>'persen')::numeric = 16.4, format('persen = %s, seharusnya 16,4', b->>'persen');
  assert (b->'rentang'->>'bawah')::numeric = 12.4,
    format('bawah = %s, seharusnya 16,386 − 4', b->'rentang'->>'bawah');
  assert (b->'rentang'->>'atas')::numeric = 20.4,
    format('atas = %s, seharusnya 16,386 + 4', b->'rentang'->>'atas');
  -- Rentangnya selalu ada; satu angka telanjang tidak pernah dikembalikan.
  assert (b->'rentang'->>'atas')::numeric - (b->'rentang'->>'bawah')::numeric = 8,
    'lebar rentang seharusnya dua kali ketidakpastian';

  assert (b->'masukan'->>'pinggang_cm')::numeric = 85.4, 'masukan tidak ikut dilaporkan';
  assert (b->'masukan'->>'tinggi_cm')::numeric = 178, 'tinggi tidak ikut dilaporkan';
end $$;

-- 4. Sensitivitas pinggang dihitung dari angka PENGGUNA SENDIRI: satu cm di
--    pinggang menggeser estimasinya, dan besarnya berbeda per ukuran tubuh.
do $$
declare b jsonb; v_sens numeric;
begin
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  v_sens := (b->>'sensitivitas_pinggang')::numeric;
  assert v_sens > 0, format('sensitivitas = %s, seharusnya positif', v_sens);
  assert v_sens between 0.5 and 1.5,
    format('sensitivitas = %s poin per cm, di luar besaran yang masuk akal', v_sens);
end $$;

-- 5. Pinggang ≤ leher: rumusnya tidak bisa dihitung, dan alasannya `ukuran` —
--    bukan keluhan soal profil yang sudah lengkap.
do $$
declare b jsonb; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 2;
begin
  perform public.simpan_ukuran(v_tgl, 50.0, null, 55.0);
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'ukuran', format('kurang = %s, seharusnya ukuran', b->>'kurang');
  assert (b->'persen') = 'null'::jsonb, 'persen seharusnya kosong';
  assert public.hapus_ukuran(v_tgl), 'pembersihan gagal';
end $$;

-- 6. Hasil di luar rentang yang pernah terukur pada manusia ditolak: itu salah
--    ukur, bukan temuan.
do $$
declare b jsonb; v_tgl date := (now() at time zone 'Asia/Jakarta')::date - 2;
begin
  -- Terlalu RENDAH: pinggang 60 dengan leher 30 pada tinggi 178 memberi 0,6%,
  -- di bawah batas hidup manusia (~3%).
  perform public.simpan_ukuran(v_tgl, 60.0, null, 30.0);
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'ukuran',
    format('kurang = %s; hasil 0,6%% seharusnya ditolak', b->>'kurang');

  -- Terlalu TINGGI: tinggi yang salah ketik (100 cm) dengan pinggang 160 dan
  -- leher 25 memberi ~79%, di atas yang pernah terukur (~70%).
  update public.profiles set tinggi_cm = 100;
  perform public.simpan_ukuran(v_tgl, 160.0, null, 25.0);
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'ukuran',
    format('kurang = %s; hasil di atas 70%% seharusnya ditolak', b->>'kurang');

  update public.profiles set tinggi_cm = 178;
  assert public.hapus_ukuran(v_tgl), 'pembersihan gagal';
end $$;

-- 7. Pengguna wanita: rumusnya butuh lingkar pinggul yang belum dicatat app
--    ini, dan rumus pria TIDAK dipakai sebagai pengganti.
do $$
declare b jsonb;
begin
  update public.profiles set jenis_kelamin = 'wanita';
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'pinggul', format('kurang = %s, seharusnya pinggul', b->>'kurang');
  assert (b->'persen') = 'null'::jsonb,
    'estimasi untuk wanita seharusnya dilewati, bukan dihitung dengan rumus pria';
  update public.profiles set jenis_kelamin = 'pria';
end $$;

-- 8. Komposisi tubuh memakai RATA-RATA 7 HARI, dan aritmetikanya konsisten
--    dengan persen yang ditampilkan.
do $$
declare b jsonb; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  -- Tanpa timbangan, komposisi tidak bisa dipecah — dan itu dinyatakan kosong.
  b := public.estimasi_body_fat(v_hari_ini);
  assert (b->'komposisi') = 'null'::jsonb, 'komposisi seharusnya kosong tanpa timbangan';

  perform public.simpan_berat_pagi(v_hari_ini, 75.0);
  b := public.estimasi_body_fat(v_hari_ini);
  assert (b->>'berat_kg')::numeric = 75.0, format('berat = %s', b->>'berat_kg');
  -- 16,4% dari 75 kg = 12,3 kg; sisanya 62,7 kg.
  assert (b->'komposisi'->>'lemak_kg')::numeric = 12.3,
    format('lemak = %s, seharusnya 12,3', b->'komposisi'->>'lemak_kg');
  assert (b->'komposisi'->>'bebas_lemak_kg')::numeric = 62.7,
    format('bebas lemak = %s, seharusnya 62,7', b->'komposisi'->>'bebas_lemak_kg');
  assert (b->'komposisi'->>'lemak_kg')::numeric
         + (b->'komposisi'->>'bebas_lemak_kg')::numeric = 75.0,
    'dua bagian komposisi seharusnya berjumlah berat utuh';
end $$;

-- 9. Tanggal acuan memilih pencatatan TERAKHIR pada/sebelumnya, dan pencatatan
--    yang tidak memuat kedua lingkar dilewati — bukan dipakai sebagian.
do $$
declare b jsonb; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  -- Pencatatan kemarin hanya berisi paha: tidak membuat estimasi jadi mungkin.
  perform public.simpan_ukuran(v_hari_ini - 1, null, null, null, null, null, 57.0, 57.4);
  b := public.estimasi_body_fat(v_hari_ini);
  assert (b->'masukan'->>'tanggal_ukuran') = (v_hari_ini - 3)::text,
    format('tanggal ukuran = %s, seharusnya pencatatan lengkap 3 hari lalu',
           b->'masukan'->>'tanggal_ukuran');

  -- Tanggal acuan SEBELUM pencatatan mana pun: tidak ada yang bisa dipakai.
  b := public.estimasi_body_fat(v_hari_ini - 10);
  assert (b->>'kurang') = 'catatan',
    format('kurang = %s; tanggal sebelum pencatatan mana pun seharusnya catatan',
           b->>'kurang');
end $$;

-- 10. Isolasi & hak akses.
reset role;
set request.jwt.claim.sub = 'aaaa9999-0000-0000-0000-000000000009';
set role authenticated;

do $$
declare b jsonb;
begin
  update public.profiles set jenis_kelamin = 'pria', tinggi_cm = 170;
  b := public.estimasi_body_fat((now() at time zone 'Asia/Jakarta')::date);
  assert (b->>'kurang') = 'catatan',
    format('kurang = %s; pengguna B membaca ukuran pengguna A', b->>'kurang');
end $$;

reset role;
reset request.jwt.claim.sub;
do $$
begin
  begin
    perform public.estimasi_body_fat(null);
    assert false, 'tanpa sesi seharusnya ditolak';
  exception when invalid_authorization_specification then null; end;

  assert not has_function_privilege('anon', 'public.estimasi_body_fat(date)', 'execute'),
    'anon masih boleh menghitung body fat';
  assert has_function_privilege('authenticated', 'public.estimasi_body_fat(date)', 'execute'),
    'authenticated seharusnya boleh menghitung body fat';
end $$;

select '✓ body fat Navy: angka cocok hitungan tangan, alasan penolakan dibedakan, rentang selalu ada, isolasi terjaga' as hasil;
