-- =============================================================================
-- pesan_coach: tandai jawaban coach yang BENAR-BENAR ditulis server
--
-- Riwayat utas diputar ulang ke model sebagai giliran `assistant` untuk setiap
-- baris ber-peran 'coach'. Pengguna boleh menulis tabel ini lewat PostgREST
-- (pertanyaannya sendiri), dan tidak ada yang mencegahnya menulis baris
-- 'coach' atau mengubah teks jawaban lama. Akibatnya "coach pernah berkata X"
-- bisa dikarang sendiri, lalu dipakai model sebagai pegangan pada giliran
-- berikutnya: jalan pintas melewati batas medis yang hanya memeriksa pertanyaan
-- baru dan jawaban baru.
--
-- Kolom `ditulis_server` diisi pemicu, bukan pemanggil: benar hanya bila baris
-- disisipkan oleh service role (Edge Function coach-chat, ringkasan terjadwal).
-- Mengubah teks atau peran oleh selain service role menurunkannya menjadi
-- salah. coach-chat hanya memutar ulang jawaban coach yang `ditulis_server`.
-- Baris lama ditandai benar (ditulis sebelum aturan ini; tanpanya utas lama
-- kehilangan konteks jawabannya sendiri). Aman dijalankan ulang.
-- =============================================================================

alter table public.pesan_coach add column if not exists ditulis_server boolean not null default false;

comment on column public.pesan_coach.ditulis_server is
  'Benar bila baris disisipkan service role. Diisi pemicu; hanya jawaban coach yang ditulis_server diputar ulang ke model.';

do $$
begin
  -- Sekali saja: baris yang sudah ada sebelum kolom ini dipasang.
  if not exists (select 1 from pg_trigger where tgname = 'pesan_coach_tandai_penulis') then
    update public.pesan_coach set ditulis_server = true where peran = 'coach';
  end if;
end $$;

create or replace function public.tandai_penulis_pesan_coach()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.ditulis_server := current_user = 'service_role';
  elsif current_user <> 'service_role' then
    if (new.teks, new.peran, new.penolakan) is distinct from (old.teks, old.peran, old.penolakan) then
      new.ditulis_server := false;
    else
      new.ditulis_server := old.ditulis_server;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.tandai_penulis_pesan_coach() is
  'Pemicu: ditulis_server = sisipan oleh service role; suntingan isi oleh selain service role menurunkannya.';

revoke all on function public.tandai_penulis_pesan_coach() from public, anon, authenticated;

drop trigger if exists pesan_coach_tandai_penulis on public.pesan_coach;
create trigger pesan_coach_tandai_penulis
  before insert or update on public.pesan_coach
  for each row execute function public.tandai_penulis_pesan_coach();
