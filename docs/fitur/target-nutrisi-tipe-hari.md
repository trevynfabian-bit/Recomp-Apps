# Target Nutrisi & Tipe Hari: verifikasi

Fitur ini sudah berjalan sebelum rombak desain (PRD §3, "Kemampuan Fungsional
yang Sudah Berjalan"). Task di halaman ini dikerjakan sebagai **verifikasi**:
setiap kebutuhan dicocokkan dengan kode yang ada dan penjaganya. Kode hanya
diubah bila ada celah, dan perubahannya dicatat di kolom terakhir.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar utama target nutrisi harian | Target kalori & makro hari ini menurut fase aktif dan tipe hari berlaku; semua target per tipe hari × fase bisa dilihat dan disunting | `app/target-harian.tsx` (hero "Target kalori hari ini" + protein, lemak, sat fat; pemilih tipe hari; fase aktif; tampilan per fase/matriks; sunting per baris dan semua), `app/(tabs)/index.tsx` (sisa kalori & makro hari ini), `src/state/target.tsx` (satu sumber untuk semua layar, cadangan luring) | `cek:target` (batas & aturan isian sama dengan database), `cek:paritas` (`targetBerlaku` = RPC `ambil_target_harian`), `cek:desain` (satu angka hero, `HeroPengganti` saat belum diisi) | Tidak ada celah fungsional. Tampilan diselaraskan di Fase 5 (`PilihanSegmen`, `Chip`, `HeroPengganti`). |
| Buat pemilih tipe hari dengan target dinamis | Memilih tipe hari mengganti target hari ini seketika; pilihan terbaca pembaca layar; kembali ke deteksi otomatis | `PemilihTipeHari` (Chip radio per tipe hari, rincian target tipe terpilih, "Kembalikan otomatis"), `src/state/hariIni.tsx` (`deteksiTipeHari`, `tipeHariBerlaku`) | `cek:target`, `cek:desain` (keadaan kontrol lewat `aria-*`) | Diuji di web: Beban+Lari 3.100 → Rest 2.450 → Padel 2.950 kcal. **Celah ditemukan & diperbaiki:** RN-web 0.21 mengabaikan `accessibilityState`, sehingga pilihan aktif tidak pernah diumumkan di web; 12 pemakaian diganti `aria-checked/selected/disabled/busy/expanded`, radio kini `aria-checked` (sebelumnya `selected`), dan `cek:desain` menolak `accessibilityState`. |
