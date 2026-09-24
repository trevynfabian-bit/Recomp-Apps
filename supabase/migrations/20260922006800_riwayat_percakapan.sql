-- =============================================================================
-- Endpoint riwayat percakapan coach
--
-- Daftar utas dan isi satu utas dibaca bertahap (kursor, bukan offset: utas
-- baru yang masuk di tengah jalan tidak menggeser halaman berikutnya), dalam
-- bentuk yang siap ditampilkan:
--   • `riwayat_percakapan_saya(sebelum, batas)` — utas terbaru dulu menurut
--     pesan terakhirnya, dengan jumlah pesan dan cuplikan pesan terakhir
--     (atau jenis kartunya bila pesan terakhir berupa kartu);
--   • `pesan_percakapan(percakapan, sebelum_urutan, batas)` — pesan satu utas
--     dalam urutan tulis (`urutan`, bukan waktu: dua pesan satu transaksi
--     punya waktu yang sama), halaman lebih lama lewat `sebelum_urutan`.
-- Keduanya INVOKER: RLS yang membatasi ke milik sendiri. Utas orang lain dan
-- utas yang tidak ada dijawab sama (P0002), tanpa membocorkan keberadaannya.
-- Aman dijalankan ulang.
-- =============================================================================

create or replace function public.riwayat_percakapan_saya(p_sebelum timestamptz default null, p_batas integer default 20)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_utas jsonb;
  v_batas integer := coalesce(p_batas, 20);
begin
  if (select auth.uid()) is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if v_batas < 1 or v_batas > 100 then
    raise exception 'Batas halaman harus 1–100; diminta %', v_batas using errcode = '22003';
  end if;

  select coalesce(jsonb_agg(u order by (u->>'diperbarui_pada')::timestamptz desc, u->>'id'), '[]'::jsonb)
    into v_utas
    from (
      select jsonb_build_object(
               'id', p.id,
               'judul', p.judul,
               'dibuat_pada', p.created_at,
               'diperbarui_pada', p.diperbarui_pada,
               'jumlah_pesan', (select count(*) from public.pesan_coach m where m.percakapan_id = p.id),
               'terakhir', (
                 select jsonb_build_object(
                          'peran', m.peran,
                          'cuplikan', case
                            when m.penolakan is not null then 'Batas medis'
                            when m.evaluasi is not null then 'Evaluasi 4 pekan'
                            when m.ringkasan is not null then 'Ringkasan mingguan'
                            else left(regexp_replace(m.teks, '\s+', ' ', 'g'), 120) end,
                          'waktu', m.waktu)
                   from public.pesan_coach m
                  where m.percakapan_id = p.id
                  order by m.urutan desc
                  limit 1)
             ) as u
        from public.percakapan p
       where p.user_id = (select auth.uid())
         and (p_sebelum is null or p.diperbarui_pada < p_sebelum)
       order by p.diperbarui_pada desc, p.id
       limit v_batas + 1
    ) x;

  return jsonb_build_object(
    'utas', (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(v_utas) with ordinality t (e, i) where i <= v_batas),
    -- Kursor halaman berikutnya: waktu utas terakhir di halaman ini; null bila habis.
    'berikutnya', case when jsonb_array_length(v_utas) > v_batas then v_utas -> (v_batas - 1) -> 'diperbarui_pada' end
  );
end;
$$;

create or replace function public.pesan_percakapan(
  p_percakapan uuid,
  p_sebelum_urutan bigint default null,
  p_batas integer default 50
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pesan jsonb;
  v_batas integer := coalesce(p_batas, 50);
  v_judul text;
begin
  if (select auth.uid()) is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  if v_batas < 1 or v_batas > 200 then
    raise exception 'Batas halaman harus 1–200; diminta %', v_batas using errcode = '22003';
  end if;
  select judul into v_judul from public.percakapan where id = p_percakapan and user_id = (select auth.uid());
  if v_judul is null then
    raise exception 'Percakapan tidak ditemukan' using errcode = 'P0002';
  end if;

  -- Halaman TERBARU lebih dulu diambil, lalu dikembalikan dalam urutan tulis.
  select coalesce(jsonb_agg(m order by (m->>'urutan')::bigint), '[]'::jsonb)
    into v_pesan
    from (
      select jsonb_build_object(
               'id', id, 'urutan', urutan, 'peran', peran, 'teks', teks, 'waktu', waktu,
               'rujukan', rujukan, 'widget', widget, 'ringkasan', ringkasan,
               'evaluasi', evaluasi, 'penolakan', penolakan) as m
        from public.pesan_coach
       where percakapan_id = p_percakapan
         and (p_sebelum_urutan is null or urutan < p_sebelum_urutan)
       order by urutan desc
       limit v_batas + 1
    ) x;

  return jsonb_build_object(
    'percakapan_id', p_percakapan,
    'judul', v_judul,
    -- Satu baris ekstra hanya penanda "masih ada yang lebih lama"; dibuang.
    'pesan', case when jsonb_array_length(v_pesan) > v_batas then v_pesan - 0 else v_pesan end,
    'lebih_lama', case when jsonb_array_length(v_pesan) > v_batas then (v_pesan -> 1 ->> 'urutan')::bigint end
  );
end;
$$;

comment on function public.riwayat_percakapan_saya(timestamptz, integer) is
  'Daftar utas coach milik pengguna, terbaru dulu, dengan cuplikan pesan terakhir; kursor `berikutnya`.';
comment on function public.pesan_percakapan(uuid, bigint, integer) is
  'Pesan satu utas milik pengguna dalam urutan tulis; kursor `lebih_lama` untuk halaman sebelumnya.';

revoke all on function public.riwayat_percakapan_saya(timestamptz, integer) from public, anon;
revoke all on function public.pesan_percakapan(uuid, bigint, integer) from public, anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.riwayat_percakapan_saya(timestamptz, integer) to authenticated';
    execute 'grant execute on function public.pesan_percakapan(uuid, bigint, integer) to authenticated';
  end if;
end $$;
