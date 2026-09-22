-- ---------------------------------------------------------------------------
-- Endpoint gabungan layar Tren.
--
-- Layar Tren butuh SATU set angka yang konsisten satu sama lain: deret grafik,
-- rata-rata hari ini, rata-rata sepekan lalu, sinyal arah, dan kecukupan data.
-- Mengambilnya lewat lima panggilan terpisah bukan cuma lambat — ia membuka
-- kemungkinan yang lebih buruk: timbangan pagi yang masuk di antara dua
-- panggilan menghasilkan layar yang angkanya tidak cocok satu sama lain, dan
-- ketidakcocokan itu tidak akan pernah bisa direproduksi saat dilaporkan.
--
-- Satu panggilan, satu snapshot, satu transaksi.
-- ---------------------------------------------------------------------------

-- Jangkar fase: berat & tanggal saat fase yang sedang berjalan dimulai.
-- Koridor target digambar dari titik ini, jadi tanpa keduanya layar Tren tidak
-- punya acuan sama sekali. Nullable karena pengguna yang belum pernah berganti
-- fase memang belum punya — endpoint di bawah mengisinya dengan timbangan
-- pertama sebagai cadangan.
alter table public.profiles add column if not exists fase_mulai_tanggal date;
alter table public.profiles add column if not exists fase_berat_awal_kg numeric(5, 1);

comment on column public.profiles.fase_mulai_tanggal is
  'Tanggal fase aktif dimulai; titik awal koridor target di layar Tren.';
comment on column public.profiles.fase_berat_awal_kg is
  'Berat saat fase aktif dimulai; titik awal koridor target di layar Tren.';

-- ---------------------------------------------------------------------------
create or replace function public.tren_berat_7_hari(
  p_sampai date,
  p_hari integer default 14
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_jendela constant integer := 7;
  -- Ambang "datar" yang sama dengan `sinyalArah` di @recomp/logika: di bawah
  -- 0,2 kg per pekan, perubahannya masih dalam rentang goyangan air.
  v_ambang constant numeric := 0.2;
  v_dari date;
  v_deret jsonb;
  v_rata numeric;
  v_n integer;
  v_rata_lalu numeric;
  v_n_lalu integer;
  v_perubahan numeric;
  v_arah text;
  v_total integer;
  v_pertama date;
  v_hari_lagi integer;
  v_fase text;
  v_jangkar_tanggal date;
  v_jangkar_berat numeric;
begin
  if p_sampai is null then
    raise exception 'Tanggal akhir tidak boleh kosong' using errcode = '22004';
  end if;
  if p_hari is null or p_hari < 1 or p_hari > 400 then
    raise exception 'Panjang periode harus 1–400 hari; diminta %', p_hari
      using errcode = '22003';
  end if;

  v_dari := p_sampai - (p_hari - 1);

  -- Deret grafik; fungsinya sudah menjaga jendela penuh di titik pertama.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'tanggal', d.tanggal,
               'rata_rata_kg', d.rata_rata_kg,
               'jumlah_timbangan', d.jumlah_timbangan,
               'berat_harian_kg', d.berat_harian_kg
             )
             order by d.tanggal
           ),
           '[]'::jsonb
         )
    into v_deret
    from public.deret_rata_rata_7_hari(v_dari, p_sampai) d;

  select r.rata_rata_kg, r.jumlah_timbangan
    into v_rata, v_n
    from public.rata_rata_berat_7_hari(p_sampai) r;

  select r.rata_rata_kg, r.jumlah_timbangan
    into v_rata_lalu, v_n_lalu
    from public.rata_rata_berat_7_hari(p_sampai - v_jendela) r;

  -- Sinyal arah: rata-rata vs rata-rata, BUKAN angka harian vs angka harian —
  -- supaya satu hari yang aneh tidak mengubah kesimpulan.
  if v_rata is null or v_rata_lalu is null then
    v_arah := 'belum cukup data';
    v_perubahan := null;
  else
    v_perubahan := round(v_rata - v_rata_lalu, 2);
    if abs(v_perubahan) < v_ambang then
      v_arah := 'datar';
    elsif v_perubahan > 0 then
      v_arah := 'naik';
    else
      v_arah := 'turun';
    end if;
  end if;

  -- Kecukupan dihitung atas rentang yang SAMA dengan deretnya, bukan atas
  -- seluruh riwayat: yang perlu dijawab adalah "seberapa tebal dasar grafik
  -- yang sedang dilihat", bukan "sudah berapa kali orang ini menimbang".
  select count(*)::integer, min(l.tanggal)
    into v_total, v_pertama
    from public.daily_logs l
    where l.user_id = (select auth.uid())
      and l.berat_pagi_kg is not null
      and l.tanggal >= v_dari
      and l.tanggal <= p_sampai;

  if v_n > 0 and v_n_lalu > 0 then
    v_hari_lagi := 0;
  elsif v_pertama is null then
    v_hari_lagi := null;
  else
    -- Sinyal arah baru mungkin setelah jendela SEBELUMNYA ikut berisi, yaitu
    -- tujuh hari sesudah timbangan pertama.
    v_hari_lagi := greatest((v_pertama + v_jendela) - p_sampai, 0);
  end if;

  select p.fase_aktif::text, p.fase_mulai_tanggal, p.fase_berat_awal_kg
    into v_fase, v_jangkar_tanggal, v_jangkar_berat
    from public.profiles p
    where p.user_id = (select auth.uid());

  -- Cadangan jangkar: timbangan PERTAMA yang pernah tercatat. Pengguna yang
  -- belum pernah berganti fase tetap harus punya koridor, bukan layar kosong.
  if v_jangkar_tanggal is null or v_jangkar_berat is null then
    select l.tanggal, l.berat_pagi_kg
      into v_jangkar_tanggal, v_jangkar_berat
      from public.daily_logs l
      where l.user_id = (select auth.uid())
        and l.berat_pagi_kg is not null
      order by l.tanggal
      limit 1;
  end if;

  return jsonb_build_object(
    'dari', v_dari,
    'sampai', p_sampai,
    'deret', v_deret,
    'rata_rata', jsonb_build_object(
      'tanggal', p_sampai,
      'rata_rata_kg', v_rata,
      'jumlah_timbangan', coalesce(v_n, 0)
    ),
    'sepekan_lalu', jsonb_build_object(
      'tanggal', p_sampai - v_jendela,
      'rata_rata_kg', v_rata_lalu,
      'jumlah_timbangan', coalesce(v_n_lalu, 0)
    ),
    'arah', jsonb_build_object(
      'arah', v_arah,
      'perubahan_kg', v_perubahan,
      'ambang_kg', v_ambang
    ),
    'kecukupan', jsonb_build_object(
      'ada_timbangan', coalesce(v_total, 0) > 0,
      'jumlah_total', coalesce(v_total, 0),
      'jumlah_dalam_jendela', coalesce(v_n, 0),
      'cukup_rata_rata', coalesce(v_n, 0) > 0,
      'jendela_penuh', coalesce(v_n, 0) >= v_jendela,
      'cukup_arah', coalesce(v_n, 0) > 0 and coalesce(v_n_lalu, 0) > 0,
      'hari_lagi_untuk_arah', v_hari_lagi
    ),
    'jangkar_fase', case
      when v_jangkar_tanggal is null then null
      else jsonb_build_object(
        'fase', v_fase,
        'tanggal_mulai', v_jangkar_tanggal,
        'berat_awal_kg', v_jangkar_berat
      )
    end
  );
end;
$$;

comment on function public.tren_berat_7_hari(date, integer) is
  'Satu snapshot untuk layar Tren: deret rata-rata bergerak, rata-rata hari ini '
  'dan sepekan lalu, sinyal arah, kecukupan data, dan jangkar fase. Semuanya '
  'dihitung dalam satu transaksi supaya angkanya tidak bisa saling bertentangan.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.tren_berat_7_hari(date, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.tren_berat_7_hari(date, integer) to authenticated';
  end if;
end $$;
