# Paritas Logika & Basis Data: verifikasi

Aturan domain dihitung di dua tempat: `@recomp/logika` (UI, sama dengan web)
dan Supabase PostgreSQL (widget, RPC, batasan tabel). Penjaganya
`npm run cek:paritas` (`scripts/cek-paritas-makro.mjs`), yang menjalankan kasus
uji yang sama di kedua sisi dan membandingkan hasilnya.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Buat halaman laporan paritas data tiruan | Hasil paritas terbaca per aturan tanpa membaca keluaran terminal: berapa aturan sama atau berbeda, contoh selisih pertama, kapan dan di commit mana dijalankan, serta keadaan "belum pernah dijalankan" | **Baru:** `app/paritas.tsx` (build pengembangan, dibuka dari Setelan di bawah Peraga komponen; ringkasan `StatusProses`, daftar per area, contoh selisih, `KeadaanKosong` saat belum jalan, pemilih contoh keadaan), `src/mocks/paritas.ts` (18 pasangan TS ↔ SQL yang benar-benar dibandingkan `cek:paritas`; hanya hasil jalannya yang tiruan), rute di `RUTE_TUMPUKAN`, induk kembali di `src/lib/kembali.ts`, `docs/desain/peta-navigasi.md` | `cek:desain` (header, navigasi & induk kembali, komponen bersama), `cek:kontras`, `cek:akun` (rute terlindung sesi) | Halaman sebelumnya tidak ada. Diuji di web pada ketiga keadaan (ada selisih, semua sama, belum jalan), skema gelap & terang. Setiap baris dibacakan sebagai satu kalimat: aturan, sama/berbeda, jumlah kasus, nama fungsi di kedua sisi, dan selisihnya. |
