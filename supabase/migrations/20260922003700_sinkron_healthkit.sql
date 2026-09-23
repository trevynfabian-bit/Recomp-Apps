-- ---------------------------------------------------------------------------
-- Endpoint sinkron HealthKit & penanda asal data.
--
-- HealthKit hanya bisa dibaca DI IPHONE. Perangkat mengumpulkan sampel baru
-- (HKAnchoredObjectQuery: yang baru + yang dihapus sejak jangkar terakhir)
-- lalu mengirimnya dalam satu panggilan ke `sinkron_healthkit`. Satu
-- panggilan = satu transaksi: jangkar di perangkat baru boleh dimajukan
-- setelah panggilan ini berhasil, jadi kiriman yang gagal di tengah dikirim
-- ulang UTUH — dan kunci dedup health_data membuat kiriman ulang itu aman.
--
-- Tiga aturan yang dipegang di sini:
--
-- 1. SAMPEL BURUK DILEWATI, TIDAK MEMBLOKIR. Satu sampel dengan nilai
--    mustahil (aplikasi pihak ketiga yang menulis sampah ke Health) tidak
--    boleh membuat seluruh kiriman ditolak — jangkar tidak akan pernah maju,
--    dan sinkron macet selamanya karena satu angka. Sampel itu dilewati dan
--    dilaporkan beserta alasannya.
--
-- 2. BERAT MANUAL TIDAK PERNAH DITIMPA SINKRON. Angka yang diketik pengguna
--    adalah keputusan; timbangan pintar yang mengirim angka lain sejam
--    kemudian tidak berhak menggantinya. Di antara angka HealthKit sendiri,
--    yang PALING PAGI menang (berat pagi dibandingkan dari hari ke hari
--    justru karena kondisinya sama), dan timbangan di luar pagi tidak
--    dipakai sebagai berat pagi.
--
-- 3. PENANDA ASAL. Setiap angka tahu dari mana ia datang: sumber (Apple
--    Health) + asal (perangkat/app di dalamnya) di health_data, dan untuk
--    berat pagi `sumber_berat = 'healthkit'` + nama asalnya (mis. "Withings")
--    + jam timbangnya. Coach dan layar memakai ini untuk membedakan angka
--    yang diketik dari angka yang dikirim alat.
-- ---------------------------------------------------------------------------

-- --- daily_logs: jam timbang & asal berat -----------------------------------
alter table public.daily_logs add column if not exists waktu_timbang timestamptz;
alter table public.daily_logs add column if not exists asal_berat text;

comment on column public.daily_logs.waktu_timbang is
  'Jam timbang: dari sampel HealthKit, atau saat diketik untuk berat hari ini. Dasar saran jam pengingat.';
comment on column public.daily_logs.asal_berat is
  'Nama asal berat HealthKit (mis. "Withings"); null untuk berat yang diketik.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_waktu_timbang_berisi') then
    alter table public.daily_logs add constraint daily_logs_waktu_timbang_berisi
      check (waktu_timbang is null or berat_pagi_kg is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_asal_berat_sinkron') then
    alter table public.daily_logs add constraint daily_logs_asal_berat_sinkron
      check (asal_berat is null or (sumber_berat = 'healthkit' and char_length(asal_berat) between 1 and 100));
  end if;
end $$;

-- Jendela berat pagi, dalam jam WIB. Lebih lebar dari rentang jam pengingat
-- (04.00–11.00): orang yang bangun pukul 03.30 atau timbang pukul 11.40
-- tetap menimbang "pagi"; timbangan pukul 20.00 tidak.
create or replace function public.jendela_berat_pagi()
returns int4range
language sql
immutable
set search_path = ''
as $$ select int4range(3, 12, '[)') $$;

-- Batas isi satu kiriman. Riwayat panjang (sinkron pertama) dikirim bertahap.
create or replace function public.maks_isi_kiriman_healthkit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5000 $$;

-- --- simpan_berat_pagi: manual tidak ditimpa sinkron ------------------------
-- Tanda tangan sama; isinya ditambah dua aturan:
--   • `p_sumber = 'healthkit'` tidak menimpa berat MANUAL (baris dikembalikan
--     apa adanya);
--   • berat yang diketik untuk HARI INI mencatat jam timbangnya.
create or replace function public.simpan_berat_pagi(
  p_tanggal date,
  p_berat_kg numeric,
  p_sumber public.sumber_berat default 'manual'
)
returns public.daily_logs
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_baris public.daily_logs;
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if p_berat_kg is null then
    raise exception 'Berat tidak boleh kosong' using errcode = '22004';
  end if;

  -- Batasnya sama dengan CHECK di tabel; dicek di sini agar pesannya jelas.
  if p_berat_kg < 30 or p_berat_kg > 250 then
    raise exception 'Berat % kg di luar rentang wajar (30–250)', p_berat_kg
      using errcode = '22003';
  end if;

  insert into public.daily_logs (user_id, tanggal, berat_pagi_kg, sumber_berat, waktu_timbang, asal_berat)
  values (v_user_id, p_tanggal, round(p_berat_kg, 2), p_sumber,
          case when p_sumber = 'manual' and p_tanggal = v_hari_ini then now() end,
          null)
  on conflict (user_id, tanggal) do update
    -- HANYA kolom berat yang disentuh; makro, catatan, dan tipe hari dibiarkan.
    set berat_pagi_kg = excluded.berat_pagi_kg,
        sumber_berat  = excluded.sumber_berat,
        waktu_timbang = excluded.waktu_timbang,
        asal_berat    = null
    -- Sinkron tidak menimpa angka yang diketik pengguna.
    where excluded.sumber_berat = 'manual'
       or public.daily_logs.sumber_berat is distinct from 'manual'
  returning * into v_baris;

  if not found then
    select * into v_baris from public.daily_logs
     where user_id = v_user_id and tanggal = p_tanggal;
  end if;

  return v_baris;
end;
$$;

/** Apakah teks bisa dibaca sebagai timestamptz — tanpa melempar. */
create or replace function public.jsonb_waktu_sah(p_teks text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_teks is null then
    return false;
  end if;
  perform p_teks::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;

-- --- Endpoint -----------------------------------------------------------------
/**
 * Sinkron satu kiriman HealthKit.
 *
 * Masukan:
 *   {
 *     "sampel":  [{ "jenis", "id", "asal"?, "nilai", "mulai", "selesai"? }],
 *     "dihapus": [{ "jenis", "id", "asal"? }],
 *     "berat":   [{ "id", "kg", "waktu", "nama_asal"? }]
 *   }
 *   `asal` = bundle id HKSource (kosong untuk total gabungan HealthKit);
 *   `id`   = UUID sampel, atau `total:<YYYY-MM-DD>` untuk total harian.
 *
 * Keluaran:
 *   {
 *     "disimpan": n, "dihapus": n,
 *     "dilewati": [{ "bagian", "indeks", "alasan" }],
 *     "berat":    [{ "tanggal", "kg", "status", "nama_asal" }],
 *     "masuk":    [{ "jenis", "jumlah" }],   -- tambahan HARI INI, setelah anti-dobel
 *     "sinkron_terakhir": iso
 *   }
 *   status berat: disimpan | manual_dipertahankan | ada_yang_lebih_pagi | bukan_pagi
 *
 * INVOKER: RLS health_data & daily_logs tetap berlaku — perangkat hanya
 * menulis data Apple Health miliknya sendiri.
 */
create or replace function public.sinkron_healthkit(p_kiriman jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_sampel jsonb := coalesce(p_kiriman -> 'sampel', '[]'::jsonb);
  v_dihapus jsonb := coalesce(p_kiriman -> 'dihapus', '[]'::jsonb);
  v_berat jsonb := coalesce(p_kiriman -> 'berat', '[]'::jsonb);
  v_e jsonb;
  v_i integer;
  v_n_simpan integer := 0;
  v_n_hapus integer := 0;
  v_n integer;
  v_lewati jsonb := '[]'::jsonb;
  v_hasil_berat jsonb := '[]'::jsonb;
  v_sebelum jsonb;
  v_masuk jsonb;
  v_waktu timestamptz;
  v_kg numeric;
  v_tgl date;
  v_baris public.daily_logs;
  v_ada public.daily_logs;
  v_status text;
  v_sinkron timestamptz := now();
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if jsonb_typeof(v_sampel) <> 'array' or jsonb_typeof(v_dihapus) <> 'array' or jsonb_typeof(v_berat) <> 'array' then
    raise exception 'sampel, dihapus, dan berat harus berupa daftar' using errcode = '22023';
  end if;
  if jsonb_array_length(v_sampel) + jsonb_array_length(v_dihapus) + jsonb_array_length(v_berat)
     > public.maks_isi_kiriman_healthkit() then
    raise exception 'Kiriman lebih dari % isi; kirim bertahap', public.maks_isi_kiriman_healthkit()
      using errcode = '22023';
  end if;
  -- Diperiksa sekali di depan dengan pesan yang jelas; pemicu health_data
  -- tetap menjaga tiap baris.
  if not exists (select 1 from public.health_connections
                  where user_id = v_user and sumber = 'apple_health' and status = 'terhubung') then
    raise exception 'Apple Health belum terhubung' using errcode = 'P0001',
      hint = 'Buat atau sambungkan ulang koneksi apple_health lebih dulu.';
  end if;

  -- Angka hari ini SEBELUM kiriman, untuk menghitung "yang baru masuk".
  select coalesce(jsonb_object_agg(a.jenis, a.nilai), '{}'::jsonb) into v_sebelum
    from public.agregat_kesehatan_harian(v_hari_ini, v_hari_ini) a
   where a.jenis = any (public.jenis_kesehatan_aditif());

  -- --- Sampel -------------------------------------------------------------
  for v_e, v_i in select e, i - 1 from jsonb_array_elements(v_sampel) with ordinality as x (e, i) loop
    begin
      if coalesce(v_e ->> 'jenis', '') in ('recovery', 'strain') then
        -- Skor WHOOP yang ditulis ke Health: datang lewat koneksi WHOOP, bukan di sini.
        v_lewati := v_lewati || jsonb_build_object('bagian', 'sampel', 'indeks', v_i, 'alasan', 'bukan_apple_health');
        continue;
      end if;
      insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
      values (v_user, 'apple_health', nullif(v_e ->> 'asal', ''), v_e ->> 'id', v_e ->> 'jenis',
              (v_e ->> 'nilai')::numeric, (v_e ->> 'mulai')::timestamptz, (v_e ->> 'selesai')::timestamptz)
      on conflict on constraint health_data_kunci_dedup do update
        set nilai = excluded.nilai,
            waktu_mulai = excluded.waktu_mulai,
            waktu_selesai = excluded.waktu_selesai;
      v_n_simpan := v_n_simpan + 1;
    exception
      when check_violation or not_null_violation then
        v_lewati := v_lewati || jsonb_build_object('bagian', 'sampel', 'indeks', v_i,
          'alasan', case when sqlerrm like '%jenis_sah%' then 'jenis_tidak_dikenal'
                         when sqlerrm like '%nilai_wajar%' then 'nilai_di_luar_rentang'
                         when sqlerrm like '%waktu%' or sqlerrm like '%tidur_berujung%' then 'waktu_tidak_sah'
                         else 'tidak_sah' end);
      when data_exception then
        -- Angka atau waktu yang tidak bisa dibaca.
        v_lewati := v_lewati || jsonb_build_object('bagian', 'sampel', 'indeks', v_i, 'alasan', 'format_tidak_sah');
    end;
  end loop;

  -- --- Sampel yang dihapus pengguna di Health -----------------------------
  for v_e in select e from jsonb_array_elements(v_dihapus) as x (e) loop
    delete from public.health_data h
     where h.user_id = v_user
       and h.sumber = 'apple_health'
       and h.jenis = v_e ->> 'jenis'
       and h.id_eksternal = v_e ->> 'id'
       and h.asal is not distinct from nullif(v_e ->> 'asal', '');
    get diagnostics v_n = row_count;
    v_n_hapus := v_n_hapus + v_n;
  end loop;

  -- --- Berat pagi: yang paling pagi per hari, manual tidak ditimpa --------
  -- Waktu dibaca lewat CASE supaya teks yang tidak sah tidak pernah di-cast:
  -- urutan evaluasi syarat WHERE tidak dijamin, CASE dijamin.
  for v_e, v_i, v_waktu in
    select b.e, b.i, b.waktu from (
      select s.e, s.i, s.waktu,
             row_number() over (partition by (s.waktu at time zone 'Asia/Jakarta')::date
                                order by s.waktu) as urut
        from (select x.e, x.i - 1 as i,
                     case when public.jsonb_waktu_sah(x.e ->> 'waktu') then (x.e ->> 'waktu')::timestamptz end as waktu
                from jsonb_array_elements(v_berat) with ordinality as x (e, i)) s
       where s.waktu is not null
         -- Hanya timbangan PAGI yang bersaing menjadi berat pagi; timbangan
         -- malam tidak boleh menutupi timbangan pagi di hari yang sama.
         and public.jendela_berat_pagi() @> extract(hour from s.waktu at time zone 'Asia/Jakarta')::integer
    ) b
     where b.urut = 1
     order by b.waktu
  loop
    v_tgl := (v_waktu at time zone 'Asia/Jakarta')::date;
    begin
      v_kg := round((v_e ->> 'kg')::numeric, 2);

      insert into public.daily_logs (user_id, tanggal, berat_pagi_kg, sumber_berat, waktu_timbang, asal_berat)
      values (v_user, v_tgl, v_kg, 'healthkit', v_waktu, nullif(left(v_e ->> 'nama_asal', 100), ''))
      on conflict (user_id, tanggal) do update
        set berat_pagi_kg = excluded.berat_pagi_kg,
            sumber_berat = excluded.sumber_berat,
            waktu_timbang = excluded.waktu_timbang,
            asal_berat = excluded.asal_berat
        where public.daily_logs.berat_pagi_kg is null
           or (public.daily_logs.sumber_berat = 'healthkit'
               and (public.daily_logs.waktu_timbang is null
                    or excluded.waktu_timbang < public.daily_logs.waktu_timbang))
      returning * into v_baris;

      if found then
        v_status := 'disimpan';
      else
        select * into v_ada from public.daily_logs where user_id = v_user and tanggal = v_tgl;
        v_status := case when v_ada.sumber_berat = 'manual' then 'manual_dipertahankan'
                         else 'ada_yang_lebih_pagi' end;
      end if;
      v_hasil_berat := v_hasil_berat || jsonb_build_object(
        'tanggal', v_tgl, 'kg', v_kg, 'status', v_status, 'nama_asal', v_e ->> 'nama_asal');
    exception
      when check_violation or data_exception then
        v_lewati := v_lewati || jsonb_build_object('bagian', 'berat', 'indeks', v_i, 'alasan', 'nilai_di_luar_rentang');
    end;
  end loop;

  -- Timbangan di luar pagi dilaporkan, tidak dipakai.
  select v_hasil_berat || coalesce(jsonb_agg(jsonb_build_object(
           'tanggal', (s.waktu at time zone 'Asia/Jakarta')::date,
           'kg', s.e -> 'kg', 'status', 'bukan_pagi', 'nama_asal', s.e ->> 'nama_asal') order by s.waktu), '[]')
    into v_hasil_berat
    from (select x.e,
                 case when public.jsonb_waktu_sah(x.e ->> 'waktu') then (x.e ->> 'waktu')::timestamptz end as waktu
            from jsonb_array_elements(v_berat) as x (e)) s
   where s.waktu is not null
     and not public.jendela_berat_pagi() @> extract(hour from s.waktu at time zone 'Asia/Jakarta')::integer;

  -- Berat yang waktunya tidak terbaca dilewati dan dilaporkan.
  select v_lewati || coalesce(jsonb_agg(jsonb_build_object('bagian', 'berat', 'indeks', i - 1, 'alasan', 'format_tidak_sah')), '[]')
    into v_lewati
    from jsonb_array_elements(v_berat) with ordinality as x (e, i)
   where not public.jsonb_waktu_sah(e ->> 'waktu');

  -- --- Status koneksi -------------------------------------------------------
  update public.health_connections
     set sinkron_terakhir = v_sinkron, galat_terakhir = null, galat_pada = null
   where user_id = v_user and sumber = 'apple_health';

  -- --- Yang baru masuk HARI INI, setelah anti-dobel ---------------------------
  -- Selisih angka agregat, bukan jumlah sampel: total iPhone dan total Watch
  -- yang sama-sama naik tidak boleh terbaca dua kali di banner.
  select coalesce(jsonb_agg(jsonb_build_object('jenis', a.jenis, 'jumlah',
                                               a.nilai - coalesce((v_sebelum ->> a.jenis)::numeric, 0))
                            order by a.jenis), '[]'::jsonb)
    into v_masuk
    from public.agregat_kesehatan_harian(v_hari_ini, v_hari_ini) a
   where a.jenis = any (public.jenis_kesehatan_aditif())
     and a.nilai > coalesce((v_sebelum ->> a.jenis)::numeric, 0);

  return jsonb_build_object(
    'disimpan', v_n_simpan,
    'dihapus', v_n_hapus,
    'dilewati', v_lewati,
    'berat', v_hasil_berat,
    'masuk', v_masuk,
    'sinkron_terakhir', v_sinkron
  );
end;
$$;

comment on function public.sinkron_healthkit(jsonb) is
  'Sinkron satu kiriman HealthKit dari perangkat: sampel (upsert pada kunci dedup), '
  'sampel yang dihapus, dan berat pagi (manual tidak pernah ditimpa). Satu transaksi.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.jendela_berat_pagi()',
    'public.maks_isi_kiriman_healthkit()',
    'public.jsonb_waktu_sah(text)',
    'public.sinkron_healthkit(jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;
