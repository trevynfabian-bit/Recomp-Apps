# Akun & Sesi: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar masuk dengan data tiruan | Masuk dengan email & sandi (akun yang sama dengan web), tampilkan/sembunyikan sandi, lupa sandi, galat Supabase dalam bahasa sehari-hari; mode tiruan tanpa kredensial | `app/masuk.tsx` (`Isian` email & sandi, `TombolIkon` mata, `Tombol` Masuk memproses, tautan Lupa kata sandi), `useSesi` (`masuk`, `kirimAturUlangSandi`), sesi tiruan | `cek:akun` (validasi email, pemetaan galat Auth, nada pesan, perlindungan layar) | **Diperbaiki:** email berformat salah membuat tombol Masuk nonaktif tanpa alasan; kini setelah kolom ditinggalkan muncul galat kolom "Format email belum benar, mis. nama@contoh.id." yang hilang saat diperbaiki. Diuji di web, lalu masuk dengan data tiruan berhasil. |
| Tampilkan pesan galat login generik | Kredensial salah dijawab dengan satu pesan yang sama tanpa membocorkan apakah email terdaftar; galat lain (belum konfirmasi, nonaktif, batas percobaan, server, luring) tetap dalam bahasa sehari-hari | `PESAN_GAGAL_MASUK` di `@recomp/logika` (`akun.ts`), `KesalahanMasuk` di `useSesi`, `app/masuk.tsx` | `cek:akun` (pemetaan galat Auth ke kode, nada pesan) | **Diperbaiki:** galat kredensial hanya muncul sebagai teks di bawah tombol. Kini kedua kolom ditandai (email atau sandi, sengaja tidak menunjuk salah satu), fokus pindah ke sandi dengan teksnya terpilih untuk diketik ulang, dan tanda hilang begitu salah satu kolom diubah. Keenam kasus galat tiruan diuji di web; email terdaftar dan tidak terdaftar menghasilkan pesan yang sama. |
