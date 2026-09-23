-- ---------------------------------------------------------------------------
-- Alert batas pinggang, di server.
--
-- Kenapa di server dan bukan di layar: peringatan ini harus sampai lewat
-- notifikasi dan lewat AI coach, dan keduanya tidak menjalankan TypeScript.
-- Layar yang menghitung sendiri juga hanya bisa memperingatkan saat dibuka —
-- padahal justru pengguna yang berhenti membuka layar ukuran yang paling perlu
-- diingatkan.
--
-- DUA keputusan yang menentukan apakah fitur ini menolong atau justru dimatikan
-- pengguna:
--
-- 1. Aturan pemicunya BERBASIS PERUBAHAN KEADAAN, bukan berbasis jadwal.
--    Mengirim "pinggangmu masih di atas batas" setiap pekan adalah cara
--    tercepat membuat orang mematikan notifikasi, dan setelah itu peringatan
--    yang benar-benar penting pun tidak akan sampai. Karena itu alert hanya
--    dikirim saat keadaannya MEMBURUK dibanding yang terakhir tercatat.
-- 2. Perbaikan tetap DICATAT meski tidak dikirim. Tanpa itu, pengguna yang
--    pernah 'lewat' lalu kembali 'aman' tidak akan pernah diperingatkan lagi
--    saat naik kembali — keadaan terakhirnya selamanya 'lewat', dan tidak ada
--    yang bisa lebih buruk dari itu.
--
-- Urutan keburukannya: belum-ditetapkan/aman < mendekat < lewat.
-- ---------------------------------------------------------------------------

-- --- Keadaan batas pinggang, satu tempat -----------------------------------
-- Diekstrak supaya `riwayat_ukuran` dan alert ini memakai aturan yang SAMA.
-- Dua salinan aturan "mendekat" akan menyimpang, dan layar akan mengatakan
-- 'aman' sementara notifikasinya mengatakan 'mendekat'.
create or replace function public.status_batas_pinggang(
  p_pinggang_cm numeric,
  p_batas_cm numeric,
  p_laju_per_pekan numeric,
  p_ambang_pekan integer default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_ambang integer := coalesce(p_ambang_pekan, public.ambang_pekan_batas());
  v_selisih numeric;
  v_pekan_lagi numeric;
  v_keadaan text;
begin
  if p_pinggang_cm is null then
    return null;
  end if;
  if p_batas_cm is null then
    return jsonb_build_object(
      'keadaan', 'belum-ditetapkan',
      'batas_cm', null,
      'pinggang_cm', p_pinggang_cm,
      'selisih_cm', null,
      'laju_per_pekan', p_laju_per_pekan,
      'pekan_lagi', null,
      'ambang_pekan', v_ambang
    );
  end if;

  v_selisih := floor((p_pinggang_cm - p_batas_cm) * 10 + 0.5) / 10;

  if v_selisih >= 0 then
    v_keadaan := 'lewat';
    v_pekan_lagi := 0;
  else
    -- Hanya laju NAIK yang bisa membawa pinggang ke batas; laju datar atau
    -- turun berarti batasnya tidak sedang didekati sama sekali.
    if p_laju_per_pekan is not null and p_laju_per_pekan > 0 then
      -- "Mendekat" diukur dalam PERKIRAAN WAKTU, bukan jarak: sisa 0,8 cm
      -- dengan +0,1 cm/pekan masih delapan pekan lagi, sementara sisa yang sama
      -- dengan +0,4 cm/pekan tinggal dua pekan.
      v_pekan_lagi := ceil((-v_selisih / p_laju_per_pekan) * 10) / 10;
    else
      v_pekan_lagi := null;
    end if;
    v_keadaan := case when v_pekan_lagi is not null and v_pekan_lagi <= v_ambang
                      then 'mendekat' else 'aman' end;
  end if;

  return jsonb_build_object(
    'keadaan', v_keadaan,
    'batas_cm', p_batas_cm,
    'pinggang_cm', p_pinggang_cm,
    'selisih_cm', v_selisih,
    'laju_per_pekan', p_laju_per_pekan,
    'pekan_lagi', v_pekan_lagi,
    'ambang_pekan', v_ambang
  );
end;
$$;

comment on function public.status_batas_pinggang(numeric, numeric, numeric, integer) is
  'Keadaan pinggang terhadap batas pengguna, diukur dalam perkiraan WAKTU. '
  'Sama dengan statusBatasPinggang di @recomp/logika, dan dipakai bersama oleh '
  'riwayat_ukuran serta periksa_alert_pinggang.';

-- --- Seberapa buruk sebuah keadaan -----------------------------------------
create or replace function public.peringkat_keadaan_pinggang(p_keadaan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_keadaan
           when 'lewat' then 3
           when 'mendekat' then 2
           else 1          -- aman & belum-ditetapkan
         end;
$$;

-- --- Jejak alert -----------------------------------------------------------
create table if not exists public.alert_pinggang (
  id uuid primary key default gen_random_uuid(),
  -- Urutan MONOTON, bukan `created_at`: dua pemeriksaan dalam satu transaksi
  -- mendapat `now()` yang sama persis, dan "keadaan terakhir" jadi tidak
  -- tertentu — kadang membaca perbaikan, kadang membaca peringatan, sehingga
  -- alert yang sama terkirim dua kali secara acak.
  urutan bigint generated always as identity,
  user_id uuid not null references auth.users (id) on delete cascade,
  keadaan text not null,
  /* Tanggal pencatatan ukuran yang memicunya, bukan tanggal pengiriman. */
  tanggal_ukuran date not null,
  pinggang_cm numeric(5, 1) not null,
  batas_cm numeric(5, 1),
  selisih_cm numeric(5, 1),
  laju_per_pekan numeric(5, 1),
  pekan_lagi numeric(6, 1),
  /* false untuk perbaikan yang dicatat tapi tidak diberitahukan. */
  dikirim boolean not null default true,
  created_at timestamptz not null default now(),
  constraint alert_pinggang_keadaan_dikenal
    check (keadaan in ('belum-ditetapkan', 'aman', 'mendekat', 'lewat'))
);

create index if not exists alert_pinggang_user_urutan_idx
  on public.alert_pinggang (user_id, urutan desc);

comment on table public.alert_pinggang is
  'Jejak keadaan batas pinggang. Baris dengan dikirim=false adalah PERBAIKAN '
  'yang dicatat tanpa diberitahukan, supaya kenaikan berikutnya bisa memicu '
  'peringatan lagi.';

alter table public.alert_pinggang enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'alert_pinggang' and policyname = 'alert_pinggang_milik_sendiri'
  ) then
    create policy alert_pinggang_milik_sendiri on public.alert_pinggang
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Periksa & catat alert.
--
-- `p_catat = false` membuatnya PRATINJAU murni: tidak menulis apa pun. Itu yang
-- dipakai layar untuk memperlihatkan keadaan tanpa menghabiskan "kejutan"
-- notifikasinya.
-- ---------------------------------------------------------------------------
create or replace function public.periksa_alert_pinggang(
  p_tanggal date default null,
  p_catat boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sampai date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_maks integer := 4;
  v_batas numeric;
  v_tanggal date;
  v_pinggang numeric;
  v_laju numeric;
  v_status jsonb;
  v_keadaan text;
  v_terakhir public.alert_pinggang;
  v_perlu boolean := false;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select batas_pinggang_cm into v_batas from public.profiles where user_id = v_user_id;

  select b.tanggal, b.pinggang_cm into v_tanggal, v_pinggang
    from public.body_measurements b
   where b.user_id = v_user_id and b.tanggal <= v_sampai and b.pinggang_cm is not null
   order by b.tanggal desc
   limit 1;

  -- Laju dari BEBERAPA pencatatan terakhir sekaligus, sama seperti
  -- `lajuTerkini`: satu pekan yang aneh (dehidrasi, meteran bergeser
  -- sesentimeter) akan mengubah kesimpulannya seluruhnya.
  with terakhir as (
    select b.tanggal, b.pinggang_cm as nilai,
           row_number() over (order by b.tanggal desc) as urut
      from public.body_measurements b
     where b.user_id = v_user_id and b.tanggal <= v_sampai and b.pinggang_cm is not null
  ),
  dipakai as (select * from terakhir where urut <= v_maks),
  rentang as (select count(*) n, min(tanggal) t_awal, max(tanggal) t_akhir from dipakai)
  select case when r.n >= 2 and r.t_akhir > r.t_awal
              then floor(((b.nilai - a.nilai) / (r.t_akhir - r.t_awal)
                          * public.hari_per_pekan()) * 10 + 0.5) / 10
         end
    into v_laju
    from rentang r
    join dipakai a on a.tanggal = r.t_awal
    join dipakai b on b.tanggal = r.t_akhir;

  v_status := public.status_batas_pinggang(v_pinggang, v_batas, v_laju);

  if v_status is null then
    -- Belum ada satu pun lingkar pinggang: tidak ada yang bisa dinilai, dan
    -- tidak ada yang layak dicatat.
    return jsonb_build_object(
      'status', null,
      'perlu_kirim', false,
      'sebab', 'tanpa pencatatan',
      'alert_terakhir', null
    );
  end if;

  v_keadaan := v_status->>'keadaan';

  select * into v_terakhir
    from public.alert_pinggang
   where user_id = v_user_id
   order by urutan desc
   limit 1;

  -- Hanya keadaan yang MEMBURUK yang dikirim. Mengirim "masih di atas batas"
  -- setiap pekan adalah cara tercepat membuat orang mematikan notifikasi.
  v_perlu := public.peringkat_keadaan_pinggang(v_keadaan) >= 2
             and (v_terakhir.id is null
                  or public.peringkat_keadaan_pinggang(v_keadaan)
                     > public.peringkat_keadaan_pinggang(v_terakhir.keadaan));

  -- Perbaikan juga dicatat (dikirim=false) supaya kenaikan berikutnya bisa
  -- memicu peringatan lagi. Tanpa ini, keadaan terakhir selamanya 'lewat' dan
  -- tidak ada yang bisa lebih buruk dari itu.
  if p_catat
     and (v_perlu
          or v_terakhir.id is null
          or public.peringkat_keadaan_pinggang(v_keadaan)
             < public.peringkat_keadaan_pinggang(v_terakhir.keadaan)) then
    insert into public.alert_pinggang (
      user_id, keadaan, tanggal_ukuran, pinggang_cm, batas_cm,
      selisih_cm, laju_per_pekan, pekan_lagi, dikirim
    )
    values (
      v_user_id, v_keadaan, v_tanggal, v_pinggang, v_batas,
      (v_status->>'selisih_cm')::numeric,
      (v_status->>'laju_per_pekan')::numeric,
      (v_status->>'pekan_lagi')::numeric,
      v_perlu
    )
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'tanggal_ukuran', v_tanggal,
    'perlu_kirim', v_perlu,
    'sebab', case
               when v_perlu then 'memburuk'
               when public.peringkat_keadaan_pinggang(v_keadaan) < 2 then 'tidak perlu'
               else 'sudah diberitahukan'
             end,
    'dicatat_id', v_id,
    'alert_terakhir', case when v_terakhir.id is null then null else jsonb_build_object(
      'keadaan', v_terakhir.keadaan,
      'tanggal_ukuran', v_terakhir.tanggal_ukuran,
      'dikirim', v_terakhir.dikirim,
      'created_at', v_terakhir.created_at
    ) end
  );
end;
$$;

comment on function public.periksa_alert_pinggang(date, boolean) is
  'Memeriksa keadaan batas pinggang dan menentukan apakah peringatan perlu '
  'dikirim. Hanya keadaan yang MEMBURUK yang dikirim; perbaikan dicatat tanpa '
  'diberitahukan. p_catat=false menjadikannya pratinjau tanpa tulisan.';


-- ---------------------------------------------------------------------------
-- `riwayat_ukuran` dibuat ulang agar keadaan batas pinggangnya memakai
-- `status_batas_pinggang` di atas. Aturannya tidak berubah — yang berubah
-- adalah jumlah salinannya, dari dua menjadi satu. `npm run cek:paritas`
-- membuktikan hasilnya tetap sama dengan @recomp/logika.
-- ---------------------------------------------------------------------------
create or replace function public.riwayat_ukuran(
  p_sampai date default null,
  p_batas integer default 12,
  p_maks_titik_laju integer default 4
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sampai date := coalesce(p_sampai, (now() at time zone 'Asia/Jakarta')::date);
  v_pekan integer := public.hari_per_pekan();
  v_maks integer := greatest(coalesce(p_maks_titik_laju, 4), 2);
  v_catatan jsonb;
  v_bagian jsonb;
  v_batas numeric;
  v_status jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_batas is null or p_batas < 1 or p_batas > 260 then
    raise exception 'Jumlah pencatatan harus 1–260' using errcode = '22003';
  end if;

  select batas_pinggang_cm into v_batas from public.profiles where user_id = v_user_id;

  with c as (
    select *
      from public.body_measurements
     where user_id = v_user_id and tanggal <= v_sampai
     order by tanggal desc
     limit p_batas
  ),
  -- Satu baris per (bagian × tanggal), tanpa bagian yang tidak diukur.
  titik as (
    select t.bagian, c.tanggal, t.nilai
      from c
      cross join lateral (values
        ('pinggang_cm', c.pinggang_cm),
        ('dada_cm', c.dada_cm),
        ('leher_cm', c.leher_cm),
        ('lengan_kiri_cm', c.lengan_kiri_cm),
        ('lengan_kanan_cm', c.lengan_kanan_cm),
        ('paha_kiri_cm', c.paha_kiri_cm),
        ('paha_kanan_cm', c.paha_kanan_cm)
      ) as t(bagian, nilai)
     where t.nilai is not null
  ),
  selang as (
    select
      bagian,
      lag(tanggal) over (partition by bagian order by tanggal) as dari,
      tanggal as ke,
      lag(nilai) over (partition by bagian order by tanggal) as nilai_dari,
      nilai as nilai_ke
    from titik
  ),
  perubahan as (
    select
      bagian, dari, ke, nilai_dari, nilai_ke,
      (ke - dari) as jarak_hari,
      -- floor(x × 10 + 0,5) ÷ 10 — sama dengan Math.round di JavaScript.
      floor((nilai_ke - nilai_dari) * 10 + 0.5) / 10 as selisih
    from selang
   where dari is not null
  ),
  perubahan_laju as (
    select
      p.*,
      -- Lajunya dihitung dari selisih yang SUDAH dibulatkan, persis seperti di
      -- TypeScript. Lewat jalur ini keduanya tidak pernah bisa berbeda —
      -- kolomnya numeric(5,1), jadi selisih dua nilai tersimpan selalu sudah
      -- berdesimal satu. Bentuknya tetap ditiru apa adanya supaya kesamaannya
      -- tidak bergantung pada ketelitian kolom yang bisa berubah nanti.
      case when p.jarak_hari > 0
           then floor((p.selisih / p.jarak_hari * v_pekan) * 10 + 0.5) / 10
           else 0 end as laju_per_pekan
    from perubahan p
  ),
  -- Beberapa pencatatan TERAKHIR per bagian, untuk laju terkini.
  terbaru as (
    select bagian, tanggal, nilai,
           row_number() over (partition by bagian order by tanggal desc) as urut
      from titik
  ),
  dipakai as (
    select * from terbaru where urut <= v_maks
  ),
  rentang as (
    select bagian, count(*) as n, min(tanggal) as t_awal, max(tanggal) as t_akhir
      from dipakai group by bagian
  ),
  laju_terkini as (
    select
      r.bagian,
      case when r.n >= 2 and r.t_akhir > r.t_awal
           then floor(((b.nilai - a.nilai) / (r.t_akhir - r.t_awal) * v_pekan) * 10 + 0.5) / 10
      end as laju
      from rentang r
      join dipakai a on a.bagian = r.bagian and a.tanggal = r.t_awal
      join dipakai b on b.bagian = r.bagian and b.tanggal = r.t_akhir
  ),
  -- Titik pertama & terakhir SELURUH deret (bukan hanya empat terakhir).
  ujung as (
    select
      t.bagian,
      min(t.tanggal) as t_awal,
      max(t.tanggal) as t_akhir,
      count(*) as n
      from titik t group by t.bagian
  ),
  ringkas as (
    select
      u.bagian,
      jsonb_build_object(
        'titik', (
          select coalesce(jsonb_agg(jsonb_build_object('tanggal', x.tanggal, 'nilai', x.nilai)
                                    order by x.tanggal), '[]'::jsonb)
            from titik x where x.bagian = u.bagian
        ),
        'perubahan', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'dari', y.dari, 'ke', y.ke,
                   'nilai_dari', y.nilai_dari, 'nilai_ke', y.nilai_ke,
                   'selisih', y.selisih, 'jarak_hari', y.jarak_hari,
                   'laju_per_pekan', y.laju_per_pekan
                 ) order by y.ke), '[]'::jsonb)
            from perubahan_laju y where y.bagian = u.bagian
        ),
        -- `null` bila baru satu pencatatan: tidak ada yang bisa dibandingkan,
        -- dan nol akan terbaca sebagai "tidak berubah".
        'total_selisih', case when u.n > 1
          then floor((aw.nilai_akhir - aw.nilai_awal) * 10 + 0.5) / 10 end,
        'rentang_hari', case when u.n > 1 then u.t_akhir - u.t_awal end,
        'awal', jsonb_build_object('tanggal', u.t_awal, 'nilai', aw.nilai_awal),
        'akhir', jsonb_build_object('tanggal', u.t_akhir, 'nilai', aw.nilai_akhir),
        'laju_terkini', lt.laju,
        'jumlah', u.n
      ) as isi
      from ujung u
      join lateral (
        select
          (select nilai from titik where bagian = u.bagian and tanggal = u.t_awal) as nilai_awal,
          (select nilai from titik where bagian = u.bagian and tanggal = u.t_akhir) as nilai_akhir
      ) aw on true
      left join laju_terkini lt on lt.bagian = u.bagian
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'tanggal', c2.tanggal,
              'pinggang_cm', c2.pinggang_cm,
              'dada_cm', c2.dada_cm,
              'leher_cm', c2.leher_cm,
              'lengan_kiri_cm', c2.lengan_kiri_cm,
              'lengan_kanan_cm', c2.lengan_kanan_cm,
              'paha_kiri_cm', c2.paha_kiri_cm,
              'paha_kanan_cm', c2.paha_kanan_cm,
              'catatan', c2.catatan
            ) order by c2.tanggal), '[]'::jsonb) from c c2),
    (select coalesce(jsonb_object_agg(r.bagian, r.isi), '{}'::jsonb) from ringkas r)
  into v_catatan, v_bagian;

  -- --- Batas pinggang ------------------------------------------------------
  -- Aturannya dipanggil dari SATU tempat (`status_batas_pinggang`), bukan
  -- ditulis ulang di sini: dua salinan aturan "mendekat" akan menyimpang, dan
  -- layar akan mengatakan 'aman' sementara notifikasinya mengatakan 'mendekat'.
  v_status := public.status_batas_pinggang(
    (v_bagian -> 'pinggang_cm' -> 'akhir' ->> 'nilai')::numeric,
    v_batas,
    (v_bagian -> 'pinggang_cm' ->> 'laju_terkini')::numeric
  );

  return jsonb_build_object(
    'sampai', v_sampai,
    'jumlah', jsonb_array_length(v_catatan),
    'hari_per_pekan', v_pekan,
    'maks_titik_laju', v_maks,
    'catatan', v_catatan,
    'bagian', v_bagian,
    'batas_pinggang', v_status
  );
end;
$$;

comment on function public.riwayat_ukuran(date, integer, integer) is
  'Riwayat ukuran tubuh beserta delta per bagian: selang, laju per pekan, laju '
  'terkini, dan keadaan batas pinggang (lewat status_batas_pinggang). '
  'Aturannya identik dengan ringkasPerubahan/lajuTerkini/statusBatasPinggang '
  'di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.status_batas_pinggang(numeric, numeric, numeric, integer) from public;
revoke all on function public.peringkat_keadaan_pinggang(text) from public;
revoke all on function public.periksa_alert_pinggang(date, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.status_batas_pinggang(numeric, numeric, numeric, integer) to authenticated';
    execute 'grant execute on function public.peringkat_keadaan_pinggang(text) to authenticated';
    execute 'grant execute on function public.periksa_alert_pinggang(date, boolean) to authenticated';
    execute 'grant select, insert, update, delete on public.alert_pinggang to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.alert_pinggang from anon';
  end if;
end $$;
