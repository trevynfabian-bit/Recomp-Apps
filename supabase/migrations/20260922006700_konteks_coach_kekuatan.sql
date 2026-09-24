-- =============================================================================
-- Konteks coach: kekuatan per gerakan ikut dibawa
--
-- Coach menjawab dari satu snapshot (`konteks_coach`), tetapi snapshot itu
-- tidak memuat kekuatan sama sekali: pertanyaan "apakah saya makin kuat?"
-- hanya bisa dijawab dari evaluasi tersimpan terakhir, bila ada, atau ditebak.
-- Kini snapshot membawa e1RM per gerakan 28 hari terakhir dari
-- `e1rm_per_gerakan` (aturan yang sama dengan layar Latihan dan sumbu kekuatan
-- evaluasi), dan coach punya fungsi `ambil_kekuatan` yang menjawab darinya.
-- Aman dijalankan ulang.
-- =============================================================================

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
  v_kekuatan jsonb;
  v_ringkasan public.ringkasan_mingguan;
  v_angka jsonb := '[]'::jsonb;
  v_rata numeric;
  v_n_timbangan integer;
  v_senin date;
  v_s_berat jsonb;
  v_s_berat_pekan jsonb;
  v_s_kalori jsonb;
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

  -- Kekuatan 28 hari terakhir dari e1RM gerakan yang diulang (sama dengan
  -- layar Latihan & sumbu kekuatan evaluasi). Deret titiknya tidak ikut:
  -- cukup ujung, selisih, dan arahnya, paling banyak 12 gerakan.
  v_kekuatan := public.e1rm_per_gerakan(v_hari_ini - 27, v_hari_ini);

  select * into v_evaluasi from public.evaluasi_periodik
   where user_id = v_user_id order by periode_dari desc limit 1;
  select * into v_ringkasan from public.ringkasan_mingguan
   where user_id = v_user_id order by periode_dari desc limit 1;

  v_rata := (v_tren -> 'rata_rata' ->> 'rata_rata_kg')::numeric;
  v_n_timbangan := (v_tren -> 'rata_rata' ->> 'jumlah_timbangan')::integer;
  v_senin := (v_budget ->> 'minggu_mulai')::date;

  -- Penanda diturunkan dari MASUKANNYA, per rentang yang benar-benar dipakai
  -- angka itu. Memakai satu rentang untuk semua akan menandai rata-rata 7 hari
  -- dengan sumber timbangan dari tiga pekan lalu.
  v_s_berat := public.sumber_berat_periode(v_hari_ini - 6, v_hari_ini);
  v_s_berat_pekan := public.sumber_berat_periode(v_hari_ini - 13, v_hari_ini);
  v_s_kalori := public.sumber_kalori_periode(v_senin, v_senin + 6);

  if v_rata is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'berat_rata_7_hari',
      'nilai', v_rata,
      'unit', 'kg',
      'sumber', v_s_berat ->> 'sumber',
      'dasar', jsonb_build_object(
        'jumlah_timbangan', v_n_timbangan,
        'jendela_hari', 7,
        'sumber_rincian', v_s_berat -> 'rincian'
      )
    );
  end if;

  if (v_tren -> 'arah' ->> 'perubahan_kg') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'perubahan_berat_sepekan',
      'nilai', (v_tren -> 'arah' ->> 'perubahan_kg')::numeric,
      'unit', 'kg',
      'sumber', v_s_berat_pekan ->> 'sumber',
      'dasar', jsonb_build_object(
        'arah', v_tren -> 'arah' ->> 'arah',
        'ambang_kg', v_tren -> 'arah' -> 'ambang_kg',
        'sumber_rincian', v_s_berat_pekan -> 'rincian'
      )
    );
  end if;

  -- Sisa budget: satu porsi yang ditaksir AI membuat totalnya taksiran.
  v_angka := v_angka || jsonb_build_object(
    'kunci', 'sisa_budget_pekan',
    'nilai', (v_budget ->> 'sisa')::integer,
    'unit', 'kcal',
    'sumber', v_s_kalori ->> 'sumber',
    'dasar', jsonb_build_object(
      'hari_tersisa', v_budget -> 'hari_tersisa',
      'budget_total', v_budget -> 'budget_total',
      'status_laju', v_budget -> 'laju' ->> 'status',
      'sumber_rincian', v_s_kalori -> 'rincian'
    )
  );

  -- Target adalah SETELAN yang diketik pengguna, bukan pengukuran: sumbernya
  -- manual apa pun isi catatan makannya.
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

  -- TDEE memakai asupan DAN berat, jadi keraguan keduanya ikut menular — tapi
  -- ia estimasi apa pun masukannya, dan estimasi sudah peringkat tertinggi.
  if (v_tdee ->> 'tengah') is not null then
    v_angka := v_angka || jsonb_build_object(
      'kunci', 'tdee',
      'nilai', (v_tdee ->> 'tengah')::integer,
      'unit', 'kcal',
      'sumber', 'estimasi',
      'dasar', jsonb_build_object(
        'rentang', jsonb_build_array(v_tdee -> 'min', v_tdee -> 'maks'),
        'keyakinan', v_tdee ->> 'keyakinan',
        'jumlah_metode', jsonb_array_length(v_tdee -> 'metode'),
        'sumber_masukan', jsonb_build_object(
          'berat', public.sumber_berat_periode(v_hari_ini - 13, v_hari_ini) -> 'sumber',
          'kalori', public.sumber_kalori_periode(v_hari_ini - 13, v_hari_ini) -> 'sumber'
        )
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

  -- Ukuran tubuh selalu diketik tangan; tidak ada perangkat yang mengirimnya.
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
    'angka', v_angka,
    'tren', jsonb_build_object(
      'dari', v_tren ->> 'dari',
      'sampai', v_tren ->> 'sampai',
      'rata_rata', v_tren -> 'rata_rata',
      'sepekan_lalu', v_tren -> 'sepekan_lalu',
      'arah', v_tren -> 'arah',
      'kecukupan', v_tren -> 'kecukupan',
      'status_koridor', v_tren -> 'status_koridor',
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
    'kekuatan', jsonb_build_object(
      'periode_dari', v_kekuatan -> 'periode_dari',
      'periode_sampai', v_kekuatan -> 'periode_sampai',
      'naik', v_kekuatan -> 'naik',
      'turun', v_kekuatan -> 'turun',
      'datar', v_kekuatan -> 'datar',
      'gerakan', coalesce((
        select jsonb_agg(g.e - 'titik' order by g.i)
          from jsonb_array_elements(v_kekuatan -> 'gerakan') with ordinality as g (e, i)
         where g.i <= 12
      ), '[]'::jsonb)
    ),
    'ringkasan_terakhir', case when v_ringkasan.id is null then null else jsonb_build_object(
      'periode_dari', v_ringkasan.periode_dari,
      'periode_sampai', v_ringkasan.periode_sampai,
      'poin', v_ringkasan.poin,
      'bacaan', v_ringkasan.bacaan
    ) end,
    'aturan', jsonb_build_object(
      'wajib_rata_rata_7_hari', true,
      'berat_harian_tidak_dikutip', true,
      'setiap_angka_bersumber', true,
      -- Penanda agregat diturunkan dari masukannya; satu masukan taksiran
      -- membuat agregatnya taksiran.
      'sumber_mata_rantai_terlemah', true,
      'dosis_obat_ditolak_di_klien', true,
      'sumber_dikenal', jsonb_build_array('manual', 'sinkron', 'estimasi')
    )
  );
end;
$$;
