# AI Coach & Guardrail: verifikasi

Fitur yang sudah berjalan (PRD §3); task di sini adalah verifikasi terhadap kode
dan penjaganya, kode diubah hanya bila ada celah.

| Task | Kebutuhan | Diwujudkan di | Dijaga oleh | Celah & perubahan |
|---|---|---|---|---|
| Buat layar obrolan AI Coach dengan data tiruan | Obrolan dengan Coach: percakapan baru & riwayat, saran pertanyaan, keadaan mengetik, jawaban yang menyebut angka yang dipakai beserta sumbernya, pesan gagal dengan coba lagi; data tiruan tanpa server | `app/(tabs)/coach.tsx` (KeadaanKosong + saran `Chip`, `GelembungPesan`, `GelembungMengetik`, `InputChat`, `SheetRiwayatPercakapan`), `src/mocks/coach.ts` (`balasCoachStub` setelah `periksaBatasMedis`) | `cek:percakapan`, `cek:prompt`, `cek:medis` | Diuji di web: percakapan baru → kirim → "mengetik" → jawaban + kartu "Angka yang dipakai". **Diperbaiki:** balasan tiruan untuk pertanyaan protein dan lemak tubuh jatuh ke jawaban umum (padahal riwayat punya jawabannya); kini keduanya dijawab dengan angka & rujukan. Istilah "body fat" di teks Coach diganti "lemak tubuh". |
