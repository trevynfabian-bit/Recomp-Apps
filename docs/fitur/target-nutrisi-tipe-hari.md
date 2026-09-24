# Target Nutrisi & Tipe Hari: verifikasi

Fitur ini sudah berjalan sebelum rombak desain (PRD §3, "Kemampuan Fungsional
yang Sudah Berjalan"). Task di halaman ini dikerjakan sebagai **verifikasi**:
setiap kebutuhan dicocokkan dengan kode yang ada dan penjaganya. Kode hanya
diubah bila ada celah, dan perubahannya dicatat di kolom terakhir.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Bangun layar utama target nutrisi harian | Target kalori & makro hari ini menurut fase aktif dan tipe hari berlaku; semua target per tipe hari × fase bisa dilihat dan disunting | `app/target-harian.tsx` (hero "Target kalori hari ini" + protein, lemak, sat fat; pemilih tipe hari; fase aktif; tampilan per fase/matriks; sunting per baris dan semua), `app/(tabs)/index.tsx` (sisa kalori & makro hari ini), `src/state/target.tsx` (satu sumber untuk semua layar, cadangan luring) | `cek:target` (batas & aturan isian sama dengan database), `cek:paritas` (`targetBerlaku` = RPC `ambil_target_harian`), `cek:desain` (satu angka hero, `HeroPengganti` saat belum diisi) | Tidak ada celah fungsional. Tampilan diselaraskan di Fase 5 (`PilihanSegmen`, `Chip`, `HeroPengganti`). |
