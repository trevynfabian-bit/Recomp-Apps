-- ---------------------------------------------------------------------------
-- Endpoint gabungan layar Budget.
--
-- Nilai utamanya BUKAN kecepatan, melainkan konsistensi. Layar Budget memuat
-- angka-angka yang saling bergantung: sisa pekan, laju, tawaran redistribusi,
-- bukti proteksi protein, dan perbandingan target dengan TDEE. Kalau masing-
-- masing diambil lewat panggilan sendiri, satu catatan makan yang masuk di
-- antara dua panggilan menghasilkan layar yang angkanya tidak cocok satu sama
-- lain — sisa mengatakan satu hal, tawaran redistribusi mengatakan hal lain —
-- dan ketidakcocokan seperti itu tidak akan pernah bisa direproduksi saat
-- dilaporkan.
--
-- Endpoint ini TIDAK menghitung aturan baru. Ia menyusun jawaban dari fungsi
-- yang sudah ada dan sudah diuji, dalam satu transaksi. Dua hal yang sengaja
-- TIDAK dimasukkan:
--   • Rincian kumulatif (sisa berjalan hari demi hari). Ia turunan MURNI dari
--     `rincian` yang sudah ada di sini, jadi klien menghitungnya lewat
--     `rincianKumulatif` di @recomp/logika. Menaruhnya di SQL hanya menambah
--     satu aturan lagi yang harus dijaga paritasnya, tanpa menambah jaminan.
--   • Kalimat penjelas. Sama seperti di tempat lain: angka di sini, kalimat di
--     @recomp/logika, supaya formatnya satu.
--
-- Tawaran redistribusi yang disertakan adalah PRATINJAU `sebar_rata` — pilihan
-- yang paling sering dipakai. Ia tidak menulis apa pun; penerapan tetap
-- panggilan terpisah, karena PRD menuntut penerapan selalu keputusan pengguna.
-- ---------------------------------------------------------------------------

create or replace function public.endpoint_budget_mingguan(
  p_tanggal date default null,
  p_hari_ini date default null,
  p_ambang_kcal integer default 300,
  p_persen_lemak numeric default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hari_ini date;
  v_budget jsonb;
  v_senin date;
  v_tawaran jsonb;
  v_proteksi jsonb;
  v_tdee jsonb;
  v_target record;
  v_jejak public.redistribusi_mingguan;
  v_kuota_terpakai boolean;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  -- Hari ini ditentukan SEKALI lalu diteruskan ke semua bagian. Membiarkan
  -- tiap fungsi menentukannya sendiri membuka celah tepat di tengah malam
  -- Asia/Jakarta: satu bagian sudah hari baru, bagian lain belum.
  v_hari_ini := coalesce(p_hari_ini, (now() at time zone 'Asia/Jakarta')::date);

  v_budget := public.budget_mingguan(p_tanggal, v_hari_ini, p_ambang_kcal);
  v_senin := (v_budget->>'minggu_mulai')::date;

  v_tawaran := public.hitung_redistribusi(p_tanggal, 'sebar_rata', null, v_hari_ini);
  v_proteksi := public.proteksi_protein(p_tanggal, v_hari_ini);

  -- Kuota redistribusi pekan itu: sudah terpakai atau belum, beserta jejak
  -- terakhirnya. Tanpa ini, UI harus menebak — dan tebakannya baru terbukti
  -- salah setelah pengguna menekan tombolnya.
  select * into v_jejak
    from public.redistribusi_mingguan
   where user_id = v_user_id and minggu_mulai = v_senin
   order by created_at desc
   limit 1;
  v_kuota_terpakai := v_jejak.id is not null;

  -- TDEE diringkas: yang dibutuhkan layar Budget hanya rentangnya dan
  -- seberapa serius rentang itu boleh dipakai.
  v_tdee := public.estimasi_tdee(v_hari_ini, 14, p_persen_lemak);

  select * into v_target from public.ambil_target_harian(v_hari_ini);

  return jsonb_build_object(
    'hari_ini', v_hari_ini,
    'minggu_mulai', v_senin,
    'fase', public.fase_pada_tanggal(v_hari_ini),
    'budget', v_budget,
    'target_hari_ini', case
      when v_target.day_type_id is null then null
      else jsonb_build_object(
        'nama_tipe_hari', v_target.nama_tipe_hari,
        'fase', v_target.fase,
        'override', v_target.override,
        'target_kalori', v_target.target_kalori,
        'target_protein_g', v_target.target_protein_g,
        'target_lemak_g', v_target.target_lemak_g,
        'batas_sat_fat_g', v_target.batas_sat_fat_g
      )
    end,
    'redistribusi', jsonb_build_object(
      'kuota_terpakai', v_kuota_terpakai,
      'tawaran', v_tawaran,
      'penerapan_terakhir', case
        when v_jejak.id is null then null
        else jsonb_build_object(
          'id', v_jejak.id,
          'opsi', v_jejak.opsi,
          'perlu_dipindah', v_jejak.perlu_dipindah,
          'terserap', v_jejak.terserap,
          'tersisa', v_jejak.tersisa,
          'dibatasi_lantai', v_jejak.dibatasi_lantai,
          'alasan', v_jejak.alasan,
          'created_at', v_jejak.created_at
        )
      end
    ),
    'proteksi_protein', v_proteksi,
    'tdee', jsonb_build_object(
      'min', v_tdee->'min',
      'maks', v_tdee->'maks',
      'tengah', v_tdee->'tengah',
      'keyakinan', v_tdee->>'keyakinan',
      'hari_data', v_tdee->'masukan'->'hari_data',
      'hari_tercatat', v_tdee->'hari_tercatat'
    )
  );
end;
$$;

comment on function public.endpoint_budget_mingguan(date, date, integer, numeric) is
  'Satu snapshot untuk seluruh layar Budget: budget pekan, target hari ini, '
  'pratinjau redistribusi beserta kuotanya, bukti proteksi protein, dan '
  'ringkasan TDEE. Menyusun dari fungsi yang sudah ada, tanpa aturan baru.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.endpoint_budget_mingguan(date, date, integer, numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.endpoint_budget_mingguan(date, date, integer, numeric) to authenticated';
  end if;
end $$;
