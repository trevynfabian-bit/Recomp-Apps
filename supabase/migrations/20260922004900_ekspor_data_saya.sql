-- =============================================================================
-- Endpoint ekspor seluruh data pribadi
--
--   ekspor_data_saya()        → semua data milik pengguna sebagai daftar tabel
--                               { nama, label, kolom[], baris[][] } — bentuk
--                               yang sama dengan `TabelEkspor` di
--                               @recomp/logika, jadi app langsung menyusunnya
--                               menjadi CSV + JSON + BACA-SAYA di dalam ZIP.
--   ringkas_ekspor_data_saya() → hanya { nama, label, jumlah } per tabel, untuk
--                               memperlihatkan isi ekspor SEBELUM berkasnya
--                               disiapkan, tanpa menarik seluruh datanya.
--
-- Keduanya SECURITY INVOKER: RLS tetap penjaga utamanya, dan setiap kueri juga
-- memfilter pemiliknya secara eksplisit. Yang TIDAK ikut: rahasia token sumber
-- data (health_connection_secrets), kursor & galat teknis sinkron, penghitung
-- kuota coach, dan ringkasan turunan (daily_summaries) — semuanya bukan data
-- yang pengguna catat atau terima, dan sebagian (token) tidak boleh keluar dari
-- server sama sekali.
--
-- Satuan disebut di nama kolom dan selalu metrik seperti yang tersimpan.
-- Kesamaan hitungan kedua fungsi dijaga uji rpc_ekspor_data_saya.
-- =============================================================================

create or replace function public.ekspor_data_saya()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  u uuid := (select auth.uid());
  v jsonb := '[]'::jsonb;
begin
  if u is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  v := v || jsonb_build_object('nama', 'profil', 'label', 'profil',
    'kolom', jsonb_build_array('nama', 'satuan_tampilan', 'fase_aktif', 'tinggi_cm', 'jenis_kelamin', 'tanggal_lahir',
                               'batas_pinggang_cm', 'batas_bawah_kalori_kcal', 'bergabung_pada'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(p.nama, p.satuan, p.fase_aktif, p.tinggi_cm, p.jenis_kelamin,
                                                          p.tanggal_lahir, p.batas_pinggang_cm, p.batas_bawah_kalori, p.created_at))
                         from public.profiles p where p.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'riwayat_fase', 'label', 'periode fase',
    'kolom', jsonb_build_array('fase', 'mulai', 'selesai', 'berat_awal_kg'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(f.fase, f.mulai_tanggal, f.selesai_tanggal, f.berat_awal_kg)
                                        order by f.mulai_tanggal)
                         from public.fase_periode f where f.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'tipe_hari', 'label', 'tipe hari',
    'kolom', jsonb_build_array('tipe_hari', 'auto_deteksi', 'bawaan', 'urutan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(d.nama, d.auto_detect, d.is_default, d.urutan)
                                        order by d.urutan, d.nama)
                         from public.day_types d where d.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'target_tipe_hari', 'label', 'target tipe hari',
    'kolom', jsonb_build_array('tipe_hari', 'fase', 'kalori_kcal', 'protein_g', 'lemak_g', 'batas_sat_fat_g'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(d.nama, t.fase, t.target_kalori, t.target_protein_g,
                                                          t.target_lemak_g, t.batas_sat_fat_g)
                                        order by d.urutan, d.nama, t.fase)
                         from public.day_type_targets t join public.day_types d on d.id = t.day_type_id
                        where t.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'catatan_harian', 'label', 'hari tercatat',
    'kolom', jsonb_build_array('tanggal', 'berat_pagi_kg', 'sumber_berat', 'waktu_timbang', 'tipe_hari', 'fase',
                               'kalori_kcal', 'protein_g', 'lemak_g', 'karbo_g', 'sat_fat_g',
                               'target_kalori_kcal', 'target_asli_kalori_kcal', 'target_protein_g', 'target_lemak_g',
                               'batas_sat_fat_g', 'catatan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(l.tanggal, l.berat_pagi_kg, l.sumber_berat, l.waktu_timbang,
                                                          d.nama, l.fase, l.kalori, l.protein_g, l.lemak_g, l.karbo_g,
                                                          l.sat_fat_g, l.target_kalori, l.target_asli_kalori,
                                                          l.target_protein_g, l.target_lemak_g, l.batas_sat_fat_g, l.catatan)
                                        order by l.tanggal)
                         from public.daily_logs l left join public.day_types d on d.id = l.day_type_id
                        where l.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'makanan', 'label', 'entri makanan',
    'kolom', jsonb_build_array('tanggal', 'dicatat_pada', 'nama_makanan', 'kalori_kcal', 'protein_g', 'lemak_g',
                               'karbo_g', 'sat_fat_g', 'sumber'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(l.tanggal, m.created_at, m.nama_makanan, m.kalori, m.protein_g,
                                                          m.lemak_g, m.karbo_g, m.sat_fat_g, m.sumber)
                                        order by l.tanggal, m.created_at)
                         from public.food_logs m join public.daily_logs l on l.id = m.daily_log_id
                        where m.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'ukuran_tubuh', 'label', 'pengukuran tubuh',
    'kolom', jsonb_build_array('tanggal', 'pinggang_cm', 'dada_cm', 'leher_cm', 'lengan_kiri_cm', 'lengan_kanan_cm',
                               'paha_kiri_cm', 'paha_kanan_cm', 'catatan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(b.tanggal, b.pinggang_cm, b.dada_cm, b.leher_cm, b.lengan_kiri_cm,
                                                          b.lengan_kanan_cm, b.paha_kiri_cm, b.paha_kanan_cm, b.catatan)
                                        order by b.tanggal)
                         from public.body_measurements b where b.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'sesi_latihan', 'label', 'sesi latihan',
    'kolom', jsonb_build_array('tanggal', 'mulai', 'sesi', 'jenis', 'sumber', 'durasi_menit'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(w.tanggal, w.waktu_mulai, w.nama, w.jenis, w.sumber, w.durasi_menit)
                                        order by w.tanggal, w.waktu_mulai)
                         from public.workouts w where w.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'latihan', 'label', 'set latihan',
    'kolom', jsonb_build_array('mulai', 'sesi', 'durasi_menit', 'latihan', 'set_ke', 'jenis_set', 'beban_kg', 'reps'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(coalesce(w.waktu_mulai::text, w.tanggal::text), w.nama,
                                                          w.durasi_menit, s.latihan, s.set_ke, s.jenis_set, s.beban_kg, s.reps)
                                        order by w.tanggal, w.waktu_mulai, s.latihan_ke, s.set_ke)
                         from public.workout_sets s join public.workouts w on w.id = s.workout_id
                        where s.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'data_kesehatan', 'label', 'data tersinkron',
    'kolom', jsonb_build_array('tanggal', 'sumber', 'asal', 'jenis', 'nilai', 'satuan', 'waktu_mulai', 'waktu_selesai'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(h.tanggal, h.sumber, h.asal, h.jenis, h.nilai, h.satuan,
                                                          h.waktu_mulai, h.waktu_selesai)
                                        order by h.tanggal, h.waktu_mulai, h.jenis)
                         from public.health_data h where h.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'sumber_data', 'label', 'sumber data',
    'kolom', jsonb_build_array('sumber', 'mekanisme', 'status', 'akun_eksternal', 'terhubung_pada', 'diputus_pada',
                               'sinkron_terakhir'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(c.sumber, c.mekanisme, c.status, c.akun_eksternal,
                                                          c.terhubung_pada, c.diputus_pada, c.sinkron_terakhir)
                                        order by c.sumber)
                         from public.health_connections c where c.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'prioritas_sumber', 'label', 'prioritas sumber',
    'kolom', jsonb_build_array('olahraga', 'sumber', 'urutan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(sp.olahraga, sp.sumber, sp.rank) order by sp.olahraga, sp.rank)
                         from public.source_priority sp where sp.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'redistribusi', 'label', 'redistribusi mingguan',
    'kolom', jsonb_build_array('minggu_mulai', 'opsi', 'perlu_dipindah_kcal', 'terserap_kcal', 'tersisa_kcal',
                               'dibatasi_lantai', 'alasan', 'dibuat_pada'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(r.minggu_mulai, r.opsi, r.perlu_dipindah, r.terserap, r.tersisa,
                                                          r.dibatasi_lantai, r.alasan, r.created_at)
                                        order by r.minggu_mulai, r.created_at)
                         from public.redistribusi_mingguan r where r.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'redistribusi_hari', 'label', 'hari yang diredistribusi',
    'kolom', jsonb_build_array('minggu_mulai', 'tanggal', 'target_lama_kcal', 'target_baru_kcal', 'kena_lantai'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(r.minggu_mulai, h.tanggal, h.target_lama, h.target_baru, h.kena_lantai)
                                        order by r.minggu_mulai, h.tanggal)
                         from public.redistribusi_hari h join public.redistribusi_mingguan r on r.id = h.redistribusi_id
                        where h.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'percakapan_coach', 'label', 'pesan coach',
    'kolom', jsonb_build_array('percakapan', 'waktu', 'peran', 'teks'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(pc.judul, m.waktu, m.peran, m.teks)
                                        order by pc.created_at, m.urutan)
                         from public.pesan_coach m join public.percakapan pc on pc.id = m.percakapan_id
                        where m.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'ringkasan_mingguan', 'label', 'ringkasan mingguan',
    'kolom', jsonb_build_array('periode_dari', 'periode_sampai', 'bacaan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(r.periode_dari, r.periode_sampai, r.bacaan) order by r.periode_dari)
                         from public.ringkasan_mingguan r where r.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'evaluasi_4_mingguan', 'label', 'evaluasi 4 mingguan',
    'kolom', jsonb_build_array('periode_dari', 'periode_sampai', 'fase', 'arah_berat', 'arah_pinggang', 'arah_kekuatan',
                               'pekan_data', 'judul', 'ringkas', 'rekomendasi', 'keyakinan'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(e.periode_dari, e.periode_sampai, e.fase, e.arah_berat,
                                                          e.arah_pinggang, e.arah_kekuatan, e.pekan_data, e.judul,
                                                          e.ringkas, e.rekomendasi, e.keyakinan)
                                        order by e.periode_dari)
                         from public.evaluasi_periodik e where e.user_id = u), '[]'::jsonb));

  v := v || jsonb_build_object('nama', 'preferensi_notifikasi', 'label', 'preferensi notifikasi',
    'kolom', jsonb_build_array('timbang_aktif', 'jam_timbang', 'jam_timbang_akhir_pekan', 'ukuran_aktif',
                               'ringkasan_aktif', 'evaluasi_aktif', 'sumber_aktif', 'widget_aktif'),
    'baris', coalesce((select jsonb_agg(jsonb_build_array(s.timbang_aktif, s.jam_timbang, s.jam_timbang_akhir_pekan,
                                                          s.ukuran_aktif, s.ringkasan_aktif, s.evaluasi_aktif,
                                                          s.sumber_aktif, s.widget_aktif))
                         from public.settings_notifications s where s.user_id = u), '[]'::jsonb));

  return jsonb_build_object('dibuat_pada', now(), 'tabel', v);
end;
$$;

comment on function public.ekspor_data_saya() is
  'Seluruh data milik pengguna sebagai daftar tabel (nama, label, kolom, baris) untuk ekspor ZIP di app.';

create or replace function public.ringkas_ekspor_data_saya()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  u uuid := (select auth.uid());
begin
  if u is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  return jsonb_build_array(
    jsonb_build_object('nama', 'profil', 'label', 'profil',
      'jumlah', (select count(*) from public.profiles where user_id = u)),
    jsonb_build_object('nama', 'riwayat_fase', 'label', 'periode fase',
      'jumlah', (select count(*) from public.fase_periode where user_id = u)),
    jsonb_build_object('nama', 'tipe_hari', 'label', 'tipe hari',
      'jumlah', (select count(*) from public.day_types where user_id = u)),
    jsonb_build_object('nama', 'target_tipe_hari', 'label', 'target tipe hari',
      'jumlah', (select count(*) from public.day_type_targets where user_id = u)),
    jsonb_build_object('nama', 'catatan_harian', 'label', 'hari tercatat',
      'jumlah', (select count(*) from public.daily_logs where user_id = u)),
    jsonb_build_object('nama', 'makanan', 'label', 'entri makanan',
      'jumlah', (select count(*) from public.food_logs where user_id = u)),
    jsonb_build_object('nama', 'ukuran_tubuh', 'label', 'pengukuran tubuh',
      'jumlah', (select count(*) from public.body_measurements where user_id = u)),
    jsonb_build_object('nama', 'sesi_latihan', 'label', 'sesi latihan',
      'jumlah', (select count(*) from public.workouts where user_id = u)),
    jsonb_build_object('nama', 'latihan', 'label', 'set latihan',
      'jumlah', (select count(*) from public.workout_sets where user_id = u)),
    jsonb_build_object('nama', 'data_kesehatan', 'label', 'data tersinkron',
      'jumlah', (select count(*) from public.health_data where user_id = u)),
    jsonb_build_object('nama', 'sumber_data', 'label', 'sumber data',
      'jumlah', (select count(*) from public.health_connections where user_id = u)),
    jsonb_build_object('nama', 'prioritas_sumber', 'label', 'prioritas sumber',
      'jumlah', (select count(*) from public.source_priority where user_id = u)),
    jsonb_build_object('nama', 'redistribusi', 'label', 'redistribusi mingguan',
      'jumlah', (select count(*) from public.redistribusi_mingguan where user_id = u)),
    jsonb_build_object('nama', 'redistribusi_hari', 'label', 'hari yang diredistribusi',
      'jumlah', (select count(*) from public.redistribusi_hari where user_id = u)),
    jsonb_build_object('nama', 'percakapan_coach', 'label', 'pesan coach',
      'jumlah', (select count(*) from public.pesan_coach where user_id = u)),
    jsonb_build_object('nama', 'ringkasan_mingguan', 'label', 'ringkasan mingguan',
      'jumlah', (select count(*) from public.ringkasan_mingguan where user_id = u)),
    jsonb_build_object('nama', 'evaluasi_4_mingguan', 'label', 'evaluasi 4 mingguan',
      'jumlah', (select count(*) from public.evaluasi_periodik where user_id = u)),
    jsonb_build_object('nama', 'preferensi_notifikasi', 'label', 'preferensi notifikasi',
      'jumlah', (select count(*) from public.settings_notifications where user_id = u))
  );
end;
$$;

comment on function public.ringkas_ekspor_data_saya() is
  'Hitungan baris per tabel ekspor, untuk memperlihatkan isi ekspor sebelum berkasnya disiapkan.';

-- --- Hak akses -------------------------------------------------------------
revoke all on function public.ekspor_data_saya() from public;
revoke all on function public.ringkas_ekspor_data_saya() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.ekspor_data_saya() from anon';
    execute 'revoke all on function public.ringkas_ekspor_data_saya() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ekspor_data_saya() to authenticated';
    execute 'grant execute on function public.ringkas_ekspor_data_saya() to authenticated';
  end if;
end $$;
