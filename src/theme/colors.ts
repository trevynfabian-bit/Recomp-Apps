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
/** Palet DASAR mode gelap: nilai heks, dinamai menurut warnanya. */
const dasarGelap = {
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
  /** Amber untuk TEKS BESAR (≥24 px atau ≥18,7 px tebal: angka hero). Ambangnya 3:1. */
  amberBesar: '#F0A202',
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

  /** Selubung peredup di belakang sheet (mengaburkan layar di bawahnya). */
  selubung: '#000000AA',

  /**
   * Kepekatan TINT (alfa heks) yang ditempel ke warna peran: `tint(warna, 'pill')`.
   * Satu nama per tugas, supaya kepekatan tiap tugas bisa disetel per mode.
   */
  alfa: {
    /** Sorot sangat halus: baris "hari ini" di daftar. */
    sorotSamar: '0F',
    /** Latar pilihan terpilih, banner, gelembung pengguna. */
    pilih: '14',
    /** Latar pill & chip. */
    pill: '1A',
    /** Latar kontrol yang sedang aktif/ditekan dan lebih perlu menonjol. */
    aktif: '22',
    /** Isian area grafik (koridor), tepi gelembung sorot. */
    area: '33',
    /** Tepi pill, chip, dan kartu bertanda. */
    tepi: '55',
    /** Tepi yang harus terlihat jelas (status sumber bermasalah). */
    tepiKuat: '66',
    /** Garis tepi area grafik. */
    garisArea: '88',
  },

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

/** Mengubah semua daun string menjadi `string` biasa (bukan literal). */
type Heks<T> = { [K in keyof T]: T[K] extends string ? string : Heks<T[K]> };

/** Bentuk palet dasar: setiap mode wajib punya kunci yang sama. */
type Dasar = Heks<typeof dasarGelap>;

const dasarTerang: Dasar = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceSunken: '#E9EBEF',
  border: '#DCDFE5',
  borderKuat: '#7D8391',

  amber: '#8A5A00',
  // Teks besar cukup 3:1, jadi angka hero boleh amber yang jauh lebih cerah
  // daripada amber teks kecil (#8A5A00 terlihat cokelat pada ukuran hero).
  amberBesar: '#B37700',
  coral: '#B23A10',
  jade: '#0E7166',

  aksenTeks: {
    coral: '#B23A10',
    jade: '#0E7166',
  },

  diAtasIsian: '#FFFFFF',

  // Selubung terang: hitam penuh di atas latar putih terasa terlalu berat.
  selubung: '#14151A59',

  alfa: {
    sorotSamar: '0F',
    pilih: '14',
    pill: '1A',
    aktif: '22',
    area: '33',
    tepi: '55',
    tepiKuat: '66',
    garisArea: '88',
  },

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

/** Isian (bar, tombol, pill, mark) dan teks kecil untuk satu peran warna. */
type Peran = { isian: string; teks: string };

/**
 * Lapis SEMANTIK (bab Desain 8.2): nama menurut MAKNA, dibentuk dari palet
 * dasar sehingga setiap heks tetap hanya ditulis sekali. Hanya lapis ini yang
 * keluar dari src/theme; nama warna mentah (`amber`, `surface`, …) sudah
 * dipensiunkan dan hanya hidup di palet dasar di atas.
 *
 * Mempensiunkan token berikutnya: tambahkan dulu sebagai alias dengan satu
 * baris `/** @deprecated Pakai …. *\/` di atasnya (cek:desain menolak
 * pemakaiannya dan menyarankan pengganti), pindahkan pemakaiannya, lalu hapus.
 */
function lengkapi(d: Dasar) {
  return {
    /** Label & ikon di atas ISIAN aksen/status. Di gelap = latar, di terang putih. */
    diAtasIsian: d.diAtasIsian,
    /** Selubung peredup di belakang sheet. */
    selubung: d.selubung,
    /** Kepekatan tint per tugas; pakai lewat `tint()`. */
    alfa: d.alfa,
    /** Warna per makro untuk ISIAN bar (nama domain, bukan nama warna). */
    macro: d.macro,
    /** Warna per makro untuk TEKS KECIL. */
    macroTeks: d.macroTeks,

    /** Latar layar, splash, tab bar. */
    latar: d.bg,
    /** Kartu dan sheet. */
    permukaan: d.surface,
    /** Track progress, field isian, kontrol segmen. */
    permukaanCekung: d.surfaceSunken,
    /** Pemisah dekoratif (sengaja resesif, <2:1). */
    garis: d.border,
    /** Tepi kontrol (≥3:1). */
    garisKontrol: d.borderKuat,

    /** Teks utama. */
    teks: d.text,
    /** Teks pendukung dan keterangan. */
    teksRedup: d.textMuted,
    /** Label, unit, keterangan paling redup. */
    teksSamar: d.textFaint,
    // `diAtasIsian` sudah bernama semantik di palet dasar.

    /** Suara merek: CTA, angka hero, tab aktif, pilihan terpilih. */
    aksen: {
      isian: d.amber,
      teks: d.amber,
      /** Teks besar (angka hero): ambang 3:1, jadi di mode terang bisa lebih cerah. */
      besar: d.amberBesar,
    } satisfies Peran & { besar: string },

    /** Warna status; SELALU disertai label atau ikon, tidak pernah warna saja. */
    status: {
      /** On-track, tersambung, tersimpan. */
      sukses: { isian: d.jade, teks: d.aksenTeks.jade } satisfies Peran,
      /** Mendekati batas, perlu perhatian. Satu hue dengan aksen. */
      peringatan: { isian: d.amber, teks: d.amber } satisfies Peran,
      /** Batas terlampaui, galat, tindakan merusak. */
      bahaya: { isian: d.coral, teks: d.aksenTeks.coral } satisfies Peran,
      /**
       * Keterangan netral yang perlu dibedakan (estimasi, sumber). Isiannya
       * hanya untuk bar & mark, bukan tombol berlabel (label di atasnya 4,41:1).
       */
      info: { isian: d.macro.karbo, teks: d.macroTeks.karbo } satisfies Peran,
    },
  };
}

/** Palet lengkap (dasar + semantik). Setiap mode punya bentuk yang sama. */
export type Palet = Heks<ReturnType<typeof lengkapi>>;

export type Skema = 'gelap' | 'terang';

export const palet: Record<Skema, Palet> = { gelap: lengkapi(dasarGelap), terang: lengkapi(dasarTerang) };

/**
 * Palet yang BERLAKU. Satu objek yang isinya ditukar oleh `terapkanSkema`,
 * supaya puluhan layar yang membaca `colors.x` saat render tidak perlu diubah.
 * Konsekuensinya: jangan menyimpan `colors.x` di konstanta tingkat modul —
 * nilainya akan membeku di mode saat modul dimuat (dijaga `cek:desain`).
 */
export const colors: Palet = salin(palet.gelap);

/**
 * Warna peran dengan kepekatan tint bernama, mis. `tint(colors.aksen.isian, 'pilih')`
 * untuk latar pilihan terpilih. Dibaca saat render, jadi ikut skema.
 */
export function tint(warna: string, tingkat: keyof Palet['alfa']): string {
  return warna + colors.alfa[tingkat];
}

let skemaAktif: Skema = 'gelap';

/** Skema yang sedang diterapkan ke `colors`. */
export function skemaBerlaku(): Skema {
  return skemaAktif;
}

/** Menukar isi `colors` ke palet skema lain. Idempoten. */
export function terapkanSkema(skema: Skema): void {
  skemaAktif = skema;
  timpa(colors, palet[skema]);
}

/** Salin daun demi daun, supaya objek bersarang di `colors` tetap objek yang sama. */
function timpa(tujuan: Record<string, unknown>, sumber: Record<string, unknown>): void {
  for (const [k, nilai] of Object.entries(sumber)) {
    if (typeof nilai === 'string') tujuan[k] = nilai;
    else timpa(tujuan[k] as Record<string, unknown>, nilai as Record<string, unknown>);
  }
}

function salin(p: Palet): Palet {
  return JSON.parse(JSON.stringify(p)) as Palet;
}

export type MacroKey = keyof typeof dasarGelap.macro;
