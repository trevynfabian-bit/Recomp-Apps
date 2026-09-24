# Akun & Sesi: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar masuk dengan data tiruan | Masuk dengan email & sandi (akun yang sama dengan web), tampilkan/sembunyikan sandi, lupa sandi, galat Supabase dalam bahasa sehari-hari; mode tiruan tanpa kredensial | `app/masuk.tsx` (`Isian` email & sandi, `TombolIkon` mata, `Tombol` Masuk memproses, tautan Lupa kata sandi), `useSesi` (`masuk`, `kirimAturUlangSandi`), sesi tiruan | `cek:akun` (validasi email, pemetaan galat Auth, nada pesan, perlindungan layar) | **Diperbaiki:** email berformat salah membuat tombol Masuk nonaktif tanpa alasan; kini setelah kolom ditinggalkan muncul galat kolom "Format email belum benar, mis. nama@contoh.id." yang hilang saat diperbaiki. Diuji di web, lalu masuk dengan data tiruan berhasil. |
