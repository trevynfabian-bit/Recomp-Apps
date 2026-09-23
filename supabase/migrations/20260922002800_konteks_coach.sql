-- ---------------------------------------------------------------------------
-- Konteks data lengkap untuk AI Coach.
--
-- PRD memberi coach tiga syarat yang tidak bisa dijamin lewat prompt: ia WAJIB
-- memakai rata-rata 7 hari, ia HARUS membedakan data mentah dari estimasi, dan
-- ia tidak memberi dosis obat. Prompt yang menuliskan syarat itu sebagai
-- kalimat hanya berharap modelnya menurut. Berkas ini menjamin dua yang pertama
-- lewat BENTUK DATANYA:
--
-- 1. Berat badan yang bisa DIKUTIP hanya rata-rata 7 hari. Timbangan harian
--    tidak pernah muncul sebagai angka berlabel di `angka[]`; ia hanya ada di
--    dalam deret tren, tempat ia jelas merupakan titik grafik, bukan "berat
--    Anda hari ini". Coach tidak bisa mengutip angka yang tidak diberikan.
-- 2. Setiap angka membawa `sumber` — manual, sinkron, atau estimasi — sebagai
--    DATA, bukan sebagai kata di dalam kalimat. Model bisa lupa menulis
--    "estimasi"; ia tidak bisa menghapus field. App yang merender kartunya
--    membaca field itu, jadi labelnya tidak bergantung pada prosa model.
--
-- Syarat ketiga (dosis obat) ditegakkan di KLIEN oleh `periksaBatasMedis`,
-- sebelum pertanyaannya dikirim ke mana pun: penolakan jadi pasti, dan
-- pertanyaan kesehatan sensitif tidak perlu meninggalkan perangkat hanya untuk
-- ditolak. Yang ada di sini hanya BENDERA-nya, supaya penyusun prompt bisa
-- memeriksa bahwa aturan itu memang menyala.
--
-- Kalimat apa pun — disclaimer, label, satuan panjang — tidak disusun di sini.
-- Alasannya sama seperti di RPC lain: angka di server, kalimat di
-- @recomp/logika, supaya formatnya satu.
-- ---------------------------------------------------------------------------

create or replace function public.konteks_coach(
  p_tanggal date default null,
  p_persen_lemak numeric default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_profil public.profiles;
  v_usia integer;
  v_tren jsonb;
  v_budget jsonb;
  v_tdee jsonb;
  v_bf jsonb;
  v_ukuran jsonb;
  v_target record;
  v_evaluasi public.evaluasi_periodik;
  v_ringkasan public.ringkasan_mingguan;
  v_angka jsonb := '[]'::jsonb;
  v_rata numeric;
  v_n_timbangan integer;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_profil from public.profiles where user_id = v_user_id;
  if v_profil.tanggal_lahir is not null then
    v_usia := extract(year from age(v_hari_ini, v_profil.tanggal_lahir))::integer;
  end if;

  v_tren := public.tren_berat_7_hari(v_hari_ini, 28);
  v_budget := public.budget_mingguan(v_hari_ini, v_hari_ini);
  v_tdee := public.estimasi_tdee(v_hari_ini, 14, p_persen_lemak);
  v_bf := public.estimasi_body_fat(v_hari_ini);
  v_ukuran := public.riwayat_ukuran(v_hari_ini, 8, 4);
  select * into v_target from public.ambil_target_harian(v_hari_ini);

  select * into v_evaluasi from public.evaluasi_periodik
   where user_id = v_user_id order by periode_dari desc limit 1;
  select * into v_ringkasan from public.ringkasan_mingguan
   where user_id = v_user_id order by periode_dari desc limit 1;

  v_rata := (v_tren -> 'rata_rata' ->> 'rata_rata_kg')::numeric;
  v_n_timbangan := (v_tren -> 'rata_rata' ->> 'jumlah_timbangan')::integer;

  -- --- Angka yang boleh dikutip, masing-masing dengan asalnya --------------
  -- `dasar` memuat seberapa tipis dasarnya. Rata-rata dari satu timbangan dan
  -- dari tujuh timbangan tampak sama persis kalau hanya angkanya yang disebut.
  if v_rata is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'berat_rata_7_hari',
      'nilai', v_rata,
      'unit', 'kg',
      'sumber', 'manual',
      'dasar', jsonb_build_object('jumlah_timbangan', v_n_timbangan, 'jendela_hari', 7)
    );
  end if;

  if (v_tren -> 'arah' ->> 'perubahan_kg') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'perubahan_berat_sepekan',
      'nilai', (v_tren -> 'arah' ->> 'perubahan_kg')::numeric,
      'unit', 'kg',
      'sumber', 'manual',
      'dasar', jsonb_build_object(
        'arah', v_tren -> 'arah' ->> 'arah',
        'ambang_kg', v_tren -> 'arah' -> 'ambang_kg'
      )
    );
  end if;

  v_angka := v_angka || jsonb_build_object(
    'kunci', 'sisa_budget_pekan',
    'nilai', (v_budget ->> 'sisa')::integer,
    'unit', 'kcal',
    'sumber', 'manual',
    'dasar', jsonb_build_object(
      'hari_tersisa', v_budget -> 'hari_tersisa',
      'budget_total', v_budget -> 'budget_total',
      'status_laju', v_budget -> 'laju' ->> 'status'
    )
  );

  if v_target.target_kalori is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'target_kalori_hari_ini',
      'nilai', v_target.target_kalori,
      'unit', 'kcal',
      'sumber', 'manual',
      'dasar', jsonb_build_object('tipe_hari', v_target.nama_tipe_hari, 'fase', v_target.fase)
    );
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'target_protein_hari_ini',
      'nilai', v_target.target_protein_g,
      'unit', 'g',
      'sumber', 'manual',
      'dasar', jsonb_build_object('tipe_hari', v_target.nama_tipe_hari)
    );
  end if;

  -- TDEE & body fat adalah ESTIMASI, dan di sini itu tertulis sebagai field.
  if (v_tdee ->> 'tengah') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'tdee',
      'nilai', (v_tdee ->> 'tengah')::integer,
      'unit', 'kcal',
      'sumber', 'estimasi',
      'dasar', jsonb_build_object(
        'rentang', jsonb_build_array(v_tdee -> 'min', v_tdee -> 'maks'),
        'keyakinan', v_tdee ->> 'keyakinan',
        'jumlah_metode', jsonb_array_length(v_tdee -> 'metode')
      )
    );
  end if;

  if (v_bf ->> 'persen') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'body_fat_persen',
      'nilai', (v_bf ->> 'persen')::numeric,
      'unit', '%',
      'sumber', 'estimasi',
      'dasar', jsonb_build_object(
        'metode', v_bf ->> 'metode',
        'rentang', v_bf -> 'rentang',
        'ketidakpastian', v_bf -> 'ketidakpastian'
      )
    );
  end if;

  if (v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'nilai') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'pinggang_terakhir',
      'nilai', (v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'nilai')::numeric,
      'unit', 'cm',
      'sumber', 'manual',
      'dasar', jsonb_build_object(
        'tanggal', v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'akhir' ->> 'tanggal',
        'laju_per_pekan', v_ukuran -> 'bagian' -> 'pinggang_cm' -> 'laju_terkini'
      )
    );
  end if;

  return jsonb_build_object(
    'hari_ini', v_hari_ini,
    'fase', public.fase_pada_tanggal(v_hari_ini),
    'profil', jsonb_build_object(
      'tinggi_cm', v_profil.tinggi_cm,
      'jenis_kelamin', v_profil.jenis_kelamin,
      'usia_tahun', v_usia,
      'satuan', v_profil.satuan,
      'batas_pinggang_cm', v_profil.batas_pinggang_cm,
      'batas_bawah_kalori', v_profil.batas_bawah_kalori
    ),
    -- Angka yang boleh dikutip. Timbangan HARIAN sengaja tidak ada di sini.
    'angka', v_angka,
    'tren', jsonb_build_object(
      'dari', v_tren ->> 'dari',
      'sampai', v_tren ->> 'sampai',
      'rata_rata', v_tren -> 'rata_rata',
      'sepekan_lalu', v_tren -> 'sepekan_lalu',
      'arah', v_tren -> 'arah',
      'kecukupan', v_tren -> 'kecukupan',
      'status_koridor', v_tren -> 'status_koridor',
      -- Deret lengkap: di sini timbangan harian memang muncul, tapi sebagai
      -- titik grafik yang jelas asalnya — bukan sebagai "berat Anda hari ini".
      'deret', v_tren -> 'deret'
    ),
    'budget', jsonb_build_object(
      'minggu_mulai', v_budget ->> 'minggu_mulai',
      'budget_total', v_budget -> 'budget_total',
      'terpakai', v_budget -> 'terpakai',
      'sisa', v_budget -> 'sisa',
      'hari_tersisa', v_budget -> 'hari_tersisa',
      'sisa_per_hari', v_budget -> 'sisa_per_hari',
      'laju', v_budget -> 'laju',
      'rincian', v_budget -> 'rincian'
    ),
    'target_hari_ini', case when v_target.day_type_id is null then null
      else jsonb_build_object(
        'nama_tipe_hari', v_target.nama_tipe_hari,
        'fase', v_target.fase,
        'target_kalori', v_target.target_kalori,
        'target_protein_g', v_target.target_protein_g,
        'target_lemak_g', v_target.target_lemak_g,
        'batas_sat_fat_g', v_target.batas_sat_fat_g
      ) end,
    'ukuran', jsonb_build_object(
      'jumlah', v_ukuran -> 'jumlah',
      'bagian', v_ukuran -> 'bagian',
      'batas_pinggang', v_ukuran -> 'batas_pinggang'
    ),
    'body_fat', v_bf,
    'tdee', v_tdee,
    'evaluasi_terakhir', case when v_evaluasi.id is null then null else jsonb_build_object(
      'periode_dari', v_evaluasi.periode_dari,
      'periode_sampai', v_evaluasi.periode_sampai,
      'kode', v_evaluasi.kode,
      'judul', v_evaluasi.judul,
      'ringkas', v_evaluasi.ringkas,
      'rekomendasi', v_evaluasi.rekomendasi,
      'keyakinan', v_evaluasi.keyakinan,
      'arah', jsonb_build_object(
        'berat', v_evaluasi.arah_berat,
        'pinggang', v_evaluasi.arah_pinggang,
        'kekuatan', v_evaluasi.arah_kekuatan
      )
    ) end,
    'ringkasan_terakhir', case when v_ringkasan.id is null then null else jsonb_build_object(
      'periode_dari', v_ringkasan.periode_dari,
      'periode_sampai', v_ringkasan.periode_sampai,
      'poin', v_ringkasan.poin,
      'bacaan', v_ringkasan.bacaan
    ) end,
    -- Bendera aturan, bukan kalimatnya. Penyusun prompt memakai teks dari
    -- @recomp/logika (DISCLAIMER_COACH dsb.) supaya kalimatnya satu versi.
    'aturan', jsonb_build_object(
      'wajib_rata_rata_7_hari', true,
      'berat_harian_tidak_dikutip', true,
      'setiap_angka_bersumber', true,
      'dosis_obat_ditolak_di_klien', true,
      'sumber_dikenal', jsonb_build_array('manual', 'sinkron', 'estimasi')
    )
  );
end;
$$;

comment on function public.konteks_coach(date, numeric) is
  'Konteks data lengkap untuk AI Coach dalam satu snapshot. Angka yang boleh '
  'dikutip ada di `angka[]`, masing-masing dengan `sumber`; timbangan harian '
  'sengaja tidak disertakan sebagai angka berlabel.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.konteks_coach(date, numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.konteks_coach(date, numeric) to authenticated';
  end if;
end $$;
