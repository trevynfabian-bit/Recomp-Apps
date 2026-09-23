-- ---------------------------------------------------------------------------
-- Estimasi persen lemak tubuh, metode US Navy (lingkar badan).
--
-- Kenapa metode ini: ia hanya butuh meteran kain — alat yang sudah dipakai
-- halaman ukuran setiap pekan — sementara DXA, BodPod, dan timbangan BIA
-- masing-masing butuh alat atau biaya yang tidak masuk akal untuk dipantau
-- mingguan.
--
-- Harganya dinyatakan terang-terangan, di sini dan di layar: ini ESTIMASI,
-- bukan pengukuran. Galat bakunya terhadap DXA sekitar ±4 poin persentase pada
-- individu, jadi 18% bisa saja 14% atau 22% pada tubuh yang sama. Yang jauh
-- lebih bisa dipercaya adalah ARAHNYA dari pekan ke pekan, karena galat yang
-- sama ikut terbawa di setiap pengukuran dan sebagian besar saling meniadakan
-- saat dibandingkan dengan diri sendiri. Karena itu fungsi ini SELALU
-- mengembalikan rentang, tidak pernah satu angka telanjang.
--
-- Ada di SQL, bukan hanya di TypeScript, karena AI coach membaca persen lemak
-- lewat function calling dan widget membacanya tanpa bisa menjalankan TS.
-- Aturannya harus sama persis dengan `estimasiBodyFatNavy` di @recomp/logika,
-- dan kesamaannya dijaga mesin lewat `npm run cek:paritas`.
--
-- Perhitungannya memakai float8, bukan numeric: rumusnya memuat logaritma
-- basis 10 dan pembagian berantai, dan presisi numeric Postgres akan menyimpang
-- dari JavaScript pada desimal yang justru ditampilkan.
-- ---------------------------------------------------------------------------

/** Galat baku metode Navy terhadap DXA, dalam POIN PERSENTASE. */
create or replace function public.ketidakpastian_bf()
returns integer
language sql
immutable
set search_path = ''
as $$ select 4; $$;

/**
 * Rumus Navy versi metrik. NULL HANYA bila argumen logaritmanya tidak sah
 * (lingkar pinggang ≤ leher); kewajaran hasilnya dinilai pemanggil supaya
 * alasan penolakannya bisa dibedakan.
 */
create or replace function public.nilai_body_fat_navy(
  p_jenis_kelamin text,
  p_tinggi_cm double precision,
  p_pinggang_cm double precision,
  p_leher_cm double precision,
  p_pinggul_cm double precision default null
)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_selisih double precision;
  v_hasil double precision;
begin
  if p_jenis_kelamin is null or p_tinggi_cm is null
     or p_pinggang_cm is null or p_leher_cm is null then
    return null;
  end if;

  if p_jenis_kelamin = 'pria' then
    v_selisih := p_pinggang_cm - p_leher_cm;
    if v_selisih <= 0 then return null; end if;
    v_hasil := 495 / (1.0324 - 0.19077 * log(v_selisih) + 0.15456 * log(p_tinggi_cm)) - 450;
  else
    v_selisih := p_pinggang_cm + coalesce(p_pinggul_cm, 0) - p_leher_cm;
    if v_selisih <= 0 then return null; end if;
    v_hasil := 495 / (1.29579 - 0.35004 * log(v_selisih) + 0.221 * log(p_tinggi_cm)) - 450;
  end if;

  -- Penyebut yang mendekati nol menghasilkan tak hingga, bukan angka.
  if v_hasil = 'Infinity'::double precision or v_hasil = '-Infinity'::double precision
     or v_hasil <> v_hasil then
    return null;
  end if;
  return v_hasil;
end;
$$;

comment on function public.nilai_body_fat_navy(text, double precision, double precision, double precision, double precision) is
  'Rumus Navy metrik, tanpa penilaian kewajaran. Sama dengan fungsi `hitung` '
  'di packages/logika/src/bodyFat.ts.';

-- ---------------------------------------------------------------------------
-- Estimasi lengkap untuk satu tanggal.
--
-- `kurang` adalah KODE, bukan kalimat — alasannya sama seperti di RPC lain:
-- kalimatnya memuat angka berformat Indonesia dan disusun @recomp/logika agar
-- formatnya satu. Satu kode hanya ada di sisi server, `catatan`: TypeScript
-- menerima lingkar pinggang & leher sebagai angka, jadi keadaan "belum pernah
-- mencatat ukuran sama sekali" tidak punya padanan di sana.
-- ---------------------------------------------------------------------------
create or replace function public.estimasi_body_fat(
  p_tanggal date default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sampai date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_profil public.profiles;
  v_ukuran public.body_measurements;
  v_ketidakpastian integer := public.ketidakpastian_bf();
  v_mentah double precision;
  v_naik double precision;
  v_persen double precision;
  v_berat double precision;
  v_lemak double precision;
  v_kurang text;
  v_masukan jsonb;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  select * into v_profil from public.profiles where user_id = v_user_id;

  -- Pencatatan TERAKHIR pada/sebelum tanggal acuan yang punya kedua lingkar
  -- yang dibutuhkan rumusnya. Pencatatan yang hanya berisi paha tidak membuat
  -- estimasi jadi mungkin, jadi ia dilewati alih-alih dipakai sebagian.
  select * into v_ukuran
    from public.body_measurements
   where user_id = v_user_id and tanggal <= v_sampai
     and pinggang_cm is not null and leher_cm is not null
   order by tanggal desc
   limit 1;

  v_masukan := jsonb_build_object(
    'tanggal_ukuran', v_ukuran.tanggal,
    'jenis_kelamin', v_profil.jenis_kelamin,
    'tinggi_cm', v_profil.tinggi_cm,
    'pinggang_cm', v_ukuran.pinggang_cm,
    'leher_cm', v_ukuran.leher_cm,
    -- App ini belum mencatat lingkar pinggul; lihat catatan di migrasi
    -- body_measurements. Dibawa di sini supaya bentuk masukannya utuh.
    'pinggul_cm', null
  );

  -- Urutan pemeriksaannya SENGAJA sama dengan di TypeScript: alasan pertama
  -- yang ditemukan itulah yang dilaporkan, dan menukar urutannya akan membuat
  -- pengguna diminta melengkapi hal yang salah.
  if v_ukuran.id is null then
    v_kurang := 'catatan';
  elsif v_profil.jenis_kelamin is null then
    v_kurang := 'jenis-kelamin';
  elsif v_profil.tinggi_cm is null or v_profil.tinggi_cm <= 0 then
    v_kurang := 'tinggi';
  elsif v_profil.jenis_kelamin = 'wanita' then
    -- Rumus versi wanita memakai lingkar pinggul, yang belum dicatat app ini.
    -- Menyodorkan rumus pria untuk semua orang akan menghasilkan angka yang
    -- kelihatan sah padahal salah sistematis.
    v_kurang := 'pinggul';
  end if;

  if v_kurang is null then
    v_mentah := public.nilai_body_fat_navy(
      v_profil.jenis_kelamin, v_profil.tinggi_cm::double precision,
      v_ukuran.pinggang_cm::double precision, v_ukuran.leher_cm::double precision, null);

    if v_mentah is null then
      v_kurang := 'ukuran';
    elsif v_mentah < 3 or v_mentah > 70 then
      -- Di bawah ~3% tubuh manusia tidak bisa hidup dan di atas ~70% tidak
      -- pernah terukur. Hasil di luar itu berarti salah ukur, bukan temuan.
      v_kurang := 'ukuran';
    end if;
  end if;

  if v_kurang is not null then
    return jsonb_build_object(
      'metode', 'Navy',
      'persen', null,
      'rentang', null,
      'ketidakpastian', v_ketidakpastian,
      'sensitivitas_pinggang', null,
      'kurang', v_kurang,
      'komposisi', null,
      'berat_kg', null,
      'masukan', v_masukan
    );
  end if;

  -- floor(x × 10 + 0,5) ÷ 10 — sama dengan Math.round di JavaScript.
  v_persen := floor(v_mentah * 10 + 0.5) / 10;

  -- Seberapa jauh estimasi bergeser bila meteran pinggang meleset 1 cm.
  -- Dihitung dari angka pengguna sendiri, bukan dikutip dari rata-rata, karena
  -- kepekaannya berbeda per ukuran tubuh.
  v_naik := public.nilai_body_fat_navy(
    v_profil.jenis_kelamin, v_profil.tinggi_cm::double precision,
    v_ukuran.pinggang_cm::double precision + 1, v_ukuran.leher_cm::double precision, null);

  -- Komposisi memakai RATA-RATA 7 HARI, bukan timbangan hari itu: memecah berat
  -- harian yang naik-turun karena air menjadi "massa lemak" akan menunjukkan
  -- perubahan komposisi yang tidak pernah terjadi.
  select r.rata_rata_kg::double precision into v_berat
    from public.rata_rata_berat_7_hari(v_sampai) as r;
  if v_berat is not null then
    -- Memakai persen yang SUDAH dibulatkan, bukan nilai mentahnya: itu angka
    -- yang dilihat pengguna, dan "18,2% dari 75 kg" yang menghasilkan massa
    -- lemak dari 18,23% akan terbaca sebagai aritmetika yang salah.
    v_lemak := floor((v_persen / 100 * v_berat) * 10 + 0.5) / 10;
  end if;

  return jsonb_build_object(
    'metode', 'Navy',
    'persen', v_persen,
    'rentang', jsonb_build_object(
      'bawah', floor(greatest(v_mentah - v_ketidakpastian, 0) * 10 + 0.5) / 10,
      'atas', floor((v_mentah + v_ketidakpastian) * 10 + 0.5) / 10
    ),
    'ketidakpastian', v_ketidakpastian,
    'sensitivitas_pinggang', case when v_naik is null then null
                                  else floor((v_naik - v_mentah) * 10 + 0.5) / 10 end,
    'kurang', null,
    'komposisi', case when v_berat is null then null
                      else jsonb_build_object(
                        'lemak_kg', v_lemak,
                        'bebas_lemak_kg', floor((v_berat - v_lemak) * 10 + 0.5) / 10
                      ) end,
    'berat_kg', v_berat,
    'masukan', v_masukan
  );
end;
$$;

comment on function public.estimasi_body_fat(date) is
  'Estimasi persen lemak Navy dari pencatatan ukuran terakhir pada/sebelum '
  'tanggal tersebut, selalu sebagai rentang. Angkanya identik dengan '
  'estimasiBodyFatNavy di @recomp/logika; kalimat penjelasnya disusun di sana.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.ketidakpastian_bf() from public;
revoke all on function public.nilai_body_fat_navy(text, double precision, double precision, double precision, double precision) from public;
revoke all on function public.estimasi_body_fat(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ketidakpastian_bf() to authenticated';
    execute 'grant execute on function public.nilai_body_fat_navy(text, double precision, double precision, double precision, double precision) to authenticated';
    execute 'grant execute on function public.estimasi_body_fat(date) to authenticated';
  end if;
end $$;
