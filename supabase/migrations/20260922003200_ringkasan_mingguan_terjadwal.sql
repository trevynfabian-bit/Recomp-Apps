-- =============================================================================
-- Ringkasan mingguan terjadwal.
--
-- Setiap Senin pagi coach mengirim laporan pekan yang baru selesai tanpa
-- diminta. Pembagian kerjanya sama dengan evaluasi 4 mingguan:
--
--   • ANGKA dihitung di sini, dari catatan asli. Model tidak pernah mengirim
--     angka ke database: `simpan_ringkasan_mingguan` MENGHITUNG ULANG poinnya
--     sendiri dan hanya menerima narasi (`bacaan`) serta pertanyaan lanjutan
--     dari pemanggil. Kartu yang dirender app karena itu selalu memuat angka
--     yang sama dengan layar lain, apa pun yang ditulis model.
--   • NARASI ditulis model di Edge Function `ringkasan-mingguan`, dan
--     angka-angka di dalamnya diperiksa terhadap poin ini sebelum disimpan.
--
-- Dua jalur pemanggil, satu set fungsi:
--
--   • Pengguna yang login (app membuka Senin pagi sebelum jadwal sampai
--     kepadanya): pengguna diturunkan dari auth.uid().
--   • Jadwal (Edge Function dengan kunci service role): tidak ada sesi
--     pengguna, jadi penggunanya disebut lewat `p_user_id`.
--
-- Jalur jadwal SENGAJA tidak memakai SECURITY DEFINER atau penyamaran sesi
-- (`set_config('request.jwt.claim.sub', …)`). Service role memang sudah berhak
-- penuh atas tabel-tabel ini; fungsi di sini tidak memberinya apa pun yang
-- belum ia punya. Sebaliknya, pintu DEFINER yang menerima id pengguna adalah
-- persis jenis celah yang baru ditutup migrasi pengerasan sebelumnya.
-- Konsekuensinya: karena service role melewati RLS, SETIAP kueri di bawah
-- menyaring `user_id` secara eksplisit — RLS bukan lapis pertahanan di jalur
-- ini, dan fungsi yang bergantung pada auth.uid() tidak dipanggil.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Konstanta
-- ---------------------------------------------------------------------------

/**
 * Ambang "datar" rata-rata berat pekan ke pekan, dalam kg. SAMA dengan ambang
 * arah di `tren_berat_7_hari`, termasuk batasnya (|selisih| < ambang = datar):
 * ringkasan Senin tidak boleh berkata "naik" untuk pekan yang layar Tren sebut
 * "datar".
 */
create or replace function public.ambang_berat_pekanan()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.2::numeric; $$;

/** Ambang "datar" lingkar pinggang antar pengukuran, dalam cm (ketelitian pita ukur). */
create or replace function public.ambang_pinggang_pekanan()
returns numeric
language sql
immutable
set search_path = ''
as $$ select 0.5::numeric; $$;

/**
 * Selisih rata-rata asupan harian terhadap target yang masih dianggap sesuai,
 * dalam kcal. Di bawah ketelitian taksiran porsi; selisih sekecil itu tidak
 * bisa dibedakan dari salah taksir.
 */
create or replace function public.ambang_asupan_harian()
returns integer
language sql
immutable
set search_path = ''
as $$ select 100; $$;

/** Kekurangan protein harian yang masih dianggap sesuai target, dalam gram. */
create or replace function public.ambang_protein_harian()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10; $$;

/**
 * Seberapa jauh ke belakang pengukuran pinggang pembanding boleh dicari, dalam
 * hari. Pengukuran tiga bulan lalu bukan pembanding "pekan ini".
 */
create or replace function public.jendela_pembanding_pinggang()
returns integer
language sql
immutable
set search_path = ''
as $$ select 28; $$;

/** Jumlah maksimal pertanyaan lanjutan pada satu ringkasan. */
create or replace function public.maks_lanjutan_ringkasan()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3; $$;

-- ---------------------------------------------------------------------------
-- Siapa penggunanya.
-- ---------------------------------------------------------------------------
-- Satu-satunya tempat aturan dua jalur ditulis, supaya tidak ada fungsi yang
-- menuliskannya sedikit berbeda:
--   • ada sesi pengguna → selalu pengguna itu; `p_user_id` hanya boleh kosong
--     atau sama dengannya. Pengguna tidak bisa bertindak atas nama orang lain
--     dengan menyebut id-nya.
--   • tanpa sesi → hanya service role, dan ia WAJIB menyebut penggunanya.
create or replace function public.pengguna_efektif(p_user_id uuid default null)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_sesi uuid := (select auth.uid());
begin
  if v_sesi is not null then
    if p_user_id is not null and p_user_id <> v_sesi then
      raise exception 'Tidak boleh bertindak atas nama pengguna lain'
        using errcode = '42501';
    end if;
    return v_sesi;
  end if;

  if current_user = 'service_role' then
    if p_user_id is null then
      raise exception 'Jalur server wajib menyebut penggunanya'
        using errcode = '22004';
    end if;
    return p_user_id;
  end if;

  raise exception 'Tidak ada sesi login' using errcode = '28000';
end;
$$;

comment on function public.pengguna_efektif(uuid) is
  'Pengguna yang dilayani: auth.uid() bila ada sesi (p_user_id hanya boleh '
  'sama), atau p_user_id bila dan hanya bila pemanggilnya service_role.';

-- ---------------------------------------------------------------------------
-- Arah menurut TUJUAN fase, bukan menurut tanda angkanya.
-- ---------------------------------------------------------------------------
-- Berat naik 0,3 kg adalah kabar baik saat Lean Gain dan kabar buruk saat Cut.
-- Kartu yang mewarnai angka menurut tandanya akan salah untuk separuh fase.
--
-- Maintenance: berat yang bergerak dalam SATU pekan dianggap netral, bukan
-- berlawanan. Sepekan terlalu pendek untuk membedakan drift dari air; drift
-- yang sungguhan ditangkap evaluasi 4 mingguan dengan ambang yang lebih besar.
create or replace function public.arah_tujuan(
  p_metrik text,
  p_arah text,
  p_fase public.fase_program
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_arah is null or p_arah not in ('naik', 'datar', 'turun') then null
    when p_metrik = 'berat' then
      case p_fase
        when 'Lean Gain' then
          case p_arah when 'naik' then 'sesuai' when 'turun' then 'berlawanan' else 'netral' end
        when 'Cut' then
          case p_arah when 'turun' then 'sesuai' when 'naik' then 'berlawanan' else 'netral' end
        else
          case p_arah when 'datar' then 'sesuai' else 'netral' end
      end
    when p_metrik = 'pinggang' then
      case
        when p_fase = 'Cut' then
          case p_arah when 'turun' then 'sesuai' when 'naik' then 'berlawanan' else 'netral' end
        -- Lean Gain & Maintenance: pinggang yang bertambah adalah tanda lemak.
        else
          case p_arah when 'naik' then 'berlawanan' else 'sesuai' end
      end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Validator poin, untuk CHECK.
-- ---------------------------------------------------------------------------
-- Daftar kuncinya sengaja ditulis penuh: kartu hanya bisa memberi label pada
-- kunci yang dikenalnya (`LABEL_POIN` di @recomp/logika), dan kesamaan kedua
-- daftar dijaga `npm run cek:ringkasan`.
create or replace function public.poin_ringkasan_sah(p_poin jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_poin is not null
     and jsonb_typeof(p_poin) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p_poin) as e
        where jsonb_typeof(e) <> 'object'
           or (e ->> 'kunci') is null
           or (e ->> 'kunci') not in
                ('berat_rata', 'asupan_rata', 'protein_rata', 'pinggang', 'latihan')
           or jsonb_typeof(e -> 'nilai') is distinct from 'number'
           -- `is null` disebut terpisah: `null not in (...)` bernilai NULL.
           or (e ->> 'sumber') is null
           or (e ->> 'sumber') not in ('manual', 'sinkron', 'estimasi')
           or ((e ->> 'arah') is not null
               and (e ->> 'arah') not in ('sesuai', 'berlawanan', 'netral'))
     );
$$;

comment on function public.poin_ringkasan_sah(jsonb) is
  'true bila tiap poin ringkasan punya kunci yang dikenal, nilai berupa angka, '
  'dan sumber yang dikenal. Poin tanpa asal tidak boleh tersimpan.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ringkasan_poin_sah') then
    alter table public.ringkasan_mingguan
      add constraint ringkasan_poin_sah check (public.poin_ringkasan_sah(poin));
  end if;
  -- Pesan yang mengantarkan ringkasan membawa poin yang sama; aturannya juga.
  if not exists (select 1 from pg_constraint where conname = 'pesan_ringkasan_sah') then
    alter table public.pesan_coach
      add constraint pesan_ringkasan_sah
      check (ringkasan is null or public.poin_ringkasan_sah(ringkasan -> 'poin'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Poin ringkasan satu pekan.
-- ---------------------------------------------------------------------------
-- Hanya pekan yang SUDAH selesai (Minggu-nya sudah lewat menurut Asia/Jakarta).
-- Ringkasan pekan berjalan akan dikunci oleh aturan satu-ringkasan-per-pekan
-- dengan angka yang belum final.
--
-- Bentuk tiap poin:
--   kunci      berat_rata | asupan_rata | protein_rata | pinggang | latihan
--   nilai      angka mentah (TS yang memformatnya)
--   unit       kg | kcal | g | cm | sesi
--   delta      selisih terhadap `pembanding`; null bila tidak ada pembanding
--   pembanding pekan_lalu | target | pengukuran_sebelumnya
--   arah_nilai naik | datar | turun (hanya berat & pinggang); null bila tak ada delta
--   arah       sesuai | berlawanan | netral menurut tujuan; null bila tak ada delta
--   sumber     manual | sinkron | estimasi, menurut mata rantai terlemah
--   dasar      angka pendukung (jumlah timbangan, hari tercatat, target, …)
create or replace function public.poin_ringkasan_mingguan(
  p_minggu_mulai date default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_dari date;
  v_sampai date;
  v_fase public.fase_program;
  v_poin jsonb := '[]'::jsonb;
  v_kurang text[] := '{}';
  -- berat
  v_rata numeric;
  v_n integer;
  v_n_manual integer;
  v_n_sinkron integer;
  v_rata_lalu numeric;
  v_n_lalu integer;
  v_delta numeric;
  v_arah text;
  -- asupan & protein
  v_hari integer;
  v_kalori integer;
  v_target_kalori integer;
  v_hari_target integer;
  v_protein integer;
  v_target_protein integer;
  v_f_manual integer;
  v_f_estimasi integer;
  v_sumber_makan public.jenis_sumber;
  v_delta_int integer;
  -- pinggang
  v_p numeric;
  v_p_tgl date;
  v_p_lalu numeric;
  v_p_tgl_lalu date;
  -- latihan
  v_latihan integer;
  v_latihan_sinkron integer;
  v_latihan_lalu integer;
begin
  v_dari := public.awal_minggu(coalesce(p_minggu_mulai, v_hari_ini - 7));
  v_sampai := v_dari + 6;
  if v_sampai >= v_hari_ini then
    raise exception 'Pekan % – % belum selesai; ringkasannya dibuat setelah Minggu berlalu',
      v_dari, v_sampai
      using errcode = '22023';
  end if;

  -- Fase pekan itu: snapshot hari terakhir yang tercatat, lalu riwayat fase,
  -- lalu fase aktif. Fase hari INI bisa saja sudah berganti sejak Minggu.
  select l.fase into v_fase
    from public.daily_logs l
   where l.user_id = v_user
     and l.tanggal between v_dari and v_sampai
     and l.fase is not null
   order by l.tanggal desc
   limit 1;
  if v_fase is null then
    select case when f.selesai_tanggal is null then pr.fase_aktif else f.fase end
      into v_fase
      from public.fase_periode f
      join public.profiles pr on pr.user_id = f.user_id
     where f.user_id = v_user
       and f.mulai_tanggal <= v_sampai
       and (f.selesai_tanggal is null or f.selesai_tanggal >= v_sampai)
     order by f.mulai_tanggal desc
     limit 1;
  end if;
  if v_fase is null then
    select pr.fase_aktif into v_fase from public.profiles pr where pr.user_id = v_user;
  end if;

  -- --- Berat: rata-rata pekan vs rata-rata pekan sebelumnya ---------------
  -- Pada hari Minggu, ini PERSIS rata-rata 7 hari dan perubahannya di layar
  -- Tren (pembulatan dan ambangnya sama); uji SQL-nya membandingkan keduanya.
  select round(avg(l.berat_pagi_kg), 2),
         count(*)::integer,
         (count(*) filter (where l.sumber_berat = 'manual'))::integer,
         (count(*) filter (where l.sumber_berat = 'healthkit'))::integer
    into v_rata, v_n, v_n_manual, v_n_sinkron
    from public.daily_logs l
   where l.user_id = v_user
     and l.berat_pagi_kg is not null
     and l.tanggal between v_dari and v_sampai;

  select round(avg(l.berat_pagi_kg), 2), count(*)::integer
    into v_rata_lalu, v_n_lalu
    from public.daily_logs l
   where l.user_id = v_user
     and l.berat_pagi_kg is not null
     and l.tanggal between v_dari - 7 and v_dari - 1;

  if v_rata is not null then
    if v_rata_lalu is not null then
      v_delta := round(v_rata - v_rata_lalu, 2);
      v_arah := case
                  when abs(v_delta) < public.ambang_berat_pekanan() then 'datar'
                  when v_delta > 0 then 'naik'
                  else 'turun'
                end;
    end if;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'berat_rata',
      'nilai', v_rata,
      'unit', 'kg',
      'delta', v_delta,
      'pembanding', 'pekan_lalu',
      'arah_nilai', v_arah,
      'arah', public.arah_tujuan('berat', v_arah, v_fase),
      'sumber', public.sumber_gabungan(
        (case when v_n_sinkron > 0 then array['sinkron'] else '{}'::text[] end)
        || (case when v_n_manual > 0 then array['manual'] else '{}'::text[] end)
      ),
      'dasar', jsonb_build_object(
        'jumlah_timbangan', v_n,
        'jumlah_timbangan_lalu', coalesce(v_n_lalu, 0),
        'rata_lalu', v_rata_lalu,
        'ambang', public.ambang_berat_pekanan()
      )
    );
  else
    v_kurang := v_kurang || 'berat'::text;
  end if;

  -- --- Asupan & protein: rata-rata hari yang BENAR-BENAR dicatat ----------
  -- Hari tanpa satu pun catatan makan dilewati, bukan dihitung nol: "rata-rata
  -- 1.200 kcal" karena tiga hari lupa mencatat adalah angka yang menyesatkan.
  --
  -- Target hari itu: snapshot baris harian bila ada, bila tidak target tipe
  -- harinya (atau tipe bawaan) pada fase hari itu — urutan cadangan yang SAMA
  -- dengan `ambil_target_harian`. Snapshot protein baru terisi saat tipe hari
  -- disetel, jadi tanpa cadangan ini selisih protein hampir selalu kosong.
  with hari as (
    select l.kalori,
           l.protein_g,
           coalesce(l.target_kalori, t.target_kalori) as target_kalori,
           coalesce(l.target_protein_g, t.target_protein_g) as target_protein_g
      from public.daily_logs l
      -- Hari tanpa tipe hari memakai tipe bawaan, seperti ambil_target_harian.
      left join public.day_types d
        on d.user_id = v_user
       and d.id = coalesce(
             l.day_type_id,
             (select d2.id from public.day_types d2
               where d2.user_id = v_user and d2.is_default
               limit 1))
      left join public.day_type_targets t
        on t.day_type_id = d.id
       and t.user_id = v_user
       and t.fase = coalesce(l.fase, v_fase)
     where l.user_id = v_user
       and l.tanggal between v_dari and v_sampai
       and exists (
         select 1 from public.food_logs f
          where f.daily_log_id = l.id and f.user_id = v_user
       )
  )
  select count(*)::integer,
         round(avg(h.kalori))::integer,
         round(avg(h.target_kalori))::integer,
         count(h.target_kalori)::integer,
         round(avg(h.protein_g))::integer,
         round(avg(h.target_protein_g))::integer
    into v_hari, v_kalori, v_target_kalori, v_hari_target, v_protein, v_target_protein
    from hari h;

  select (count(*) filter (where f.sumber = 'manual'))::integer,
         (count(*) filter (where f.sumber = 'foto_ai'))::integer
    into v_f_manual, v_f_estimasi
    from public.food_logs f
    join public.daily_logs l on l.id = f.daily_log_id
   where f.user_id = v_user
     and l.user_id = v_user
     and l.tanggal between v_dari and v_sampai;

  -- Satu porsi yang ditaksir AI membuat rata-ratanya taksiran.
  v_sumber_makan := public.sumber_gabungan(
    (case when v_f_estimasi > 0 then array['estimasi'] else '{}'::text[] end)
    || (case when v_f_manual > 0 then array['manual'] else '{}'::text[] end)
  );

  if v_hari > 0 then
    v_delta_int := v_kalori - v_target_kalori;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'asupan_rata',
      'nilai', v_kalori,
      'unit', 'kcal',
      'delta', v_delta_int,
      'pembanding', 'target',
      'arah_nilai', null,
      'arah', case
                when v_delta_int is null then null
                when abs(v_delta_int) <= public.ambang_asupan_harian() then 'sesuai'
                else 'berlawanan'
              end,
      'sumber', v_sumber_makan,
      'dasar', jsonb_build_object(
        'hari_tercatat', v_hari,
        'hari_bertarget', v_hari_target,
        'rata_target', v_target_kalori,
        'entri_manual', v_f_manual,
        'entri_estimasi', v_f_estimasi,
        'ambang', public.ambang_asupan_harian()
      )
    );

    v_delta_int := v_protein - v_target_protein;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'protein_rata',
      'nilai', v_protein,
      'unit', 'g',
      'delta', v_delta_int,
      'pembanding', 'target',
      'arah_nilai', null,
      -- Protein lebih dari target bukan masalah; yang dijaga kekurangannya.
      'arah', case
                when v_delta_int is null then null
                when v_delta_int >= -public.ambang_protein_harian() then 'sesuai'
                else 'berlawanan'
              end,
      'sumber', v_sumber_makan,
      'dasar', jsonb_build_object(
        'hari_tercatat', v_hari,
        'rata_target', v_target_protein,
        'ambang', public.ambang_protein_harian()
      )
    );
  else
    v_kurang := v_kurang || 'asupan'::text;
  end if;

  -- --- Pinggang: pengukuran terakhir pekan itu vs pengukuran sebelumnya ----
  select m.pinggang_cm, m.tanggal
    into v_p, v_p_tgl
    from public.body_measurements m
   where m.user_id = v_user
     and m.pinggang_cm is not null
     and m.tanggal between v_dari and v_sampai
   order by m.tanggal desc
   limit 1;

  if v_p is not null then
    select m.pinggang_cm, m.tanggal
      into v_p_lalu, v_p_tgl_lalu
      from public.body_measurements m
     where m.user_id = v_user
       and m.pinggang_cm is not null
       and m.tanggal < v_p_tgl
       and m.tanggal >= v_p_tgl - public.jendela_pembanding_pinggang()
     order by m.tanggal desc
     limit 1;

    v_delta := case when v_p_lalu is null then null else round(v_p - v_p_lalu, 1) end;
    v_arah := case
                when v_delta is null then null
                else public.arah_metrik(v_delta, public.ambang_pinggang_pekanan())
              end;
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'pinggang',
      'nilai', v_p,
      'unit', 'cm',
      'delta', v_delta,
      'pembanding', 'pengukuran_sebelumnya',
      'arah_nilai', v_arah,
      'arah', public.arah_tujuan('pinggang', v_arah, v_fase),
      -- Ukuran tubuh selalu diketik tangan; tidak ada perangkat yang mengirimnya.
      'sumber', 'manual',
      'dasar', jsonb_build_object(
        'tanggal', v_p_tgl,
        'tanggal_pembanding', v_p_tgl_lalu,
        'nilai_pembanding', v_p_lalu,
        'ambang', public.ambang_pinggang_pekanan()
      )
    );
  else
    v_kurang := v_kurang || 'pinggang'::text;
  end if;

  -- --- Latihan: jumlah sesi, bukan tujuan --------------------------------
  select count(*)::integer, (count(*) filter (where w.sumber <> 'manual'))::integer
    into v_latihan, v_latihan_sinkron
    from public.workouts w
   where w.user_id = v_user
     and w.tanggal between v_dari and v_sampai;

  select count(*)::integer
    into v_latihan_lalu
    from public.workouts w
   where w.user_id = v_user
     and w.tanggal between v_dari - 7 and v_dari - 1;

  if v_latihan > 0 or v_latihan_lalu > 0 then
    v_poin := v_poin || jsonb_build_object(
      'kunci', 'latihan',
      'nilai', v_latihan,
      'unit', 'sesi',
      'delta', v_latihan - v_latihan_lalu,
      'pembanding', 'pekan_lalu',
      'arah_nilai', null,
      -- Jumlah sesi tidak punya arah "benar"; deload juga pekan yang sah.
      'arah', 'netral',
      'sumber', public.sumber_gabungan(
        (case when v_latihan_sinkron > 0 then array['sinkron'] else '{}'::text[] end)
        || (case when v_latihan - v_latihan_sinkron > 0 then array['manual'] else '{}'::text[] end)
      ),
      'dasar', jsonb_build_object('jumlah_lalu', v_latihan_lalu)
    );
  end if;

  return jsonb_build_object(
    'periode', jsonb_build_object('dari', v_dari, 'sampai', v_sampai),
    'fase', v_fase,
    'poin', v_poin,
    -- Pekan tanpa timbangan DAN tanpa catatan makan tidak diringkas: laporan
    -- yang isinya "tidak ada data" hanya terasa seperti teguran.
    'cukup', v_rata is not null or v_hari > 0,
    'kurang', to_jsonb(v_kurang)
  );
end;
$$;

comment on function public.poin_ringkasan_mingguan(date, uuid) is
  'Angka ringkasan satu pekan yang sudah selesai, beserta arah menurut tujuan '
  'fase dan sumbernya. Narasi ditulis model; angkanya selalu dari sini.';

-- ---------------------------------------------------------------------------
-- Simpan ringkasan: laporan + utas + pesan kartu, dalam satu transaksi.
-- ---------------------------------------------------------------------------
-- Idempoten per pekan. Pemanggilan kedua (jadwal yang berulang, atau app dan
-- jadwal yang berpapasan) mengembalikan ringkasan yang sudah ada tanpa membuat
-- utas atau pesan baru. Barisnya disisipkan LEBIH DULU dengan `on conflict do
-- nothing`, jadi pemanggil yang kalah balapan tidak meninggalkan utas yatim.
create or replace function public.simpan_ringkasan_mingguan(
  p_minggu_mulai date,
  p_bacaan text,
  p_lanjutan jsonb default null,
  p_judul text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := public.pengguna_efektif(p_user_id);
  v_data jsonb;
  v_dari date;
  v_bacaan text := btrim(coalesce(p_bacaan, ''));
  v_lanjutan jsonb;
  v_ringkasan_id uuid;
  v_percakapan_id uuid;
  v_pesan_id uuid;
begin
  if p_minggu_mulai is null then
    -- Wajib disebut: narasinya ditulis untuk poin pekan TERTENTU. Tanpa ini,
    -- jadwal yang berjalan melewati tengah malam Senin bisa menyimpan narasi
    -- pekan lalu di atas poin pekan yang lain.
    raise exception 'Pekan yang diringkas wajib disebut' using errcode = '22004';
  end if;

  v_data := public.poin_ringkasan_mingguan(p_minggu_mulai, v_user);
  if not (v_data ->> 'cukup')::boolean then
    raise exception 'Pekan ini belum punya catatan untuk diringkas' using errcode = 'P0002';
  end if;

  if char_length(v_bacaan) = 0 then
    raise exception 'Bacaan ringkasan kosong' using errcode = '22023';
  end if;
  if char_length(v_bacaan) > 4000 then
    raise exception 'Bacaan ringkasan terlalu panjang (% karakter)', char_length(v_bacaan)
      using errcode = '22001';
  end if;

  if p_lanjutan is not null and p_lanjutan <> 'null'::jsonb then
    if jsonb_typeof(p_lanjutan) <> 'array'
       or jsonb_array_length(p_lanjutan) > public.maks_lanjutan_ringkasan()
       or exists (
         select 1 from jsonb_array_elements(p_lanjutan) as e
          where jsonb_typeof(e) <> 'string'
             or char_length(btrim(e #>> '{}')) not between 1 and 200
       )
    then
      raise exception 'Pertanyaan lanjutan harus berupa daftar berisi 1–200 karakter, paling banyak %',
        public.maks_lanjutan_ringkasan()
        using errcode = '22023';
    end if;
    if jsonb_array_length(p_lanjutan) > 0 then
      v_lanjutan := p_lanjutan;
    end if;
  end if;

  v_dari := (v_data -> 'periode' ->> 'dari')::date;

  insert into public.ringkasan_mingguan
    (user_id, periode_dari, periode_sampai, poin, bacaan, lanjutan)
  values
    (v_user, v_dari, v_dari + 6, v_data -> 'poin', v_bacaan, v_lanjutan)
  on conflict (user_id, periode_dari) do nothing
  returning id into v_ringkasan_id;

  if v_ringkasan_id is null then
    select r.id, r.pesan_id into v_ringkasan_id, v_pesan_id
      from public.ringkasan_mingguan r
     where r.user_id = v_user and r.periode_dari = v_dari;
    select p.percakapan_id into v_percakapan_id
      from public.pesan_coach p
     where p.id = v_pesan_id and p.user_id = v_user;
    return jsonb_build_object(
      'baru', false,
      'ringkasan_id', v_ringkasan_id,
      'pesan_id', v_pesan_id,
      'percakapan_id', v_percakapan_id,
      'periode', v_data -> 'periode'
    );
  end if;

  -- Satu utas per ringkasan: pertanyaan lanjutan dari kartu masuk ke utas yang
  -- sama, dengan laporan pekan itu sebagai pembukanya.
  insert into public.percakapan (user_id, judul)
  values (
    v_user,
    left(coalesce(nullif(btrim(p_judul), ''), 'Ringkasan mingguan'),
         public.maks_judul_percakapan())
  )
  returning id into v_percakapan_id;

  -- Teksnya kosong dengan sengaja: pesan ini dirender sebagai KARTU dari
  -- `ringkasan`, dan CHECK `pesan_ada_isinya` mengizinkan itu.
  insert into public.pesan_coach (percakapan_id, user_id, peran, teks, ringkasan)
  values (
    v_percakapan_id, v_user, 'coach', '',
    jsonb_build_object(
      'ringkasan_id', v_ringkasan_id,
      'periode', v_data -> 'periode',
      'fase', v_data -> 'fase',
      'poin', v_data -> 'poin',
      'bacaan', v_bacaan,
      'lanjutan', v_lanjutan
    )
  )
  returning id into v_pesan_id;

  update public.ringkasan_mingguan
     set pesan_id = v_pesan_id
   where id = v_ringkasan_id and user_id = v_user;

  return jsonb_build_object(
    'baru', true,
    'ringkasan_id', v_ringkasan_id,
    'pesan_id', v_pesan_id,
    'percakapan_id', v_percakapan_id,
    'periode', v_data -> 'periode'
  );
end;
$$;

comment on function public.simpan_ringkasan_mingguan(date, text, jsonb, text, uuid) is
  'Menyimpan ringkasan satu pekan: poin DIHITUNG ULANG di sini, pemanggil hanya '
  'menyumbang narasi & pertanyaan lanjutan. Idempoten per pekan.';

-- ---------------------------------------------------------------------------
-- Antrean jadwal: siapa yang masih perlu diringkas.
-- ---------------------------------------------------------------------------
-- Hanya untuk service role — daftar id pengguna bukan urusan pengguna mana pun.
-- Pemeriksaan `current_user` di dalamnya adalah lapis kedua di belakang hak
-- EXECUTE, supaya pemberian hak yang keliru di masa depan tidak langsung
-- membocorkan daftar pengguna.
--
-- Bisa dilanjutkan: yang sudah punya ringkasan tidak ikut lagi, jadi jadwal
-- yang terhenti di tengah jalan cukup dijalankan ulang.
create or replace function public.pengguna_perlu_ringkasan(
  p_minggu_mulai date default null,
  p_batas integer default 50
)
returns table (pengguna_id uuid, pekan_mulai date)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_dari date;
begin
  if current_user <> 'service_role' then
    raise exception 'Hanya jalur server yang boleh membaca antrean ringkasan'
      using errcode = '42501';
  end if;
  if p_batas is null or p_batas < 1 or p_batas > 500 then
    raise exception 'Batas antrean harus 1–500; diminta %', p_batas using errcode = '22003';
  end if;

  v_dari := public.awal_minggu(coalesce(p_minggu_mulai, v_hari_ini - 7));
  if v_dari + 6 >= v_hari_ini then
    raise exception 'Pekan % belum selesai', v_dari using errcode = '22023';
  end if;

  -- Kriterianya SAMA dengan `cukup` di poin_ringkasan_mingguan: ada timbangan
  -- atau ada catatan makan. Kriteria yang lebih longgar membuat jadwal
  -- memanggil model untuk pengguna yang lalu ditolak saat disimpan.
  return query
    select distinct l.user_id, v_dari
      from public.daily_logs l
     where l.tanggal between v_dari and v_dari + 6
       and (
         l.berat_pagi_kg is not null
         or exists (
           select 1 from public.food_logs f
            where f.daily_log_id = l.id and f.user_id = l.user_id
         )
       )
       and not exists (
         select 1 from public.ringkasan_mingguan r
          where r.user_id = l.user_id and r.periode_dari = v_dari
       )
     order by l.user_id
     limit p_batas;
end;
$$;

comment on function public.pengguna_perlu_ringkasan(date, integer) is
  'Antrean jadwal ringkasan: pengguna yang punya catatan pekan itu tapi belum '
  'punya ringkasannya. Hanya service_role.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
-- Default privileges sudah tidak memberi apa pun ke anon/PUBLIC (migrasi
-- pengerasan); hak di bawah ditulis eksplisit supaya tidak bergantung pada
-- default yang bisa berbeda antar proyek.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ambang_berat_pekanan()',
    'public.ambang_pinggang_pekanan()',
    'public.ambang_asupan_harian()',
    'public.ambang_protein_harian()',
    'public.jendela_pembanding_pinggang()',
    'public.maks_lanjutan_ringkasan()',
    'public.pengguna_efektif(uuid)',
    'public.arah_tujuan(text, text, public.fase_program)',
    'public.poin_ringkasan_sah(jsonb)',
    'public.poin_ringkasan_mingguan(date, uuid)',
    'public.simpan_ringkasan_mingguan(date, text, jsonb, text, uuid)',
    'public.pengguna_perlu_ringkasan(date, integer)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      if fn = 'public.pengguna_perlu_ringkasan(date, integer)' then
        execute format('revoke all on function %s from authenticated', fn);
      else
        -- Termasuk validator CHECK: CHECK memanggilnya dengan hak pengguna
        -- yang menyisipkan baris.
        execute format('grant execute on function %s to authenticated', fn);
      end if;
    end if;
  end loop;
end $$;
