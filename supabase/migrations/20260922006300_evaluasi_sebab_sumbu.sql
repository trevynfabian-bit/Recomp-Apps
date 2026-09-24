-- =============================================================================
-- Evaluasi 4 mingguan: setiap sumbu yang belum terbaca menyebut sebabnya
--
-- Sumbu kekuatan sudah menyebut kenapa ia `belum jelas`; berat dan pinggang
-- belum, padahal justru keduanya yang paling sering kosong (pengguna baru,
-- timbangan jarang, pinggang belum pernah dicatat). Tanpa sebab, layar hanya
-- bisa berkata "data kurang" tanpa memberi tahu apa yang perlu dicatat.
-- Kini setiap sumbu membawa `sebab` (null bila sumbunya terbaca), dan hitungan
-- penopangnya selalu angka (0, bukan null) untuk pengguna tanpa data.
-- Aman dijalankan ulang.
-- =============================================================================

create or replace function public.evaluasi_4_mingguan(p_sampai date default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_acuan date := coalesce(p_sampai, (now() at time zone 'Asia/Jakarta')::date);
  -- Empat pekan yang SUDAH selesai: Senin empat pekan sebelum pekan ini sampai
  -- Minggu kemarin-pekan.
  v_dari date := public.awal_minggu(v_acuan) - (public.pekan_evaluasi() * 7);
  v_sampai date := public.awal_minggu(v_acuan) - 1;
  v_fase public.fase_program;
  v_berat_awal numeric;
  v_berat_akhir numeric;
  v_n_awal integer;
  v_n_akhir integer;
  v_selisih_berat numeric;
  v_pinggang_awal numeric;
  v_pinggang_akhir numeric;
  v_n_pinggang integer;
  v_selisih_pinggang numeric;
  v_pekan_data integer;
  v_arah_berat text;
  v_arah_pinggang text;
  v_arah_kekuatan text;
  v_kekuatan jsonb;
  v_verdict jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  -- Fase yang berlaku di AKHIR periode: evaluasinya menilai apakah fase itu
  -- berjalan, jadi fase yang dipakai harus fase yang sedang dinilai.
  v_fase := public.fase_pada_tanggal(v_sampai);

  -- Berat: rata-rata 7 hari di akhir pekan PERTAMA vs di akhir periode. Bukan
  -- timbangan harian di dua ujung — dua timbangan tunggal akan menjadikan
  -- goyangan air sebagai verdict empat pekan.
  select r.rata_rata_kg, r.jumlah_timbangan into v_berat_awal, v_n_awal
    from public.rata_rata_berat_7_hari(v_dari + 6) as r;
  select r.rata_rata_kg, r.jumlah_timbangan into v_berat_akhir, v_n_akhir
    from public.rata_rata_berat_7_hari(v_sampai) as r;

  -- Rata-rata dari satu-dua timbangan tidak cukup untuk dipakai sebagai ujung
  -- sebuah tren empat pekan.
  if v_n_awal >= 3 and v_n_akhir >= 3 then
    v_selisih_berat := v_berat_akhir - v_berat_awal;
  end if;
  v_arah_berat := public.arah_metrik(v_selisih_berat, public.ambang_berat_evaluasi());

  -- Pinggang: pencatatan pertama vs terakhir di dalam periode.
  select count(*) into v_n_pinggang
    from public.body_measurements
   where user_id = v_user_id and tanggal between v_dari and v_sampai
     and pinggang_cm is not null;

  if v_n_pinggang >= 2 then
    select pinggang_cm into v_pinggang_awal from public.body_measurements
     where user_id = v_user_id and tanggal between v_dari and v_sampai
       and pinggang_cm is not null
     order by tanggal asc limit 1;
    select pinggang_cm into v_pinggang_akhir from public.body_measurements
     where user_id = v_user_id and tanggal between v_dari and v_sampai
       and pinggang_cm is not null
     order by tanggal desc limit 1;
    v_selisih_pinggang := v_pinggang_akhir - v_pinggang_awal;
  end if;
  v_arah_pinggang := public.arah_metrik(v_selisih_pinggang, public.ambang_pinggang_evaluasi());

  -- Pekan yang punya setidaknya satu timbangan.
  select count(distinct public.awal_minggu(tanggal)) into v_pekan_data
    from public.daily_logs
   where user_id = v_user_id and tanggal between v_dari and v_sampai
     and berat_pagi_kg is not null;

  -- Kekuatan: e1RM tiap gerakan yang diulang, sesi pertama vs terakhir di
  -- dalam periode (sama dengan arahKekuatan + ringkasArahKekuatan di TS).
  v_kekuatan := public.arah_kekuatan_periode(v_dari, v_sampai);
  v_arah_kekuatan := v_kekuatan ->> 'arah';

  v_verdict := public.kode_evaluasi(
    v_fase, v_arah_berat, v_arah_pinggang, v_arah_kekuatan, v_pekan_data);

  return jsonb_build_object(
    'periode_dari', v_dari,
    'periode_sampai', v_sampai,
    'fase', v_fase,
    'pekan_data', v_pekan_data,
    'sumbu', jsonb_build_object(
      'berat', jsonb_build_object(
        'arah', v_arah_berat,
        'awal_kg', v_berat_awal,
        'akhir_kg', v_berat_akhir,
        'selisih_kg', v_selisih_berat,
        'ambang_kg', public.ambang_berat_evaluasi(),
        'jumlah_timbangan', jsonb_build_array(v_n_awal, v_n_akhir),
        'sebab', case when v_selisih_berat is null
                      then 'butuh minimal 3 timbangan di pekan pertama dan di pekan terakhir periode ini' end
      ),
      'pinggang', jsonb_build_object(
        'arah', v_arah_pinggang,
        'awal_cm', v_pinggang_awal,
        'akhir_cm', v_pinggang_akhir,
        'selisih_cm', v_selisih_pinggang,
        'ambang_cm', public.ambang_pinggang_evaluasi(),
        'jumlah_pencatatan', v_n_pinggang,
        'sebab', case when v_selisih_pinggang is null
                      then 'butuh minimal 2 pencatatan pinggang dalam periode ini' end
      ),
      'kekuatan', v_kekuatan
    ),
    'kode', v_verdict ->> 'kode',
    'penentu', v_verdict ->> 'penentu',
    'keyakinan', v_verdict ->> 'keyakinan'
  );
end;
$$;
