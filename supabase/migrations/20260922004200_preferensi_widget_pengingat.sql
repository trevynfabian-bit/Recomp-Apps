-- ---------------------------------------------------------------------------
-- Preferensi widget & pengingat (settings_notifications).
--
-- Satu baris per pengguna. Bentuknya mengikuti layar Widget & pengingat dan
-- KATALOG_NOTIFIKASI di @recomp/logika — satu sakelar `<jenis>_aktif` per
-- jenis notifikasi, nilai bawaannya sama dengan `bawaan` di katalog (dijaga
-- `npm run cek:widget`).
--
-- Tiga keputusan yang dipegang database:
--   • `notif_netral` ada seperti di PRD, tapi SELALU true. Nada netral adalah
--     janji, bukan pengaturan — kolom yang bisa diset false hanya akan menjadi
--     jalan masuk bagi notifikasi yang menegur. CHECK menolak false.
--   • Jam timbang hanya pagi (04.00–11.00) dan kelipatan 15 menit, sama dengan
--     RENTANG_JAM_TIMBANG & LANGKAH_JAM_MENIT. Timbangan pukul 14.00 tidak
--     sebanding dengan timbangan pagi; pengingat jam segitu menghasilkan angka
--     yang merusak tren.
--   • `widget_aktif` = angka tampil di layar kunci. Mati berarti widget tetap
--     ada tanpa satu angka pun (layar kunci terbaca tanpa kunci dibuka).
-- ---------------------------------------------------------------------------

create table if not exists public.settings_notifications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timbang_aktif boolean not null default true,
  ukuran_aktif boolean not null default true,
  ringkasan_aktif boolean not null default true,
  evaluasi_aktif boolean not null default true,
  sumber_aktif boolean not null default true,
  jam_timbang time not null default '06:30',
  -- null = akhir pekan memakai jam hari kerja.
  jam_timbang_akhir_pekan time,
  widget_aktif boolean not null default true,
  notif_netral boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint settings_notifications_jam_pagi
    check (jam_timbang between time '04:00' and time '11:00'),
  constraint settings_notifications_jam_akhir_pekan_pagi
    check (jam_timbang_akhir_pekan is null or jam_timbang_akhir_pekan between time '04:00' and time '11:00'),
  constraint settings_notifications_jam_kelipatan
    check (extract(minute from jam_timbang)::integer % 15 = 0 and extract(second from jam_timbang) = 0),
  constraint settings_notifications_jam_akhir_pekan_kelipatan
    check (jam_timbang_akhir_pekan is null
           or (extract(minute from jam_timbang_akhir_pekan)::integer % 15 = 0
               and extract(second from jam_timbang_akhir_pekan) = 0)),
  constraint settings_notifications_selalu_netral check (notif_netral)
);

comment on table public.settings_notifications is
  'Preferensi widget & pengingat per pengguna. Sakelar per jenis mengikuti KATALOG_NOTIFIKASI.';
comment on column public.settings_notifications.notif_netral is
  'Selalu true: nada netral adalah janji, bukan pengaturan (PRD).';
comment on column public.settings_notifications.widget_aktif is
  'Angka tampil di widget layar kunci. Mati = widget tanpa angka.';

drop trigger if exists settings_notifications_set_updated_at on public.settings_notifications;
create trigger settings_notifications_set_updated_at
  before update on public.settings_notifications
  for each row execute function public.set_updated_at();

alter table public.settings_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'settings_notifications' and policyname = 'preferensi_milik_sendiri'
  ) then
    create policy preferensi_milik_sendiri on public.settings_notifications
      for all using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Tanpa DELETE: preferensi tidak "dihapus", hanya diubah.
    execute 'revoke all on public.settings_notifications from authenticated';
    execute 'grant select, insert, update on public.settings_notifications to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.settings_notifications from anon';
  end if;
end $$;

/**
 * Preferensi pengguna; baris bawaan dibuat saat pertama kali dibaca. Pengguna
 * yang tidak pernah membuka layar pengaturan tetap punya preferensi yang
 * jelas (semua bawaan), dan pembacaan kedua tidak menulis apa pun.
 */
create or replace function public.pengaturan_notifikasi()
returns public.settings_notifications
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_baris public.settings_notifications;
begin
  if v_user is null then
    raise exception 'Tidak ada sesi login' using errcode = '28000';
  end if;
  insert into public.settings_notifications (user_id) values (v_user)
  on conflict (user_id) do nothing;
  select * into v_baris from public.settings_notifications where user_id = v_user;
  return v_baris;
end;
$$;

revoke all on function public.pengaturan_notifikasi() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.pengaturan_notifikasi() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.pengaturan_notifikasi() to authenticated';
  end if;
end $$;

-- Perubahan dari perangkat lain (iPad, web) ikut ke perangkat ini, termasuk
-- widget yang harus berhenti menampilkan angka.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'settings_notifications') then
    alter publication supabase_realtime add table public.settings_notifications;
  end if;
end $$;
