# Recomp Coach

Aplikasi iOS pribadi untuk body recomposition: satu sumber kebenaran untuk berat,
makro, ukuran tubuh, dan recovery, plus AI coach yang membaca seluruh data.
Menggantikan alur export CSV → Excel → upload manual.

## Stack

- **Mobile:** React Native + Expo (SDK 57), TypeScript, expo-router
- **Backend:** Supabase yang **sudah ada** (Postgres + Auth + RLS) — tidak membangun backend baru
- **Logika hitungan:** paket TypeScript bersama `@recomp/logika` (lihat `packages/logika/`)
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
packages/logika/     LOGIKA BERSAMA dengan web Next.js (makro, deteksi tipe hari, format)
app/                 rute expo-router
  _layout.tsx        root stack + status bar
  (tabs)/            tab bar: Hari Ini, Tren, Coach, Pengaturan
    index.tsx        layar utama Log Harian
src/
  components/        komponen UI bersama (Card, HeroNumber, MacroRow, Pill, …)
  lib/format.ts      format angka/tanggal Indonesia + helper Asia/Jakarta
  mocks/             DATA TIRUAN untuk Fase 1 frontend
  theme/             palet warna, spasi, radius, tipografi
  data/              akses Supabase (RPC + query) per topik
  types/database.ts  tipe tabel & RPC, cocok dengan supabase/migrations/
  types/domain.ts    tipe khusus app; tipe bersama di-re-export dari @recomp/logika
supabase/
  migrations/        skema + RLS + RPC
  functions/         Edge Function (estimasi makanan dari foto)
  tests/             uji RLS & RPC yang dijalankan `npm run db:cek`
```

Paket bersama mengekspor **TypeScript sumber** — tidak ada langkah build dan
tidak ada artefak yang bisa basi, karena kedua konsumennya (Metro dan Next.js)
memang mem-bundle TypeScript. Repo web perlu satu baris:
`transpilePackages: ['@recomp/logika']` di `next.config.js`.

## Database (Supabase)

Migrasi ada di `supabase/migrations/` dan dijalankan di proyek Supabase yang
**sudah ada** (dipakai bersama web Next.js) — bukan proyek baru. Semua objek
dibuat dengan `IF NOT EXISTS` sehingga aman dijalankan ulang di database yang
sudah berisi tabel milik web.

```bash
npm run db:cek       # migrasi di Postgres lokal bersih + uji RLS/RPC
npm run cek:paritas  # buktikan aturan "sisa" di SQL dan TypeScript sama
npm run cek:db       # keduanya
```

**Kenapa ada pemeriksaan paritas:** perhitungan makro hidup di dua tempat
karena PRD menuntutnya — UI memakai paket TypeScript bersama (agar konsisten
dengan web), sementara widget lock screen membaca angka yang dihitung server
karena WidgetKit tidak bisa menjalankan paket TS. Dua tempat berarti dua aturan
yang bisa menyimpang diam-diam, jadi `cek:paritas` menjalankan daftar kasus yang
sama lewat SQL dan lewat `src/lib/makro.ts` lalu membandingkan hasilnya.

Skrip migrasi menyiapkan Postgres kosong, memasang tiruan `auth.users`/`auth.uid()`
(hanya untuk uji lokal, tidak pernah dipakai di Supabase asli), menjalankan
migrasi **dua kali** untuk membuktikan idempoten, lalu menjalankan uji RLS yang
memeriksa dua pengguna tidak bisa saling melihat atau mengubah data. Keluar
dengan kode bukan-nol bila ada yang gagal, jadi bisa dipakai di CI.

## Status

**Fase 1 — frontend** sedang dikerjakan di atas **data tiruan** (`src/mocks/`).
Query Supabase asli dipasang pada task layer backend; komponen tidak perlu berubah
karena bentuk data tiruan sudah meniru baris tabel sebenarnya.

## Prinsip desain

**Acuan resmi: [`docs/desain/bab-desain-prd.md`](docs/desain/bab-desain-prd.md)**
(bab 8 PRD). Setiap perubahan tampilan di `app/`, `src/theme/`, dan
`src/components/` mengikuti bab itu; alasan dan angka pengukurannya ada di
[`docs/desain/arah-visual.md`](docs/desain/arah-visual.md).
Panduan singkat tanpa istilah teknis:
[`docs/desain/panduan-token.md`](docs/desain/panduan-token.md).

Ringkasnya: gelap sebagai mode utama dan mode terang mengikuti sistem; satu
angka utama per layar; aksen amber/coral/jade, biru standar dihindari; warna,
tipografi, dan jarak hanya dari token di `src/theme`; WCAG AA di kedua mode;
area sentuh minimal 44×44 pt (`src/theme/hig.ts`); log berat maksimal 2 tap.

**Mengubah acuan desain.** Bab Desain berubah lewat satu PR yang sekaligus
memperbarui (1) `docs/desain/bab-desain-prd.md` beserta riwayat versinya,
(2) token di `src/theme`, dan (3) penjaga `scripts/cek-desain.mjs` /
`scripts/cek-kontras.mjs` / `scripts/cek-hardcode.mjs` bila aturannya ikut
berubah. `npm run cek:desain`, `npm run cek:kontras`, dan `npm run cek:hardcode` (bagian dari `cek:semua`) harus lulus sebelum digabung.
