/**
 * Ekspor data: dari tabel ke berkas.
 *
 * Satu ZIP berisi satu CSV per jenis data, satu JSON lengkap, dan satu
 * BACA-SAYA.txt — berguna tanpa app ini: CSV terbuka di spreadsheet mana pun,
 * JSON untuk dibaca program lain. Fungsi di sini murni (tanpa berkas, tanpa
 * jaringan) supaya isi ekspor bisa diuji persis.
 *
 * Tiga hal dijaga:
 *   • CSV sesuai RFC 4180: tanda kutip digandakan, sel yang memuat koma,
 *     kutip, atau baris baru dibungkus kutip; baris diakhiri CRLF; diawali BOM
 *     supaya Excel membaca UTF-8 dengan benar.
 *   • Formula spreadsheet tidak ikut tereksekusi: TEKS yang diawali `=`, `+`,
 *     `-`, `@`, tab, atau CR diberi awalan apostrof (OWASP CSV injection).
 *     Nama makanan "=HYPERLINK(...)" yang diketik atau hasil AI tetap teks
 *     biasa saat berkas dibuka. Angka tidak disentuh — -0,5 tetap angka.
 *   • Angka ditulis dengan titik desimal (dibaca mesin), dan satuannya disebut
 *     di nama kolom (`berat_kg`, `kalori_kcal`), bukan ditebak.
 */

export type NilaiSel = string | number | boolean | null;

export type TabelEkspor = {
  /** Nama berkas tanpa ekstensi, mis. `catatan_harian`. */
  nama: string;
  /** Label untuk manusia, jamak, mis. "hari tercatat". */
  label: string;
  kolom: string[];
  baris: NilaiSel[][];
};

export type BerkasEkspor = { nama: string; isi: string };

/** Versi bentuk berkas; naikkan bila kolom atau strukturnya berubah. */
export const VERSI_FORMAT_EKSPOR = 1;

const BOM = '\uFEFF';

/**
 * Awalan yang membuat spreadsheet membaca teks sebagai formula (OWASP: `=`,
 * `+`, `-`, `@`, tab, CR), juga bila didahului spasi (sebagian pengimpor
 * memangkas spasi awal sebelum menilai sel) dan dalam bentuk lebar penuh
 * (＝＋－＠, yang diubah sebagian spreadsheet menjadi tanda biasa).
 */
const AWALAN_FORMULA = /^[ \u00A0\u3000]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r]/;

export function selCsv(nilai: NilaiSel): string {
  if (nilai === null) return '';
  if (typeof nilai === 'number') return Number.isFinite(nilai) ? String(nilai) : '';
  if (typeof nilai === 'boolean') return nilai ? 'true' : 'false';
  const aman = AWALAN_FORMULA.test(nilai) ? `'${nilai}` : nilai;
  return /[",\r\n]|^\s|\s$/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

export function csvDariTabel(t: TabelEkspor): string {
  const baris = [t.kolom.map(selCsv).join(','), ...t.baris.map((b) => b.map(selCsv).join(','))];
  return `${BOM}${baris.join('\r\n')}\r\n`;
}

/** Nama ZIP; tanggal membuat beberapa ekspor tidak saling menimpa. */
export function namaBerkasEkspor(tanggal: string): string {
  return `recomp-ekspor-${tanggal}.zip`;
}

/** Isi ekspor sebagai hitungan, ditampilkan SEBELUM berkas disiapkan. */
export function ringkasIsiEkspor(tabel: TabelEkspor[]): { label: string; jumlah: number }[] {
  return tabel.map((t) => ({ label: t.label, jumlah: t.baris.length }));
}

export function susunBerkasEkspor(
  tabel: TabelEkspor[],
  meta: { dibuatPada: string; email: string | null },
): BerkasEkspor[] {
  const json = {
    versi_format: VERSI_FORMAT_EKSPOR,
    dibuat_pada: meta.dibuatPada,
    akun: meta.email,
    tabel: Object.fromEntries(
      tabel.map((t) => [t.nama, t.baris.map((b) => Object.fromEntries(t.kolom.map((k, i) => [k, b[i] ?? null])))]),
    ),
  };
  const bacaSaya = [
    'Ekspor data Recomp Coach',
    `Dibuat: ${meta.dibuatPada}`,
    `Versi format: ${VERSI_FORMAT_EKSPOR}`,
    '',
    'Isi:',
    ...tabel.map((t) => `- ${t.nama}.csv: ${t.label} (${t.baris.length} baris)`),
    '- semua.json: seluruh tabel di atas dalam satu berkas, untuk dibaca program lain.',
    '',
    'Cara membaca:',
    '- Satuan disebut di nama kolom: kg, cm, kcal, g. Data selalu disimpan metrik.',
    '- Angka memakai titik desimal. Tanggal berformat YYYY-MM-DD, waktu ISO 8601.',
    '- Kolom "sumber" membedakan catatan manual, data sinkron dari perangkat, dan estimasi (foto AI, rumus).',
    "- Teks yang diawali =, +, -, atau @ (juga setelah spasi, atau dalam bentuk lebar penuh) diberi awalan ' supaya spreadsheet tidak menjalankannya sebagai formula.",
    '',
    'Berkas ini berisi data kesehatan Anda. Setelah dibagikan, penjagaannya mengikuti tempat tujuannya.',
    '',
  ].join('\r\n');

  return [
    ...tabel.map((t) => ({ nama: `${t.nama}.csv`, isi: csvDariTabel(t) })),
    { nama: 'semua.json', isi: `${JSON.stringify(json, null, 2)}\n` },
    { nama: 'BACA-SAYA.txt', isi: `${BOM}${bacaSaya}` },
  ];
}

/**
 * Notifikasi saat berkas siap sementara app tidak di depan. Netral dan tanpa
 * angka seperti notifikasi lain (layar kunci terbaca tanpa kunci dibuka).
 */
export const NOTIF_EKSPOR_SIAP = {
  judul: 'Ekspor data siap',
  isi: 'Berkasnya sudah disiapkan. Buka app untuk membagikannya.',
} as const;

/** Ukuran berkas untuk manusia: "12 KB", "2,4 MB" (dibulatkan ke atas untuk KB; tidak pernah "0 KB"). */
export function formatUkuranBerkas(byte: number): string {
  if (byte < 1024 * 1024) return `${Math.max(1, Math.ceil(byte / 1024))} KB`;
  return `${(Math.round((byte / (1024 * 1024)) * 10) / 10).toString().replace('.', ',')} MB`;
}
