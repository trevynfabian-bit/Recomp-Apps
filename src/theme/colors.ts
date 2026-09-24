/**
 * Palet warna Recomp Coach — nuansa athlete dashboard, gelap sebagai mode utama.
 * Biru standar sengaja dihindari; aksen memakai amber/coral/jade.
 *
 * KONTRAS: nilai aksen di PRD (#F0A202 / #E24E1B / #1B998B) dipertahankan apa
 * adanya untuk ISIAN besar (bar, tombol, pill). Untuk TEKS KECIL sebagian di
 * antaranya tidak lolos WCAG AA 4.5:1 di atas `surface`, jadi disediakan varian
 * `aksenTeks` dan `macroTeks` yang sedikit lebih terang dengan hue yang sama.
 * Aturannya: isian pakai warna dasar, teks kecil pakai varian teks.
 */
const paletGelap = {
  /** Latar utama aplikasi. */
  bg: '#14151A',
  /** Latar kartu / permukaan yang diangkat satu tingkat. */
  surface: '#2A2D36',
  /** Permukaan yang lebih gelap dari surface, untuk track progress & input. */
  surfaceSunken: '#1C1E25',
  /** Garis pemisah HALUS: tepi kartu, pemisah baris, garis bantu grafik. */
  border: '#343845',
  /**
   * Tepi KONTROL: field isian, tombol bertepi, chip, stepper.
   *
   * Dipisahkan dari `border` karena keduanya punya tugas berbeda menurut WCAG
   * 1.4.11: pemisah dekoratif boleh (dan sebaiknya) resesif, tapi batas yang
   * MENANDAI sebuah kontrol adalah informasi dan butuh 3:1. `border` hanya
   * 1,18:1 terhadap surface — cukup untuk memisahkan, tidak cukup untuk
   * memberi tahu bahwa sesuatu bisa disentuh.
   */
  borderKuat: '#727888',

  /** Aksen utama: kalori, angka utama, CTA. Lolos AA untuk teks maupun isian. */
  amber: '#F0A202',
  /** Batas terlampaui. Untuk ISIAN & teks besar; teks kecil pakai aksenTeks.coral. */
  coral: '#E24E1B',
  /** Positif / protein / on-track. Untuk ISIAN; teks kecil pakai aksenTeks.jade. */
  jade: '#1B998B',

  /** Varian aksen khusus TEKS KECIL (≥4.5:1 di atas surface). */
  aksenTeks: {
    coral: '#E97147',
    jade: '#1DA697',
  },

  /**
   * Label & ikon di atas ISIAN aksen/status (tombol utama, chip terpilih).
   * Di mode gelap sama dengan `bg`; di mode terang putih, karena aksennya
   * digelapkan (lihat `paletTerang`). Jangan memakai `bg` untuk peran ini.
   */
  diAtasIsian: '#14151A',

  /** Teks paling menonjol. */
  text: '#F5F6F8',
  /** Teks pendukung. */
  textMuted: '#9BA1AF',
  /** Teks paling redup: label, unit, keterangan. Dinaikkan dari #6B7283 (2.9:1). */
  textFaint: '#8E94A3',

  /** Warna per makro untuk ISIAN bar. */
  macro: {
    kalori: '#F0A202',
    protein: '#1B998B',
    lemak: '#E24E1B',
    karbo: '#7C6AE8',
    satFat: '#D2495B',
  },

  /** Warna per makro untuk TEKS KECIL (label & angka). */
  macroTeks: {
    kalori: '#F0A202',
    protein: '#1DA697',
    lemak: '#E97147',
    karbo: '#9587EC',
    satFat: '#DD7482',
  },
};

/** Bentuk palet: setiap mode wajib punya kunci yang sama. */
export type Palet = {
  [K in keyof typeof paletGelap]: (typeof paletGelap)[K] extends string
    ? string
    : { [J in keyof (typeof paletGelap)[K]]: string };
};

/**
 * Mode terang (docs/desain/arah-visual.md bab 1.6). Peran sama, nilai berbeda.
 *
 * Aksen di sini SATU nilai untuk isian dan teks: amber/coral/jade asli terlalu
 * terang untuk teks di atas putih (amber 2,1:1), jadi semuanya digelapkan
 * sampai lolos 4,5:1 sebagai teks — sekaligus cukup gelap untuk label putih
 * di atasnya (`diAtasIsian`) dan 3:1 terhadap track. Hue tetap sama.
 */
const paletTerang: Palet = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceSunken: '#E9EBEF',
  border: '#DCDFE5',
  borderKuat: '#7D8391',

  amber: '#8A5A00',
  coral: '#B23A10',
  jade: '#0E7166',

  aksenTeks: {
    coral: '#B23A10',
    jade: '#0E7166',
  },

  diAtasIsian: '#FFFFFF',

  text: '#14151A',
  textMuted: '#4A4F5C',
  textFaint: '#5C6170',

  macro: {
    kalori: '#8A5A00',
    protein: '#0E7166',
    lemak: '#B23A10',
    karbo: '#5B4BC4',
    satFat: '#B02E42',
  },

  macroTeks: {
    kalori: '#8A5A00',
    protein: '#0E7166',
    lemak: '#B23A10',
    karbo: '#5B4BC4',
    satFat: '#B02E42',
  },
};

export type Skema = 'gelap' | 'terang';

export const palet: Record<Skema, Palet> = { gelap: paletGelap, terang: paletTerang };

/**
 * Palet yang BERLAKU. Satu objek yang isinya ditukar oleh `terapkanSkema`,
 * supaya puluhan layar yang membaca `colors.x` saat render tidak perlu diubah.
 * Konsekuensinya: jangan menyimpan `colors.x` di konstanta tingkat modul —
 * nilainya akan membeku di mode saat modul dimuat (dijaga `cek:desain`).
 */
export const colors: Palet = salin(paletGelap);

let skemaAktif: Skema = 'gelap';

/** Skema yang sedang diterapkan ke `colors`. */
export function skemaBerlaku(): Skema {
  return skemaAktif;
}

/** Menukar isi `colors` ke palet skema lain. Idempoten. */
export function terapkanSkema(skema: Skema): void {
  skemaAktif = skema;
  const sumber = palet[skema];
  for (const k of Object.keys(sumber) as (keyof Palet)[]) {
    const nilai = sumber[k];
    if (typeof nilai === 'string') (colors as Record<string, unknown>)[k] = nilai;
    else Object.assign(colors[k] as object, nilai);
  }
}

function salin(p: Palet): Palet {
  return JSON.parse(JSON.stringify(p)) as Palet;
}


export type MacroKey = keyof typeof paletGelap.macro;
