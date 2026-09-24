// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import { formatAngka, formatDesimal } from './format.ts';

/**
 * Laporan paritas logika & basis data dalam bahasa awam.
 *
 * Aturan yang dihitung di dua tempat (`@recomp/logika` di app, fungsi & batasan
 * di database server) dibandingkan `npm run cek:paritas`. Bentuk laporannya ada
 * di sini, bersama penyusun kalimatnya: pembaca laporan (pengembang, penguji,
 * pemilik produk) cukup membaca "app menghitung 413 kcal, server 412 kcal",
 * tanpa perlu tahu nama fungsi atau bahasa SQL. Nama fungsinya tetap dibawa
 * di `ts` dan `sql` untuk yang memperbaikinya.
 */

export type AreaParitas =
  | 'Makro & budget'
  | 'Target & fase'
  | 'Berat & tren'
  | 'Komposisi tubuh'
  | 'Evaluasi & teks'
  | 'Skema data';

export type PasanganParitas = {
  id: string;
  area: AreaParitas;
  /** Nama aturan dalam bahasa sehari-hari. */
  aturan: string;
  /** Fungsi/konstanta di `@recomp/logika`. */
  ts: string;
  /** Fungsi, view, atau batasan di database. */
  sql: string;
  kasus: number;
  keadaan: 'sama' | 'beda';
  /** Setiap nilai yang berbeda, per kasus dan kolom; hanya untuk `beda`. */
  selisih?: SelisihParitas[];
};

/**
 * Satu nilai yang tidak sama di kedua sisi. Angka ditampilkan beserta
 * selisihnya (server − app); teks (arah, status, kode verdict) hanya berdampingan.
 */
export type SelisihParitas = {
  kasus: string;
  /** Kolom hasil yang dibandingkan, mis. "sisa/hari". */
  kolom: string;
  ts: number | string | null;
  sql: number | string | null;
  satuan?: string;
  /** Digit desimal untuk angka; bawaan 0. */
  desimal?: number;
};

export type LaporanParitas = {
  /** ISO 8601; null = belum pernah dijalankan. */
  dijalankanPada: string | null;
  commit: string | null;
  pasangan: PasanganParitas[];
};

/** Angka gaya Indonesia dengan minus "−" (selebar "+"). */
function angkaAwam(n: number, desimal = 0): string {
  const teks = desimal > 0 ? formatDesimal(Math.abs(n), desimal) : formatAngka(Math.abs(n));
  return n < 0 ? `−${teks}` : teks;
}

function nilaiAwam(v: number | string | null, s: SelisihParitas): string {
  if (v === null) return 'tidak memberi hasil';
  if (typeof v === 'string') return `“${v}”`;
  return `${angkaAwam(v, s.desimal ?? 0)}${s.satuan ? ` ${s.satuan}` : ''}`;
}

/** Satu selisih sebagai satu kalimat: kasusnya, nilai app, nilai server, dan bedanya. */
export function kalimatSelisihParitas(s: SelisihParitas): string {
  const kolom = s.kolom ? ` (${s.kolom})` : '';
  if (s.ts === null || s.sql === null) {
    const adaDi = s.ts === null ? 'server' : 'app';
    const nilai = s.ts === null ? nilaiAwam(s.sql, s) : nilaiAwam(s.ts, s);
    return `Saat ${s.kasus}${kolom}: hanya ${adaDi} yang memberi hasil, ${nilai}.`;
  }
  if (typeof s.ts === 'number' && typeof s.sql === 'number') {
    const faktor = 10 ** (s.desimal ?? 0);
    const beda = Math.round((s.sql - s.ts) * faktor) / faktor;
    const arah = beda > 0 ? 'lebih besar' : 'lebih kecil';
    return (
      `Saat ${s.kasus}${kolom}: app menghitung ${nilaiAwam(s.ts, s)}, server ${nilaiAwam(s.sql, s)}` +
      ` (server ${angkaAwam(Math.abs(beda), s.desimal ?? 0)}${s.satuan ? ` ${s.satuan}` : ''} ${arah}).`
    );
  }
  return `Saat ${s.kasus}${kolom}: app membaca ${nilaiAwam(s.ts, s)}, server ${nilaiAwam(s.sql, s)}.`;
}

/** Satu aturan sebagai satu kalimat ringkas. */
export function kalimatPasanganParitas(p: PasanganParitas): string {
  if (p.keadaan === 'sama') return `${p.aturan}: app dan server menghitung sama pada ${formatAngka(p.kasus)} kasus.`;
  const n = p.selisih?.length ?? 0;
  return `${p.aturan}: ${formatAngka(n)} nilai berbeda dari ${formatAngka(p.kasus)} kasus.`;
}

/** Kalimat pembuka laporan: keadaan keseluruhan dan apa yang perlu dilakukan. */
export function ringkasLaporanParitas(l: LaporanParitas): { judul: string; kalimat: string } {
  if (l.dijalankanPada === null) {
    return { judul: 'Belum ada laporan', kalimat: 'Pemeriksaan belum pernah dijalankan. Jalankan npm run cek:paritas-semua.' };
  }
  const total = l.pasangan.reduce((n, p) => n + p.kasus, 0);
  const beda = l.pasangan.filter((p) => p.keadaan === 'beda');
  if (beda.length === 0) {
    return {
      judul: 'Semua aturan sama',
      kalimat: `${formatAngka(l.pasangan.length)} aturan dihitung sama di app dan server pada ${formatAngka(total)} kasus uji.`,
    };
  }
  return {
    judul: `${formatAngka(beda.length)} aturan berbeda`,
    kalimat:
      `${formatAngka(beda.length)} dari ${formatAngka(l.pasangan.length)} aturan menghitung berbeda di app dan server. ` +
      'Angka di layar bisa tidak cocok dengan widget atau jawaban coach sampai salah satu sisinya disamakan.',
  };
}
