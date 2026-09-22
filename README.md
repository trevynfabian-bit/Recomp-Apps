# Recomp Coach

Aplikasi iOS pribadi untuk body recomposition: satu sumber kebenaran untuk berat,
makro, ukuran tubuh, dan recovery, plus AI coach yang membaca seluruh data.
Menggantikan alur export CSV → Excel → upload manual.

## Stack

- **Mobile:** React Native + Expo (SDK 57), TypeScript, expo-router
- **Backend:** Supabase yang **sudah ada** (Postgres + Auth + RLS) — tidak membangun backend baru
- **Logika hitungan:** paket TypeScript bersama dengan web dashboard Next.js
- **Rilis:** iOS via TestFlight. Android & fitur sosial di luar cakupan V1.

## Menjalankan

```bash
npm install
npm start          # lalu scan QR dengan Expo Go di iPhone
npm run ios        # simulator (butuh macOS)
npm run web        # pratinjau cepat di browser
npm run typecheck  # tsc --noEmit
```

## Struktur

```
app/                 rute expo-router
  _layout.tsx        root stack + status bar
  (tabs)/            tab bar: Hari Ini, Tren, Coach, Pengaturan
    index.tsx        layar utama Log Harian
src/
  components/        komponen UI bersama (Card, HeroNumber, MacroRow, Pill, …)
  lib/format.ts      format angka/tanggal Indonesia + helper Asia/Jakarta
  mocks/             DATA TIRUAN untuk Fase 1 frontend
  theme/             palet warna, spasi, radius, tipografi
  types/domain.ts    tipe domain mengikuti skema Supabase di PRD
```

## Database (Supabase)

Migrasi ada di `supabase/migrations/` dan dijalankan di proyek Supabase yang
**sudah ada** (dipakai bersama web Next.js) — bukan proyek baru. Semua objek
dibuat dengan `IF NOT EXISTS` sehingga aman dijalankan ulang di database yang
sudah berisi tabel milik web.

```bash
npm run db:cek   # jalankan migrasi di Postgres lokal bersih + uji RLS
```

Skrip itu menyiapkan Postgres kosong, memasang tiruan `auth.users`/`auth.uid()`
(hanya untuk uji lokal, tidak pernah dipakai di Supabase asli), menjalankan
migrasi **dua kali** untuk membuktikan idempoten, lalu menjalankan uji RLS yang
memeriksa dua pengguna tidak bisa saling melihat atau mengubah data. Keluar
dengan kode bukan-nol bila ada yang gagal, jadi bisa dipakai di CI.

## Status

**Fase 1 — frontend** sedang dikerjakan di atas **data tiruan** (`src/mocks/`).
Query Supabase asli dipasang pada task layer backend; komponen tidak perlu berubah
karena bentuk data tiruan sudah meniru baris tabel sebenarnya.

## Prinsip desain

Dark mode, nuansa athlete dashboard ala WHOOP. Palet: `#14151A` latar, `#2A2D36`
kartu, aksen amber `#F0A202`, coral `#E24E1B`, jade `#1B998B` — biru standar
dihindari. Satu angka utama per layar, log berat maksimal 2 tap.

**Aturan warna (kontras):** nilai aksen di PRD dipakai apa adanya untuk ISIAN
besar (bar, tombol, pill). Sebagian di antaranya tidak lolos WCAG AA 4.5:1 untuk
TEKS KECIL di atas `surface`, jadi `src/theme/colors.ts` menyediakan
`aksenTeks` dan `macroTeks` — varian hue yang sama, sedikit lebih terang. Isian
pakai warna dasar, teks kecil pakai varian teks.

**Apple HIG:** konstanta di `src/theme/hig.ts`. Setiap kontrol memenuhi area
sentuh minimum 44×44 pt; angka hero dibatasi `MAKS_SKALA_HERO` agar tata letak
satu-angka-per-layar tidak pecah pada Dynamic Type ekstrem, sementara teks isi
tetap menskala penuh.
