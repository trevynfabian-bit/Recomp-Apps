import { periksaBatasMedis } from './batasMedis';
import { formatAngka, formatDesimal, formatRentangTanggal } from './format';
import { MAKS_JUDUL } from './percakapan';
import type { Fase } from './tipe';

/**
 * Ringkasan mingguan: bentuk tampil, pemeriksa angka, dan narasi cadangan.
 *
 * Pembagian kerjanya sama dengan bagian lain app: ANGKA dihitung SQL
 * (`poin_ringkasan_mingguan`), KALIMAT disusun di sini. Model hanya menulis
 * narasi di atas angka yang sudah jadi — dan karena model bisa saja menulis
 * angka yang tidak pernah diberikan kepadanya, setiap angka di narasinya
 * diperiksa terhadap poin lewat `periksaAngkaBacaan` sebelum disimpan.
 *
 * Pemeriksaan itu sengaja KETAT dan sederhana: sebuah angka boleh muncul hanya
 * bila bentuk tampilnya persis salah satu angka yang diberikan. "Kira-kira 75
 * kg" untuk rata-rata 74,4 kg ditolak, karena bagi pembaca kartu yang
 * menampilkan 74,4 tepat di atasnya, 75 adalah angka yang berbeda.
 */

/** Kunci poin; SAMA dengan daftar di CHECK `poin_ringkasan_sah` (dijaga `cek:ringkasan`). */
export const KUNCI_POIN = [
  'berat_rata',
  'asupan_rata',
  'protein_rata',
  'pinggang',
  'latihan',
] as const;
export type KunciPoin = (typeof KUNCI_POIN)[number];

/** Jumlah maksimal pertanyaan lanjutan; SAMA dengan `maks_lanjutan_ringkasan()` di SQL. */
export const MAKS_LANJUTAN = 3;

export type SumberPoin = 'manual' | 'sinkron' | 'estimasi';
export type ArahTujuan = 'sesuai' | 'berlawanan' | 'netral';

/** Satu poin seperti yang dikembalikan `poin_ringkasan_mingguan`. */
export type PoinRingkasan = {
  kunci: KunciPoin;
  nilai: number;
  unit: 'kg' | 'kcal' | 'g' | 'cm' | 'sesi';
  delta: number | null;
  pembanding: 'pekan_lalu' | 'target' | 'pengukuran_sebelumnya';
  arah_nilai: 'naik' | 'datar' | 'turun' | null;
  arah: ArahTujuan | null;
  sumber: SumberPoin;
  dasar: Record<string, unknown>;
};

/** Jawaban lengkap `poin_ringkasan_mingguan`. */
export type DataRingkasanMingguan = {
  periode: { dari: string; sampai: string };
  fase: Fase;
  poin: PoinRingkasan[];
  cukup: boolean;
  kurang: ('berat' | 'asupan' | 'pinggang')[];
};

/** Poin siap dirender kartu: semua angka sudah berbentuk teks gaya Indonesia. */
export type PoinTampil = {
  kunci: KunciPoin;
  label: string;
  nilai: string;
  delta?: string;
  arah?: ArahTujuan;
  sumber: SumberPoin;
};

export type RingkasanTampil = {
  periode: { dari: string; sampai: string };
  poin: PoinTampil[];
  bacaan: string;
  lanjutan?: string[];
};

export const LABEL_POIN: Record<KunciPoin, string> = {
  berat_rata: 'Rata-rata berat',
  asupan_rata: 'Rata-rata asupan',
  protein_rata: 'Protein harian',
  pinggang: 'Pinggang',
  latihan: 'Sesi latihan',
};

const KETERANGAN_DELTA: Record<PoinRingkasan['pembanding'], string> = {
  pekan_lalu: 'dari pekan lalu',
  target: 'dari target',
  pengukuran_sebelumnya: 'dari pengukuran sebelumnya',
};

const KETERANGAN_NOL: Record<PoinRingkasan['pembanding'], string> = {
  pekan_lalu: 'sama dengan pekan lalu',
  target: 'tepat di target',
  pengukuran_sebelumnya: 'sama dengan pengukuran sebelumnya',
};

/** Satuan dengan satu desimal; sisanya bilangan bulat. */
function berdesimal(unit: PoinRingkasan['unit']): boolean {
  return unit === 'kg' || unit === 'cm';
}

function formatMenurutUnit(nilai: number, unit: PoinRingkasan['unit']): string {
  return berdesimal(unit) ? formatDesimal(nilai, 1) : formatAngka(nilai);
}

/** Angka poin tanpa satuan, mis. "74,4" atau "2.900". */
export function formatNilaiPoin(p: PoinRingkasan): string {
  return formatMenurutUnit(p.nilai, p.unit);
}

/**
 * Selisih poin sebagai tanda + angka mutlak. `nol` bila bentuk TAMPILNYA nol:
 * 0,04 kg tampil "0,0", dan "+0,0 kg dari pekan lalu" bukan kalimat yang
 * berarti apa-apa bagi pembaca.
 */
export function formatDeltaPoin(
  p: PoinRingkasan,
): { tanda: '+' | '−'; angka: string; nol: false } | { nol: true } | null {
  if (p.delta === null) return null;
  const angka = formatMenurutUnit(Math.abs(p.delta), p.unit);
  if (angkaDariTeks(angka)[0] === 0) return { nol: true };
  return { tanda: p.delta > 0 ? '+' : '−', angka, nol: false };
}

export function tampilkanPoin(p: PoinRingkasan): PoinTampil {
  const d = formatDeltaPoin(p);
  let delta: string | undefined;
  if (d !== null) {
    delta = d.nol
      ? KETERANGAN_NOL[p.pembanding]
      : `${d.tanda}${d.angka} ${p.unit} ${KETERANGAN_DELTA[p.pembanding]}`;
  }
  return {
    kunci: p.kunci,
    label: LABEL_POIN[p.kunci],
    nilai: `${formatNilaiPoin(p)} ${p.unit}`,
    delta,
    arah: p.arah ?? undefined,
    sumber: p.sumber,
  };
}

/**
 * Ubah ringkasan tersimpan (kolom `pesan_coach.ringkasan` atau baris
 * `ringkasan_mingguan`) menjadi bentuk kartu. Poin dengan kunci yang tidak
 * dikenal dilewati: kartu yang merender label kosong lebih buruk daripada
 * satu poin yang hilang, dan CHECK di database sudah mencegahnya tersimpan.
 */
export function keRingkasanTampil(r: {
  periode: { dari: string; sampai: string };
  poin: PoinRingkasan[];
  bacaan: string;
  lanjutan?: string[] | null;
}): RingkasanTampil {
  return {
    periode: r.periode,
    poin: r.poin.filter((p) => p.kunci in LABEL_POIN).map(tampilkanPoin),
    bacaan: r.bacaan,
    lanjutan: r.lanjutan && r.lanjutan.length > 0 ? r.lanjutan : undefined,
  };
}

/** Judul utas ringkasan, dipotong sesuai batas kolom `percakapan.judul`. */
export function judulRingkasan(periode: { dari: string; sampai: string }): string {
  return `Ringkasan ${formatRentangTanggal(periode.dari, periode.sampai)}`.slice(0, MAKS_JUDUL);
}

// ---------------------------------------------------------------------------
// Pemeriksa angka
// ---------------------------------------------------------------------------

/**
 * Angka di dalam teks, diambil UTUH: deretan digit beserta titik/koma di
 * antaranya ("2.900", "74,4", "74.4", "20.09.2026").
 *
 * Tokennya diambil utuh dulu, baru bentuknya dinilai. Kalau pola gaya
 * Indonesia dicocokkan langsung, "74.4" (desimal gaya Inggris) terpecah jadi 74
 * dan 4 — dan dua potongan itu bisa kebetulan sama dengan angka yang sah
 * (rata-rata pekan lalu 74,0; 4 hari tercatat), sehingga angka yang salah tulis
 * lolos tanpa jejak.
 */
const POLA_TOKEN = /\d+(?:[.,]\d+)*/g;

/**
 * Bentuk angka gaya Indonesia yang sah: titik HANYA sebagai pemisah ribuan
 * (tepat tiga digit), koma sebagai desimal.
 */
const POLA_SAH = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;

/** Nilai satu token; NaN bila bentuknya bukan gaya Indonesia yang sah. */
function nilaiToken(token: string): number {
  if (!POLA_SAH.test(token)) return Number.NaN;
  return Number(token.replace(/\./g, '').replace(',', '.'));
}

/** Nilai mutlak setiap angka dalam teks, sesuai urutan kemunculannya. */
export function angkaDariTeks(teks: string): number[] {
  return (teks.match(POLA_TOKEN) ?? []).map(nilaiToken);
}

/**
 * Bilangan bulat kecil yang boleh disebut tanpa berasal dari poin: hitungan
 * hari dalam sepekan ("3 dari 7 hari") dan sejenisnya.
 */
const BULAT_KECIL_MAKS = 7;

function tambahkan(himpunan: Set<number>, teks: string): void {
  // NaN TIDAK boleh masuk: Set menganggap NaN sama dengan NaN, jadi satu NaN di
  // sini akan meloloskan setiap angka yang bentuknya salah.
  for (const n of angkaDariTeks(teks)) if (!Number.isNaN(n)) himpunan.add(n);
}

/** Semua angka yang boleh muncul di narasi ringkasan ini. */
export function angkaYangBoleh(data: DataRingkasanMingguan): Set<number> {
  const boleh = new Set<number>();
  for (let i = 0; i <= BULAT_KECIL_MAKS; i += 1) boleh.add(i);

  // Tanggal periode: "15–21 September 2026".
  for (const tgl of [data.periode.dari, data.periode.sampai]) {
    const [tahun, , hari] = tgl.split('-').map(Number);
    boleh.add(tahun);
    boleh.add(hari);
  }

  for (const p of data.poin) {
    tambahkan(boleh, formatNilaiPoin(p));
    const d = formatDeltaPoin(p);
    if (d && !d.nol) tambahkan(boleh, d.angka);

    for (const [kunci, nilai] of Object.entries(p.dasar ?? {})) {
      if (typeof nilai === 'number') {
        // Hitungan (jumlah timbangan, hari tercatat, entri) selalu bulat;
        // pembanding (rata-rata lalu, target) memakai format poinnya.
        const hitungan = /^(jumlah|hari|entri)_/.test(kunci);
        tambahkan(boleh, hitungan ? formatAngka(nilai) : formatMenurutUnit(nilai, p.unit));
      } else if (typeof nilai === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nilai)) {
        // Tanggal pengukuran: "sejak 8 September".
        boleh.add(Number(nilai.slice(8, 10)));
      }
    }
  }
  return boleh;
}

/**
 * Angka di `teks` yang TIDAK berasal dari ringkasan ini, dalam bentuk seperti
 * tertulis. Daftar kosong berarti lolos.
 */
export function periksaAngkaBacaan(teks: string, data: DataRingkasanMingguan): string[] {
  const boleh = angkaYangBoleh(data);
  const asing: string[] = [];
  for (const token of teks.match(POLA_TOKEN) ?? []) {
    // NaN tidak pernah ada di himpunan, jadi bentuk yang salah ikut tertangkap.
    if (!boleh.has(nilaiToken(token)) && !asing.includes(token)) asing.push(token);
  }
  return asing;
}

/**
 * Saring pertanyaan lanjutan usulan model.
 *
 * Yang dibuang: kosong/terlalu panjang, duplikat, yang mengutip angka asing,
 * dan yang akan DITOLAK batas medis saat diketuk. Tombol yang, begitu ditekan,
 * langsung dijawab "coach tidak bisa menjawab ini" lebih buruk daripada tidak
 * ada tombol sama sekali.
 */
export function saringLanjutan(daftar: unknown, data: DataRingkasanMingguan): string[] {
  if (!Array.isArray(daftar)) return [];
  const hasil: string[] = [];
  for (const mentah of daftar) {
    if (typeof mentah !== 'string') continue;
    const t = mentah.replace(/\s+/g, ' ').trim();
    if (t.length === 0 || t.length > 200) continue;
    if (hasil.some((h) => h.toLowerCase() === t.toLowerCase())) continue;
    if (periksaAngkaBacaan(t, data).length > 0) continue;
    if (periksaBatasMedis(t) !== null) continue;
    hasil.push(t);
    if (hasil.length === MAKS_LANJUTAN) break;
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// Narasi cadangan
// ---------------------------------------------------------------------------

/**
 * Narasi yang disusun tanpa model — dipakai bila model dua kali menulis angka
 * yang tidak diberikan, atau menolak menulis. Ringkasan tetap sampai Senin
 * pagi; yang hilang hanya gayanya, bukan kebenarannya.
 *
 * Nadanya netral dan hanya menyebut apa yang tercatat, sama seperti notifikasi
 * app: tidak ada kalimat "melebihi target!".
 */
export function bacaanCadangan(data: DataRingkasanMingguan): string {
  const cari = (k: KunciPoin) => data.poin.find((p) => p.kunci === k);
  const tubuh: string[] = [];
  const makan: string[] = [];
  const catatan: string[] = [];

  const berat = cari('berat_rata');
  if (berat) {
    const d = formatDeltaPoin(berat);
    let kalimat = `Rata-rata berat pekan ini ${formatNilaiPoin(berat)} kg`;
    if (d === null) {
      kalimat += '; belum ada timbangan pekan sebelumnya untuk dibandingkan';
    } else if (berat.arah_nilai === 'datar' || d.nol) {
      kalimat += ', stabil dibanding pekan sebelumnya';
    } else {
      kalimat += `, ${berat.arah_nilai} ${d.angka} kg dari pekan sebelumnya`;
    }
    if (berat.arah === 'sesuai') kalimat += `, sejalan dengan tujuan ${data.fase}`;
    if (berat.arah === 'berlawanan') kalimat += `, berlawanan dengan arah ${data.fase}`;
    tubuh.push(`${kalimat}.`);
  }

  const pinggang = cari('pinggang');
  if (pinggang) {
    const d = formatDeltaPoin(pinggang);
    let kalimat = `Pinggang tercatat ${formatNilaiPoin(pinggang)} cm`;
    if (d !== null) {
      kalimat +=
        pinggang.arah_nilai === 'datar' || d.nol
          ? ', praktis sama dengan pengukuran sebelumnya'
          : `, ${pinggang.arah_nilai} ${d.angka} cm dari pengukuran sebelumnya`;
    }
    if (pinggang.arah === 'berlawanan') kalimat += ` — arah yang perlu diawasi saat ${data.fase}`;
    tubuh.push(`${kalimat}.`);
  }

  const asupan = cari('asupan_rata');
  if (asupan) {
    const d = formatDeltaPoin(asupan);
    const hari = asupan.dasar.hari_tercatat;
    let kalimat = `Asupan rata-rata ${formatNilaiPoin(asupan)} kcal`;
    if (typeof hari === 'number') kalimat += ` pada ${formatAngka(hari)} hari yang tercatat`;
    if (d !== null) {
      kalimat += d.nol
        ? ', tepat di target'
        : `, ${d.angka} kcal ${d.tanda === '+' ? 'di atas' : 'di bawah'} target`;
    }
    makan.push(`${kalimat}.`);
  }

  const protein = cari('protein_rata');
  if (protein) {
    const d = formatDeltaPoin(protein);
    let kalimat = `Protein rata-rata ${formatNilaiPoin(protein)} g sehari`;
    if (d !== null) {
      kalimat += !d.nol && d.tanda === '−' ? `, kurang ${d.angka} g dari target` : ', memenuhi target';
    }
    makan.push(`${kalimat}.`);
  }

  const latihan = cari('latihan');
  if (latihan) {
    const d = formatDeltaPoin(latihan);
    let kalimat = `${formatNilaiPoin(latihan)} sesi latihan tercatat`;
    if (d !== null) {
      kalimat += d.nol
        ? ', sama dengan pekan sebelumnya'
        : `, ${d.angka} ${d.tanda === '+' ? 'lebih banyak' : 'lebih sedikit'} dari pekan sebelumnya`;
    }
    makan.push(`${kalimat}.`);
  }

  if (data.poin.some((p) => p.sumber === 'estimasi')) {
    catatan.push('Sebagian asupan berasal dari taksiran foto, jadi angkanya perkiraan.');
  }
  if (data.kurang.includes('berat')) catatan.push('Pekan ini belum ada timbangan pagi.');
  if (data.kurang.includes('asupan')) catatan.push('Pekan ini belum ada catatan makan.');

  return [tubuh, makan, catatan]
    .filter((bagian) => bagian.length > 0)
    .map((bagian) => bagian.join(' '))
    .join('\n\n');
}
