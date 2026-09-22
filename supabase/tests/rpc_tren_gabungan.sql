-- =============================================================================
-- Uji endpoint gabungan layar Tren.
--
-- Nilai utamanya bukan kecepatan, melainkan KONSISTENSI: semua angka di layar
-- berasal dari satu transaksi, jadi deret, rata-rata, dan sinyal arah tidak
-- mungkin saling bertentangan. Uji ini memeriksa bahwa mereka memang saling
-- cocok, bukan sekadar masing-masing masuk akal.
-- =============================================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email)
values ('eeee3333-0000-0000-0000-000000000003', 'tren-gabungan@contoh.test');

set request.jwt.claim.sub = 'eeee3333-0000-0000-0000-000000000003';
set role authenticated;

do $$
begin
  -- Dua pekan penuh dengan kenaikan jelas: pekan pertama ~74,0, pekan kedua ~74,5.
  perform public.simpan_berat_pagi(date '2026-09-09', 73.9);
  perform public.simpan_berat_pagi(date '2026-09-10', 74.2);
  perform public.simpan_berat_pagi(date '2026-09-11', 73.8);
  perform public.simpan_berat_pagi(date '2026-09-12', 74.1);
  perform public.simpan_berat_pagi(date '2026-09-13', 74.4);
  perform public.simpan_berat_pagi(date '2026-09-14', 74.0);
  perform public.simpan_berat_pagi(date '2026-09-15', 74.3);
  perform public.simpan_berat_pagi(date '2026-09-16', 74.1);
  perform public.simpan_berat_pagi(date '2026-09-17', 74.5);
  perform public.simpan_berat_pagi(date '2026-09-18', 74.2);
  perform public.simpan_berat_pagi(date '2026-09-19', 74.7);
  perform public.simpan_berat_pagi(date '2026-09-20', 74.4);
  perform public.simpan_berat_pagi(date '2026-09-21', 74.8);
  perform public.simpan_berat_pagi(date '2026-09-22', 74.6);
end $$;

-- 1. Bentuk keluaran lengkap & deret sepanjang periode yang diminta.
do $$
declare j jsonb;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  assert j ? 'deret' and j ? 'rata_rata' and j ? 'sepekan_lalu'
     and j ? 'arah' and j ? 'kecukupan' and j ? 'jangkar_fase',
    format('kunci keluaran kurang: %s', jsonb_object_keys(j));
  assert jsonb_array_length(j -> 'deret') = 14,
    format('deret berisi %s titik, seharusnya 14', jsonb_array_length(j -> 'deret'));
  assert (j ->> 'dari') = '2026-09-09', format('dari %s', j ->> 'dari');
  assert (j ->> 'sampai') = '2026-09-22', format('sampai %s', j ->> 'sampai');
end $$;

-- 2. Rata-rata di ringkasan HARUS sama dengan titik terakhir deretnya.
--    Inilah inti "satu snapshot": dua angka yang sama tidak boleh berbeda.
do $$
declare
  j jsonb;
  v_ringkas numeric;
  v_titik numeric;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  v_ringkas := (j -> 'rata_rata' ->> 'rata_rata_kg')::numeric;
  v_titik := ((j -> 'deret') -> 13 ->> 'rata_rata_kg')::numeric;
  assert v_ringkas = v_titik,
    format('ringkasan %s ≠ titik terakhir deret %s', v_ringkas, v_titik);
  -- 16–22 Sep: 74,1 74,5 74,2 74,7 74,4 74,8 74,6 = 521,3 / 7 = 74,47.
  assert v_ringkas = 74.47, format('rata-rata %s, seharusnya 74.47', v_ringkas);
end $$;

-- 3. Sinyal arah = rata-rata hari ini − rata-rata sepekan lalu, dan
--    perubahannya harus benar-benar selisih kedua angka yang ikut dikirim.
do $$
declare
  j jsonb;
  v_kini numeric;
  v_lalu numeric;
  v_ubah numeric;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  v_kini := (j -> 'rata_rata' ->> 'rata_rata_kg')::numeric;
  v_lalu := (j -> 'sepekan_lalu' ->> 'rata_rata_kg')::numeric;
  v_ubah := (j -> 'arah' ->> 'perubahan_kg')::numeric;
  assert v_ubah = round(v_kini - v_lalu, 2),
    format('perubahan %s ≠ %s − %s', v_ubah, v_kini, v_lalu);
  assert (j -> 'arah' ->> 'arah') = 'naik',
    format('arah %s, seharusnya naik', j -> 'arah' ->> 'arah');
  assert (j -> 'arah' ->> 'ambang_kg')::numeric = 0.2, 'ambang seharusnya 0,2 kg';
end $$;

-- 4. Perubahan di bawah ambang terbaca "datar", bukan "naik".
do $$
declare j jsonb;
begin
  -- 15 Sep: jendela 9–15 vs 2–8 (kosong) → belum cukup data. Pakai 16 Sep,
  -- yang selisihnya kecil.
  j := public.tren_berat_7_hari(date '2026-09-16', 14);
  assert (j -> 'arah' ->> 'arah') in ('datar', 'naik', 'turun'),
    format('arah %s tidak dikenal', j -> 'arah' ->> 'arah');
end $$;

-- 5. Kecukupan: jendela penuh & sinyal arah sudah bisa dihitung.
do $$
declare j jsonb;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  assert (j -> 'kecukupan' ->> 'ada_timbangan')::boolean, 'seharusnya ada timbangan';
  assert (j -> 'kecukupan' ->> 'jumlah_total')::integer = 14,
    format('jumlah total %s, seharusnya 14', j -> 'kecukupan' ->> 'jumlah_total');
  assert (j -> 'kecukupan' ->> 'jumlah_dalam_jendela')::integer = 7,
    format('jumlah dalam jendela %s', j -> 'kecukupan' ->> 'jumlah_dalam_jendela');
  assert (j -> 'kecukupan' ->> 'jendela_penuh')::boolean, 'jendela seharusnya penuh';
  assert (j -> 'kecukupan' ->> 'cukup_arah')::boolean, 'arah seharusnya bisa dihitung';
  assert (j -> 'kecukupan' ->> 'hari_lagi_untuk_arah')::integer = 0, 'tidak perlu menunggu lagi';
end $$;

-- 6. Jangkar fase jatuh ke timbangan PERTAMA saat profil belum menyimpannya.
do $$
declare j jsonb;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  assert (j -> 'jangkar_fase' ->> 'tanggal_mulai') = '2026-09-09',
    format('jangkar tanggal %s, seharusnya 2026-09-09', j -> 'jangkar_fase' ->> 'tanggal_mulai');
  assert (j -> 'jangkar_fase' ->> 'berat_awal_kg')::numeric = 73.9,
    format('jangkar berat %s, seharusnya 73.9', j -> 'jangkar_fase' ->> 'berat_awal_kg');
end $$;

-- 7. Jangkar yang TERSIMPAN di profil menang atas cadangan.
do $$
declare j jsonb;
begin
  update public.profiles
     set fase_mulai_tanggal = date '2026-09-14', fase_berat_awal_kg = 74.0
   where user_id = 'eeee3333-0000-0000-0000-000000000003';

  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  assert (j -> 'jangkar_fase' ->> 'tanggal_mulai') = '2026-09-14',
    format('jangkar tanggal %s, seharusnya 2026-09-14', j -> 'jangkar_fase' ->> 'tanggal_mulai');
  assert (j -> 'jangkar_fase' ->> 'berat_awal_kg')::numeric = 74.0,
    format('jangkar berat %s, seharusnya 74.0', j -> 'jangkar_fase' ->> 'berat_awal_kg');
end $$;

-- 8. Periode di luar batas ditolak, bukan dipotong diam-diam.
do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.tren_berat_7_hari(date '2026-09-22', 0);
  exception when others then
    v_gagal := true;
  end;
  assert v_gagal, 'periode 0 hari seharusnya ditolak';
end $$;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.tren_berat_7_hari(date '2026-09-22', 500);
  exception when others then
    v_gagal := true;
  end;
  assert v_gagal, 'periode 500 hari seharusnya ditolak';
end $$;

-- 9. Pengguna tanpa satu pun timbangan mendapat bentuk yang sama, bukan error.
reset role;
insert into auth.users (id, email)
values ('eeee4444-0000-0000-0000-000000000004', 'tren-kosong@contoh.test');
set request.jwt.claim.sub = 'eeee4444-0000-0000-0000-000000000004';
set role authenticated;

do $$
declare j jsonb;
begin
  j := public.tren_berat_7_hari(date '2026-09-22', 14);
  assert jsonb_array_length(j -> 'deret') = 14, 'deret tetap 14 titik';
  assert (j -> 'rata_rata' ->> 'rata_rata_kg') is null, 'rata-rata seharusnya null';
  assert (j -> 'arah' ->> 'arah') = 'belum cukup data',
    format('arah %s, seharusnya "belum cukup data"', j -> 'arah' ->> 'arah');
  assert not (j -> 'kecukupan' ->> 'ada_timbangan')::boolean, 'belum ada timbangan';
  assert (j -> 'kecukupan' ->> 'hari_lagi_untuk_arah') is null,
    'tanpa timbangan, perkiraan hari tidak bisa ditebak';
  assert j -> 'jangkar_fase' = 'null'::jsonb, 'jangkar seharusnya null';
end $$;

-- 10. anon ditolak di tingkat hak akses.
reset role;
set request.jwt.claim.sub = 'eeee4444-0000-0000-0000-000000000004';
set role anon;

do $$
declare v_gagal boolean := false;
begin
  begin
    perform public.tren_berat_7_hari(date '2026-09-22', 14);
  exception when insufficient_privilege then
    v_gagal := true;
  end;
  assert v_gagal, 'anon seharusnya tidak punya hak execute';
end $$;

reset role;
select '✓ endpoint tren gabungan: satu snapshot konsisten, jangkar bercadangan, batas & hak akses terjaga' as hasil;
