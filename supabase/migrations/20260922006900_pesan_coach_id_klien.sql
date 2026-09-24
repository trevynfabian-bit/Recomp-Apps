-- =============================================================================
-- pesan_coach.id_klien: kirim ulang pertanyaan tanpa dobel
--
-- Sinyal yang putus di tengah jalan membuat app tidak tahu apakah
-- pertanyaannya sudah sampai. Mengirim ulang TANPA penanda membuat pertanyaan
-- yang sama tersimpan dua kali, dijawab dua kali (dua kali bayar model), dan
-- menghabiskan dua jatah kuota harian. Dengan `id_klien` (dibuat app sekali
-- per pertanyaan, dipakai ulang saat mencoba lagi) coach-chat mengenali
-- kiriman ulang: jawaban yang sudah ada dikembalikan apa adanya, pertanyaan
-- yang masih diproses dijawab "tunggu", dan pertanyaan yang tertinggal tanpa
-- jawaban dijawab tanpa disimpan ulang. Unik per pengguna. Aman dijalankan ulang.
-- =============================================================================

alter table public.pesan_coach add column if not exists id_klien uuid;

comment on column public.pesan_coach.id_klien is
  'Penanda kiriman dari app (sekali per pertanyaan, dipakai ulang saat mencoba lagi); unik per pengguna.';

create unique index if not exists pesan_coach_id_klien_unik
  on public.pesan_coach (user_id, id_klien)
  where id_klien is not null;
