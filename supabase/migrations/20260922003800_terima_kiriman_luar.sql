-- ---------------------------------------------------------------------------
-- Penerima kiriman Strava & WHOOP (dipanggil webhook, service role saja).
--
-- Webhook hanya membawa id AKUN luar (athlete id Strava, user id WHOOP).
-- Fungsi ini yang mengarahkannya ke pengguna, lewat koneksi yang TERHUBUNG;
-- akun yang tidak dikenal atau sudah diputus diabaikan dengan tenang — webhook
-- tetap dijawab 200 supaya layanan luar berhenti mengulang, tapi tidak ada
-- yang ditulis.
--
-- KONVERSI ASIA/JAKARTA dijaga DATABASE:
--   • workouts mendapat `waktu_mulai`, dan CHECK baru mewajibkan
--     `tanggal = tanggal WIB dari waktu_mulai`. Lari pukul 05.30 WIB tiba
--     sebagai 22.30 UTC HARI SEBELUMNYA; penulis yang lupa mengonversi
--     sekarang DITOLAK, bukan diam-diam memindahkan lari ke kemarin (dan
--     mengubah tipe hari kemarin lewat auto-deteksi).
--   • health_data sudah menurunkan tanggalnya sendiri dari waktu.
-- Fungsi di bawah hanya menerima waktu; tanggal tidak pernah datang dari luar.
-- ---------------------------------------------------------------------------

alter table public.workouts add column if not exists waktu_mulai timestamptz;

comment on column public.workouts.waktu_mulai is
  'Waktu mulai asli (dengan zona). Bila diisi, tanggal WAJIB tanggal Asia/Jakarta-nya.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workouts_tanggal_wib') then
    alter table public.workouts add constraint workouts_tanggal_wib
      check (waktu_mulai is null or tanggal = (timezone('Asia/Jakarta', waktu_mulai))::date);
  end if;
end $$;

/**
 * Terima satu kiriman untuk satu akun luar.
 *
 *   p_sumber  'strava' | 'whoop'
 *   p_akun    id akun di layanan itu (teks)
 *   p_kiriman {
 *     latihan:       [{ id, nama, jenis, mulai, durasi_menit }],
 *     data:          [{ jenis, id, nilai, mulai, selesai? }],
 *     hapus_latihan: [id],
 *     hapus_data:    [{ id, jenis }]
 *   }
 *
 * Keluaran: { diabaikan: 'akun_tidak_dikenal' } atau
 *           { latihan, data, dihapus, dilewati: [{ bagian, indeks, alasan }] }.
 * Satu transaksi; kiriman ulang aman (upsert pada kunci dedup tiap tabel).
 */
create or replace function public.terima_kiriman_luar(p_sumber text, p_akun text, p_kiriman jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid;
  v_e jsonb;
  v_i integer;
  v_n integer;
  v_latihan integer := 0;
  v_data integer := 0;
  v_hapus integer := 0;
  v_lewati jsonb := '[]'::jsonb;
  v_mulai timestamptz;
begin
  -- Pintu ini melewati RLS (service role) dan memilih pengguna dari id akun
  -- luar; pengguna biasa tidak boleh memakainya sama sekali.
  if current_user <> 'service_role' then
    raise exception 'Hanya untuk webhook server' using errcode = '42501';
  end if;
  if p_sumber not in ('strava', 'whoop') then
    raise exception 'Sumber webhook tidak dikenal: %', p_sumber using errcode = '22023';
  end if;

  select c.user_id into v_user
    from public.health_connections c
   where c.sumber = p_sumber and c.akun_eksternal = p_akun and c.status = 'terhubung';
  if v_user is null then
    return jsonb_build_object('diabaikan', 'akun_tidak_dikenal');
  end if;

  -- --- Latihan -----------------------------------------------------------
  for v_e, v_i in
    select e, i - 1 from jsonb_array_elements(coalesce(p_kiriman -> 'latihan', '[]')) with ordinality as x (e, i)
  loop
    begin
      v_mulai := (v_e ->> 'mulai')::timestamptz;
      insert into public.workouts (user_id, tanggal, nama, jenis, sumber, external_id, durasi_menit, waktu_mulai)
      values (v_user,
              (timezone('Asia/Jakarta', v_mulai))::date,
              left(coalesce(nullif(trim(v_e ->> 'nama'), ''), 'Aktivitas'), 120),
              (v_e ->> 'jenis')::public.jenis_olahraga,
              p_sumber::public.sumber_workout,
              v_e ->> 'id',
              (v_e ->> 'durasi_menit')::integer,
              v_mulai)
      on conflict (user_id, sumber, external_id) do update
        set tanggal = excluded.tanggal,
            nama = excluded.nama,
            jenis = excluded.jenis,
            durasi_menit = excluded.durasi_menit,
            waktu_mulai = excluded.waktu_mulai;
      v_latihan := v_latihan + 1;
    exception
      when check_violation or not_null_violation or data_exception then
        v_lewati := v_lewati || jsonb_build_object('bagian', 'latihan', 'indeks', v_i, 'alasan', sqlerrm);
    end;
  end loop;

  -- --- Angka kesehatan -----------------------------------------------------
  for v_e, v_i in
    select e, i - 1 from jsonb_array_elements(coalesce(p_kiriman -> 'data', '[]')) with ordinality as x (e, i)
  loop
    begin
      insert into public.health_data (user_id, sumber, asal, id_eksternal, jenis, nilai, waktu_mulai, waktu_selesai)
      values (v_user, p_sumber, null, v_e ->> 'id', v_e ->> 'jenis', (v_e ->> 'nilai')::numeric,
              (v_e ->> 'mulai')::timestamptz, (v_e ->> 'selesai')::timestamptz)
      on conflict on constraint health_data_kunci_dedup do update
        set nilai = excluded.nilai,
            waktu_mulai = excluded.waktu_mulai,
            waktu_selesai = excluded.waktu_selesai;
      v_data := v_data + 1;
    exception
      when check_violation or not_null_violation or data_exception then
        v_lewati := v_lewati || jsonb_build_object('bagian', 'data', 'indeks', v_i, 'alasan', sqlerrm);
    end;
  end loop;

  -- --- Penghapusan -------------------------------------------------------------
  delete from public.workouts w
   where w.user_id = v_user
     and w.sumber = p_sumber::public.sumber_workout
     and w.external_id in (select jsonb_array_elements_text(coalesce(p_kiriman -> 'hapus_latihan', '[]')));
  get diagnostics v_n = row_count;
  v_hapus := v_hapus + v_n;

  delete from public.health_data h
   using jsonb_array_elements(coalesce(p_kiriman -> 'hapus_data', '[]')) as x (e)
   where h.user_id = v_user
     and h.sumber = p_sumber
     and h.asal is null
     and h.id_eksternal = x.e ->> 'id'
     and h.jenis = x.e ->> 'jenis';
  get diagnostics v_n = row_count;
  v_hapus := v_hapus + v_n;

  update public.health_connections
     set sinkron_terakhir = now(), galat_terakhir = null, galat_pada = null
   where user_id = v_user and sumber = p_sumber;

  return jsonb_build_object('latihan', v_latihan, 'data', v_data, 'dihapus', v_hapus, 'dilewati', v_lewati);
end;
$$;

/**
 * Layanan luar memberi tahu bahwa izin dicabut (Strava: athlete
 * `authorized: false`), atau token tidak bisa disegarkan lagi. Koneksi
 * menjadi `terputus` — pemicu menghapus tokennya — dan alasannya tampil di
 * layar Sumber data. Data yang sudah masuk TIDAK dihapus: itu pilihan
 * pengguna, bukan efek samping.
 */
create or replace function public.putus_koneksi_luar(p_sumber text, p_akun text, p_alasan text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_n integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Hanya untuk webhook server' using errcode = '42501';
  end if;
  update public.health_connections
     set status = 'terputus',
         galat_terakhir = left(coalesce(nullif(trim(p_alasan), ''), 'Izin dicabut dari layanan asal.'), 300),
         galat_pada = now()
   where sumber = p_sumber and akun_eksternal = p_akun and status = 'terhubung';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

/**
 * Catat galat sinkron tanpa memutus (token gagal disegarkan sementara,
 * API layanan sedang 5xx). Tampil sebagai "perlu perhatian" di layar.
 */
create or replace function public.catat_galat_koneksi_luar(p_sumber text, p_akun text, p_pesan text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Hanya untuk webhook server' using errcode = '42501';
  end if;
  update public.health_connections
     set galat_terakhir = left(coalesce(nullif(trim(p_pesan), ''), 'Sinkron gagal.'), 300),
         galat_pada = now()
   where sumber = p_sumber and akun_eksternal = p_akun and status = 'terhubung';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.terima_kiriman_luar(text, text, jsonb)',
    'public.putus_koneksi_luar(text, text, text)',
    'public.catat_galat_koneksi_luar(text, text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
