import type { TextStyle } from 'react-native';
import { skemaBerlaku } from './colors';

/**
 * Skala jarak (bab Desain 8.5): 4pt ditambah satu langkah 2pt.
 * Lega antar-blok, rapat di dalam kartu.
 */
export const spacing = {
  /** Label ↔ nilai yang menempel: judul + subjudul, nama + angka. */
  xxs: 2,
  /** Ikon ↔ teks, pill vertikal. */
  xs: 4,
  /** Antar-baris dalam satu grup. */
  sm: 8,
  /** Antar-grup dalam kartu, padding field isian, di bawah SectionHeader. */
  md: 12,
  /** Padding kartu, sisi & atas layar. */
  lg: 16,
  /** Antar-kartu di layar, padding sheet. */
  xl: 24,
  /** Padding bawah layar (di atas inset). */
  xxl: 32,
} as const;

/**
 * Radius sudut (bab Desain 8.5). Radius elemen di dalam kartu selalu lebih
 * kecil dari radius kartunya (`md` di dalam `lg`) supaya sudutnya sejajar.
 */
export const radius = {
  /** Swatch legenda grafik (kotak kecil 12×8). */
  xs: 2,
  /** Sel matriks target, "ekor" gelembung chat. */
  sm: 8,
  /** Tombol, field isian, chip pilihan. */
  md: 12,
  /** Kartu, gelembung chat. */
  lg: 18,
  /** Sudut atas sheet. */
  xl: 24,
  /** Pill, tombol bulat, pegangan sheet, titik status, track progress. */
  pill: 999,
} as const;

/**
 * Ukuran elemen kecil yang berulang. Dulu ditulis sebagai angka mentah atau
 * aritmetika (`spacing.xs + 1`) di tiap komponen; sekarang satu nama.
 */
export const ukuran = {
  /** Pegangan di puncak sheet. */
  pegangan: { lebar: 40, tinggi: 4 },
  /** Titik status/legenda. */
  titik: 8,
  /** Titik status di dalam teks kecil (penanda sumber, catatan). */
  titikKecil: 6,
  /** Tinggi track progress (bar makro, meter). */
  track: 6,
  /** Track progress yang lebih tebal (progres impor). */
  trackTebal: 8,
  /** Padding pill & chip kecil: sedikit di atas `xs` agar teks kapital tidak menempel. */
  chip: { vertikal: 5, horizontal: 10 },
  /** Jarak titik/ikon kecil ↔ labelnya di legenda dan penanda. */
  celahTitik: 5,
  /** Lingkaran tombol radio (pilihan fase, jenis kelamin, opsi redistribusi). */
  radio: 18,
  /** Sisipan di dalam kontrol segmen, antara track dan segmen terpilih. */
  sisipanSegmen: 3,
  /** Tombol −/+ pemilih angka: lebih besar dari TAP_MIN karena ditekan berulang. */
  tombolLangkah: 56,
  /** Lebar kolom angka besar di pemilih angka (cukup untuk "120,5"). */
  kolomAngka: 140,
  /** Tinggi minimum kolom isian multibaris (catatan harian). */
  isianPanjang: 96,
  /** Kolom tempel teks mesin (CSV): cukup untuk ~8 baris, lalu menggulir. */
  isianTempel: { min: 140, maks: 220 },
  /** Tinggi bilah tab iOS (tanpa inset bawah); pemberitahuan melayang di atasnya. */
  bilahTab: 49,
  /** Lingkaran inisial profil di Setelan. */
  avatar: 52,
  /** Bingkai foto makanan sebelum difoto (SheetCatatFoto). */
  bingkaiFoto: 160,
  /** Tinggi chip indikator kecil (status sinkron di header). */
  indikator: 24,
  /** Garis contoh di legenda grafik (garis rata-rata). */
  garisLegenda: { lebar: 12, tebal: 2 },
  /** Baris pemeriksa di atas grafik: tingginya tetap saat isinya berganti. */
  barisPemeriksa: 36,
  /** Garis penanda di atas ikon tab terpilih. */
  penandaTab: { lebar: 20, tinggi: 3, jarakAtas: 6 },
} as const;

/**
 * Ukuran ikon (Ionicons). Empat ukuran, dipilih menurut perannya.
 */
export const ukuranIkon = {
  /** Ikon sisipan di teks kecil (gembok di catatan kaki). */
  mini: 14,
  /** Chevron baris, ikon status di samping teks. */
  kecil: 18,
  /** Ikon di tombol aksi (tutup, tampilkan sandi). */
  sedang: 20,
  /** Ikon depan baris pengaturan dan kartu. */
  baris: 22,
  /** Ikon di tombol −/+ pemilih angka. */
  besar: 28,
  /** Ikon hasil di tengah sheet (mis. centang "terhubung"). */
  hasil: 40,
} as const;

/**
 * Tangga tipografi (bab Desain 8.4). Enam ukuran, masing-masing MEMBAWA tinggi
 * baris sendiri, jadi layar tidak menulis `lineHeight` manual. `hero` khusus
 * untuk SATU angka utama per layar. Padanan gaya teks iOS dan aturan HIG-nya
 * ada di `hig.ts`.
 */
export const typography = {
  hero: { fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 68 },
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, lineHeight: 40 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '500', lineHeight: 24 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  caption: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, lineHeight: 16 },

  // Varian bernama (docs/desain/arah-visual.md bab 2.3). Menggantikan penimpaan
  // `fontWeight`/`lineHeight` manual setelah `...typography.x`.
  /** Judul kartu / nama baris yang bisa diketuk. */
  bodySedang: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  /** Label tombol utama dan nilai yang ditekankan di dalam kalimat. */
  bodyTebal: { fontSize: 16, fontWeight: '700', lineHeight: 24 },
  /** Teks keterangan: satu kalimat atau lebih di bawah judul kartu. */
  labelBiasa: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
} as const;

/**
 * Ketebalan bernama. Hanya untuk SPAN di dalam teks yang gayanya sudah dari
 * `typography` (mis. " · bawaan" yang sengaja lebih ringan dari nama tebal di
 * depannya). Gaya utuh tetap memakai varian `typography`, bukan penimpaan.
 */
export const bobot = { biasa: '500' } as const;

/**
 * Digit selebar sama untuk angka yang berubah di tempat (hero, nilai makro,
 * stepper): angka tidak "menari" saat nilainya berganti. Disebar setelah gaya
 * tipografinya: `{ ...typography.hero, ...angkaTabular }`.
 */
export const angkaTabular: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

/**
 * Bayangan (elevasi), dua mode. Di atas latar gelap bayangan harus pekat supaya
 * terlihat; di atas latar terang kepekatan yang sama membuat kartu tampak
 * kotor. Getter: dibaca saat render, jadi ikut skema. Disebar ke gaya:
 * `{ ...bayangan.kartu }`.
 */
export const bayangan = {
  /** Kartu di dalam layar. */
  kartu: {
    shadowColor: '#000000',
    get shadowOpacity() {
      return skemaBerlaku() === 'gelap' ? 0.35 : 0.08;
    },
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Elemen yang melayang di atas semua layar (banner Realtime, banner ekspor). */
  melayang: {
    shadowColor: '#000000',
    get shadowOpacity() {
      return skemaBerlaku() === 'gelap' ? 0.4 : 0.14;
    },
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
};
