-- ---------------------------------------------------------------------------
-- RPC: simpan & hapus pencatatan ukuran tubuh.
--
-- Ditulis sebagai fungsi database, bukan UPSERT dari klien, dengan alasan yang
-- sama seperti `simpan_berat_pagi`: satu tanggal adalah SATU baris, dan UPSERT
-- dari klien akan menimpa kolom yang tidak ikut dikirim dengan NULL. Pada tabel
-- ini akibatnya lebih buruk daripada di `daily_logs` — pengguna yang pekan ini
-- hanya mengukur pinggang akan MENGHAPUS dada, leher, lengan, dan paha yang
-- ia catat pekan lalu di tanggal yang sama.
--
-- Karena itu aturannya: NULL berarti "jangan ubah", bukan "kosongkan".
-- Konsekuensinya harus dinyatakan: satu bagian tubuh tidak bisa dikosongkan
-- lewat fungsi ini. Itu disengaja — memperbaiki salah ketik berarti mengetik
-- angka yang benar, bukan mengosongkannya, dan pencatatan yang seluruhnya salah
-- dihapus lewat `hapus_ukuran`. Menyediakan "kosongkan satu bagian" sebagai
-- NULL akan membuat setiap pemanggil yang lupa mengirim satu field menghapus
-- data tanpa sadar — persis bahaya yang fungsi ini ada untuk mencegah.
--
-- `catatan` punya pengecualian yang jelas: string KOSONG mengosongkannya.
-- Catatan memang wajar dihapus, dan teks kosong tidak bisa disalahartikan
-- sebagai angka yang terlupa.
--
-- Tanggal MASA DEPAN ditolak di sini, bukan di layar: jam perangkat bisa salah
-- atau digeser, dan satu pencatatan bertanggal depan akan duduk di ujung grafik
-- sebagai titik yang tidak pernah bisa dikoreksi oleh pencatatan berikutnya.
-- Seberapa JAUH ke belakang tanggal boleh digeser TIDAK dibatasi di sini:
-- membatasinya akan menghalangi pengisian riwayat lama, dan itu keputusan
-- tampilan, bukan keputusan data.
-- ---------------------------------------------------------------------------

create or replace function public.simpan_ukuran(
  p_tanggal date default null,
  p_pinggang_cm numeric default null,
  p_dada_cm numeric default null,
  p_leher_cm numeric default null,
  p_lengan_kiri_cm numeric default null,
  p_lengan_kanan_cm numeric default null,
  p_paha_kiri_cm numeric default null,
  p_paha_kanan_cm numeric default null,
  p_catatan text default null
)
returns public.body_measurements
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tanggal date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
  v_baris public.body_measurements;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;

  if v_tanggal > v_hari_ini then
    raise exception 'Tanggal % masih di masa depan', v_tanggal using errcode = '22007';
  end if;

  -- Batasnya sama dengan CHECK di tabel; diperiksa di sini supaya pesannya
  -- menyebut BAGIAN TUBUH yang salah, bukan nama constraint.
  perform public.periksa_ukuran_bagian('Pinggang', p_pinggang_cm, 50, 160);
  perform public.periksa_ukuran_bagian('Dada', p_dada_cm, 60, 170);
  perform public.periksa_ukuran_bagian('Leher', p_leher_cm, 25, 60);
  perform public.periksa_ukuran_bagian('Lengan kiri', p_lengan_kiri_cm, 18, 60);
  perform public.periksa_ukuran_bagian('Lengan kanan', p_lengan_kanan_cm, 18, 60);
  perform public.periksa_ukuran_bagian('Paha kiri', p_paha_kiri_cm, 30, 95);
  perform public.periksa_ukuran_bagian('Paha kanan', p_paha_kanan_cm, 30, 95);

  if p_catatan is not null and char_length(p_catatan) > 500 then
    raise exception 'Catatan terlalu panjang (maksimal 500 karakter)' using errcode = '23514';
  end if;

  -- Baris yang SUDAH ada diperbarui langsung, bukan lewat ON CONFLICT.
  -- Alasannya bukan gaya: `INSERT … ON CONFLICT DO UPDATE` memeriksa CHECK
  -- tabel terhadap baris yang DIUSULKAN sebelum benturannya terdeteksi, jadi
  -- panggilan yang seluruhnya NULL — yang di sini artinya "jangan ubah apa
  -- pun" — akan ditolak `ukuran_ada_isinya` walaupun barisnya sudah berisi.
  update public.body_measurements
     set pinggang_cm     = coalesce(round(p_pinggang_cm, 1), pinggang_cm),
         dada_cm         = coalesce(round(p_dada_cm, 1), dada_cm),
         leher_cm        = coalesce(round(p_leher_cm, 1), leher_cm),
         lengan_kiri_cm  = coalesce(round(p_lengan_kiri_cm, 1), lengan_kiri_cm),
         lengan_kanan_cm = coalesce(round(p_lengan_kanan_cm, 1), lengan_kanan_cm),
         paha_kiri_cm    = coalesce(round(p_paha_kiri_cm, 1), paha_kiri_cm),
         paha_kanan_cm   = coalesce(round(p_paha_kanan_cm, 1), paha_kanan_cm),
         -- Catatan: string kosong MENGOSONGKAN, null berarti jangan ubah.
         catatan = case
                     when p_catatan = '' then null
                     when p_catatan is null then catatan
                     else p_catatan
                   end
   where user_id = v_user_id and tanggal = v_tanggal
  returning * into v_baris;

  if v_baris.id is not null then
    return v_baris;
  end if;

  -- Pencatatan BARU harus membawa setidaknya satu ukuran. Tanpa penjagaan ini,
  -- pesannya datang dari CHECK tabel dan tidak bisa dibaca pengguna.
  if num_nonnulls(
       p_pinggang_cm, p_dada_cm, p_leher_cm,
       p_lengan_kiri_cm, p_lengan_kanan_cm, p_paha_kiri_cm, p_paha_kanan_cm
     ) = 0 then
    raise exception 'Pencatatan baru harus memuat setidaknya satu ukuran'
      using errcode = '22004';
  end if;

  insert into public.body_measurements (
    user_id, tanggal, pinggang_cm, dada_cm, leher_cm,
    lengan_kiri_cm, lengan_kanan_cm, paha_kiri_cm, paha_kanan_cm, catatan
  )
  values (
    v_user_id, v_tanggal,
    round(p_pinggang_cm, 1), round(p_dada_cm, 1), round(p_leher_cm, 1),
    round(p_lengan_kiri_cm, 1), round(p_lengan_kanan_cm, 1),
    round(p_paha_kiri_cm, 1), round(p_paha_kanan_cm, 1),
    nullif(p_catatan, '')
  )
  returning * into v_baris;

  return v_baris;
end;
$$;

comment on function public.simpan_ukuran(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) is
  'Menyimpan pencatatan ukuran tubuh untuk satu tanggal. NULL berarti "jangan '
  'ubah", sehingga mengukur satu bagian saja tidak menghapus bagian lain di '
  'tanggal itu. Tanggal masa depan ditolak. RLS tetap berlaku.';

-- --- Pembantu pemeriksaan rentang -----------------------------------------
-- Dipisah supaya tujuh pemeriksaan di atas tidak jadi tujuh blok yang sama.
create or replace function public.periksa_ukuran_bagian(
  p_nama text,
  p_nilai numeric,
  p_min numeric,
  p_maks numeric
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_nilai is null then return; end if;
  if p_nilai < p_min or p_nilai > p_maks then
    raise exception '% % cm di luar rentang wajar (%–% cm)', p_nama, p_nilai, p_min, p_maks
      using errcode = '22003';
  end if;
end;
$$;

comment on function public.periksa_ukuran_bagian(text, numeric, numeric, numeric) is
  'Memeriksa satu ukuran terhadap rentangnya; pesannya menyebut nama bagian '
  'tubuh, bukan nama constraint.';

-- ---------------------------------------------------------------------------
-- Hapus satu pencatatan.
--
-- Pasangan yang diperlukan oleh aturan "NULL berarti jangan ubah": pencatatan
-- yang seluruhnya salah dibatalkan dengan menghapusnya, bukan dengan
-- mengosongkan tujuh kolomnya satu per satu.
-- ---------------------------------------------------------------------------
create or replace function public.hapus_ukuran(p_tanggal date)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_jumlah integer;
begin
  if v_user_id is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if p_tanggal is null then
    raise exception 'Tanggal tidak boleh kosong' using errcode = '22004';
  end if;

  delete from public.body_measurements
   where user_id = v_user_id and tanggal = p_tanggal;
  get diagnostics v_jumlah = row_count;

  -- false berarti tidak ada yang dihapus; itu bukan kesalahan, tapi pemanggil
  -- perlu tahu bedanya supaya tidak melaporkan keberhasilan yang tidak terjadi.
  return v_jumlah > 0;
end;
$$;

comment on function public.hapus_ukuran(date) is
  'Menghapus pencatatan ukuran di satu tanggal. false bila tidak ada yang '
  'dihapus. RLS tetap berlaku, jadi pencatatan orang lain tidak tersentuh.';

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on function public.periksa_ukuran_bagian(text, numeric, numeric, numeric) from public;
revoke all on function public.simpan_ukuran(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public;
revoke all on function public.hapus_ukuran(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.periksa_ukuran_bagian(text, numeric, numeric, numeric) to authenticated';
    execute 'grant execute on function public.simpan_ukuran(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated';
    execute 'grant execute on function public.hapus_ukuran(date) to authenticated';
  end if;
end $$;
