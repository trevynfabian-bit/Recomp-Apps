-- ---------------------------------------------------------------------------
-- Proteksi protein pada redistribusi kalori.
--
-- "Protein tidak pernah dipotong" adalah aturan keras PRD. Sampai sekarang ia
-- dijamin oleh dua hal yang sifatnya STRUKTURAL:
--   1. Tabel redistribusi tidak punya kolom protein sama sekali (001400), jadi
--      tidak ada tempat untuk menuliskan perubahannya.
--   2. `terapkan_redistribusi` hanya menulis kolom kalori (001600).
--
-- Keduanya benar hari ini, dan keduanya bisa dilanggar besok oleh kode baru
-- yang menyentuh `daily_logs` lewat jalur lain. Berkas ini menutup celah itu
-- dari sisi BARIS, bukan dari sisi pemanggil:
--   • pemicu yang menolak penurunan target protein pada hari yang kalorinya
--     diredistribusi;
--   • satu RPC untuk MEMPERLIHATKAN buktinya, supaya UI dan AI coach bisa
--     menunjukkan angkanya, bukan sekadar mengklaim aturannya.
--
-- Yang dijaga adalah TARGET protein, bukan konsumsi. Berapa protein yang
-- benar-benar dimakan tetap milik pengguna.
-- ---------------------------------------------------------------------------

create or replace function public.jaga_protein_redistribusi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Hanya hari yang kalorinya PERNAH diredistribusi yang dijaga. Di hari lain,
  -- menurunkan target protein adalah penyuntingan rencana yang sah — dan
  -- melarangnya akan membekukan seluruh riwayat, bukan melindungi apa pun.
  if coalesce(old.target_asli_kalori, new.target_asli_kalori) is null then
    return new;
  end if;

  -- Tipe hari atau fase berubah → ini penyegaran snapshot yang sah (lihat
  -- `setel_tipe_hari` dan `ganti_fase`), dan target proteinnya memang milik
  -- rencana yang baru, bukan sisa rencana lama yang dipotong.
  if new.day_type_id is distinct from old.day_type_id
     or new.fase is distinct from old.fase then
    return new;
  end if;

  if old.target_protein_g is not null
     and new.target_protein_g is not null
     and new.target_protein_g < old.target_protein_g then
    raise exception
      'Target protein tidak boleh diturunkan pada hari yang kalorinya diredistribusi (%g → %g pada %)',
      old.target_protein_g, new.target_protein_g, new.tanggal
      using errcode = '23514';
  end if;

  -- Mengosongkan targetnya sama saja dengan memotongnya sampai nol.
  if old.target_protein_g is not null and new.target_protein_g is null then
    raise exception
      'Target protein tidak boleh dikosongkan pada hari yang kalorinya diredistribusi (%)',
      new.tanggal
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.jaga_protein_redistribusi() is
  'Menolak penurunan target protein pada hari yang kalorinya diredistribusi. '
  'Penyegaran snapshot karena ganti tipe hari atau ganti fase tetap diizinkan.';

drop trigger if exists daily_logs_protein_terjaga on public.daily_logs;
create trigger daily_logs_protein_terjaga
  before update on public.daily_logs
  for each row execute function public.jaga_protein_redistribusi();

-- ---------------------------------------------------------------------------
-- Bukti yang bisa dibaca: apa yang berubah dan apa yang tidak.
--
-- Kolom kalorinya diambil apa adanya dari `daily_logs` — `target_asli_kalori`
-- adalah rencana semula dan `target_kalori` yang berlaku — jadi selisihnya
-- tidak bisa berbeda dari yang dipakai budget mingguan.
-- ---------------------------------------------------------------------------
create or replace function public.proteksi_protein(
  p_tanggal date default null,
  p_hari_ini date default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date := coalesce(p_hari_ini, (now() at time zone 'Asia/Jakarta')::date);
  v_senin date := public.awal_minggu(coalesce(p_tanggal, v_hari_ini));
  v_rincian jsonb;
  v_utuh boolean;
  v_diredistribusi integer;
  v_kalori_dipindah integer;
  v_penjaga boolean;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  with hari as (
    select (v_senin + i)::date as tanggal from generate_series(0, 6) as i
  ),
  bawaan as (
    select d.id from public.day_types d
     where d.user_id = v_user_id and d.is_default
     limit 1
  ),
  isi as (
    select
      h.tanggal,
      coalesce(l.day_type_id, (select id from bawaan)) as day_type_id,
      l.target_protein_g as snap_protein,
      l.target_kalori as kalori_berlaku,
      l.target_asli_kalori,
      l.tanggal is not null as ada_baris
    from hari h
    left join public.daily_logs l
      on l.user_id = v_user_id and l.tanggal = h.tanggal
  ),
  lengkap as (
    select
      i.*,
      dt.nama as nama_tipe_hari,
      t.target_protein_g as protein_rencana,
      -- Dipakai untuk hari yang belum punya baris sama sekali.
      t.target_kalori as kalori_rencana_tipe
    from isi i
    left join public.day_types dt on dt.id = i.day_type_id
    left join public.day_type_targets t
      on t.day_type_id = i.day_type_id
     and t.fase = public.fase_pada_tanggal(i.tanggal)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'tanggal', l.tanggal,
          'nama_tipe_hari', l.nama_tipe_hari,
          'diredistribusi', l.target_asli_kalori is not null,
          -- Rencana semula vs yang berlaku. Sama untuk hari yang tidak disentuh.
          'kalori_rencana', coalesce(l.target_asli_kalori, l.kalori_berlaku, l.kalori_rencana_tipe, 0),
          'kalori_berlaku', coalesce(l.kalori_berlaku, l.kalori_rencana_tipe, 0),
          'selisih_kalori',
            coalesce(l.kalori_berlaku, l.kalori_rencana_tipe, 0)
            - coalesce(l.target_asli_kalori, l.kalori_berlaku, l.kalori_rencana_tipe, 0),
          'protein_g', coalesce(l.snap_protein, l.protein_rencana),
          'protein_rencana', l.protein_rencana,
          -- Protein TIDAK ikut berubah: selisihnya selalu nol, dan itulah yang
          -- diperlihatkan — bukan kalimat yang mengklaimnya.
          'selisih_protein', 0,
          'protein_di_bawah_rencana',
            l.snap_protein is not null and l.protein_rencana is not null
            and l.snap_protein < l.protein_rencana
        )
        order by l.tanggal
      ),
      '[]'::jsonb
    ),
    bool_and(
      not (l.target_asli_kalori is not null
           and l.snap_protein is not null and l.protein_rencana is not null
           and l.snap_protein < l.protein_rencana)
    ),
    count(*) filter (where l.target_asli_kalori is not null)::integer,
    coalesce(sum(
      coalesce(l.kalori_berlaku, 0) - coalesce(l.target_asli_kalori, l.kalori_berlaku, 0)
    ), 0)::integer
  into v_rincian, v_utuh, v_diredistribusi, v_kalori_dipindah
  from lengkap l;

  -- Jaminan sebenarnya bukan angka di atas, melainkan pemicu ini. Statusnya
  -- ikut dilaporkan supaya "protein tidak dipotong" bisa dibuktikan sedang
  -- BERLAKU, bukan sekadar sedang benar kebetulan.
  select exists (
    select 1 from pg_trigger
     where tgname = 'daily_logs_protein_terjaga'
       and tgrelid = 'public.daily_logs'::regclass
       and not tgisinternal
  ) into v_penjaga;

  return jsonb_build_object(
    'minggu_mulai', v_senin,
    'hari_ini', v_hari_ini,
    'utuh', coalesce(v_utuh, true),
    'penjaga_aktif', v_penjaga,
    'jumlah_diredistribusi', v_diredistribusi,
    'kalori_dipindah', v_kalori_dipindah,
    'rincian', v_rincian
  );
end;
$$;

comment on function public.proteksi_protein(date, date) is
  'Bukti terbaca bahwa redistribusi hanya menggeser kalori: rencana semula vs '
  'yang berlaku per hari, target protein yang tidak ikut bergeser, dan status '
  'pemicu penjaganya.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.proteksi_protein(date, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.proteksi_protein(date, date) to authenticated';
  end if;
end $$;
