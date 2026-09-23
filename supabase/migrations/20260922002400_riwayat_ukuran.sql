-- ---------------------------------------------------------------------------
-- Riwayat & delta ukuran tubuh.
--
-- Nilai mentahnya hampir tidak berguna dibaca berderet: "85,4 — 85,2 — 84,8"
-- memaksa orang mengurangi di kepala tiap kali. Yang dicari selalu
-- PERUBAHANNYA, dan perubahan itu baru bermakna kalau jaraknya ikut disebut —
-- +0,3 cm dalam 3 hari dan +0,3 cm dalam 12 hari adalah dua hal yang sangat
-- berbeda, dan pencatatan mingguan yang tertunda sehari-dua hari itu keadaan
-- normal, bukan kekecualian. Karena itu tiap selang membawa `laju_per_pekan`.
--
-- Tiga aturan @recomp/logika ditiru di sini dan kesamaannya dijaga mesin lewat
-- `npm run cek:paritas`:
--   • `ringkasPerubahan` — selang antar pencatatan beserta laju per pekannya.
--   • `lajuTerkini`      — laju dari BEBERAPA pencatatan terakhir sekaligus,
--     bukan dari satu selang terakhir: satu pekan yang aneh (dehidrasi, meteran
--     bergeser sesentimeter) akan mengubah kesimpulannya seluruhnya.
--   • `statusBatasPinggang` — keadaan pinggang terhadap batas pengguna,
--     diukur dalam PERKIRAAN WAKTU, bukan jarak. Sisa 0,8 cm dengan laju
--     +0,1 cm/pekan masih delapan pekan lagi; sisa 0,8 cm dengan +0,4 cm/pekan
--     tinggal dua pekan. Jarak yang sama, urgensi yang berbeda.
--
-- Tanggal yang bagian itu TIDAK diukur dilewati, bukan diisi nol: satu titik
-- nol di tengah deret membuat seluruh grafik dan seluruh laju salah, dan
-- salahnya terlihat dramatis justru karena datanya tidak ada.
-- ---------------------------------------------------------------------------

/** Panjang satu pekan, dipakai menormalkan laju antar selang. */
create or replace function public.hari_per_pekan()
returns integer
language sql
immutable
set search_path = ''
as $$ select 7; $$;

/** Ambang "mendekat" batas pinggang, dalam pekan. */
create or replace function public.ambang_pekan_batas()
returns integer
language sql
immutable
set search_path = ''
as $$ select 4; $$;

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
  v_pinggang numeric;
  v_laju numeric;
  v_selisih numeric;
  v_pekan_lagi numeric;
  v_keadaan text;
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
  v_pinggang := (v_bagian -> 'pinggang_cm' -> 'akhir' ->> 'nilai')::numeric;
  v_laju := (v_bagian -> 'pinggang_cm' ->> 'laju_terkini')::numeric;

  if v_pinggang is null then
    -- Belum ada satu pun lingkar pinggang: tidak ada yang bisa dinilai.
    v_keadaan := null;
  elsif v_batas is null then
    v_keadaan := 'belum-ditetapkan';
  else
    v_selisih := floor((v_pinggang - v_batas) * 10 + 0.5) / 10;
    if v_selisih >= 0 then
      v_keadaan := 'lewat';
      v_pekan_lagi := 0;
    else
      -- Hanya laju NAIK yang bisa membawa pinggang ke batas; laju datar atau
      -- turun berarti batasnya tidak sedang didekati sama sekali.
      if v_laju is not null and v_laju > 0 then
        v_pekan_lagi := ceil((-v_selisih / v_laju) * 10) / 10;
      else
        v_pekan_lagi := null;
      end if;
      if v_pekan_lagi is not null and v_pekan_lagi <= public.ambang_pekan_batas() then
        v_keadaan := 'mendekat';
      else
        v_keadaan := 'aman';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'sampai', v_sampai,
    'jumlah', jsonb_array_length(v_catatan),
    'hari_per_pekan', v_pekan,
    'maks_titik_laju', v_maks,
    'catatan', v_catatan,
    'bagian', v_bagian,
    'batas_pinggang', case when v_keadaan is null then null else jsonb_build_object(
      'keadaan', v_keadaan,
      'batas_cm', v_batas,
      'pinggang_cm', v_pinggang,
      'selisih_cm', v_selisih,
      'laju_per_pekan', v_laju,
      'pekan_lagi', v_pekan_lagi,
      'ambang_pekan', public.ambang_pekan_batas()
    ) end
  );
end;
$$;

comment on function public.riwayat_ukuran(date, integer, integer) is
  'Riwayat ukuran tubuh beserta delta per bagian: selang, laju per pekan, laju '
  'terkini, dan keadaan batas pinggang. Aturannya identik dengan '
  'ringkasPerubahan/lajuTerkini/statusBatasPinggang di @recomp/logika.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.hari_per_pekan() from public;
revoke all on function public.ambang_pekan_batas() from public;
revoke all on function public.riwayat_ukuran(date, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.hari_per_pekan() to authenticated';
    execute 'grant execute on function public.ambang_pekan_batas() to authenticated';
    execute 'grant execute on function public.riwayat_ukuran(date, integer, integer) to authenticated';
  end if;
end $$;
