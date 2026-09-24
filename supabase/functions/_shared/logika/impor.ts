// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import { masalahSet, type JenisSet, type SesiLatihan, type SetLatihan } from './latihan.ts';
import { KG_PER_LB } from './satuan.ts';
import { RENTANG_UKURAN_CM, type BagianUkuran } from './ukuran.ts';

/**
 * Impor riwayat sekali: ekspor CSV Hevy dan log ukuran lama.
 *
 * Aturan umumnya: TIDAK ADA baris yang hilang diam-diam. Setiap baris yang
 * tidak diimpor muncul di `dilewati` beserta nomor barisnya dan alasannya,
 * supaya pratinjau bisa berkata "3 baris dilewati: baris 14 — repetisi
 * kosong" alih-alih angka total yang tidak bisa diperiksa. Riwayat setahun
 * yang diam-diam kehilangan satu bulan baru ketahuan saat tren terlihat aneh,
 * jauh setelah berkas aslinya terhapus.
 *
 * Parser menerima TEKS, bukan berkas: pemilih berkas di perangkat adalah
 * urusan layar, dan dengan begini aturan yang sama bisa diuji tanpa perangkat.
 */

export type BarisDilewati = { baris: number; alasan: string };

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Tebak pemisah dari baris judul: koma, atau titik koma (Excel berlokal
 * Indonesia menyimpan CSV dengan titik koma karena koma dipakai desimal).
 */
function tebakPemisah(teks: string): ',' | ';' {
  const judul = teks.split(/\r?\n/, 1)[0] ?? '';
  let koma = 0;
  let titikKoma = 0;
  let dalamKutip = false;
  for (const c of judul) {
    if (c === '"') dalamKutip = !dalamKutip;
    else if (!dalamKutip && c === ',') koma += 1;
    else if (!dalamKutip && c === ';') titikKoma += 1;
  }
  return titikKoma > koma ? ';' : ',';
}

/**
 * Urai CSV gaya RFC 4180: kolom berkutip boleh memuat pemisah, baris baru,
 * dan kutip ganda (`""`). BOM di awal berkas dibuang — Excel menambahkannya,
 * dan tanpa dibuang nama kolom pertama menjadi "﻿title" yang tidak
 * pernah cocok dengan apa pun.
 */
export function uraiCsv(teks: string, pemisah: ',' | ';' = tebakPemisah(teks)): string[][] {
  return uraiCsvRinci(teks, pemisah).baris;
}

/**
 * Seperti `uraiCsv`, ditambah nomor baris berkas tempat tanda kutip dibuka
 * tetapi tidak pernah ditutup (`null` bila semua tertutup). Kutip yang tidak
 * ditutup menelan SELURUH sisa berkas ke dalam satu sel: puluhan baris akan
 * hilang tanpa dilaporkan satu per satu. Pengurai impor menolak berkas seperti
 * itu dengan menyebut barisnya.
 */
export function uraiCsvRinci(
  teks: string,
  pemisah: ',' | ';' = tebakPemisah(teks),
): { baris: string[][]; kutipTerbuka: number | null } {
  const t = teks.replace(/^\uFEFF/, '');
  const baris: string[][] = [];
  let kolom: string[] = [];
  let sel = '';
  let dalamKutip = false;
  let barisBerkas = 1;
  let kutipDibukaDi = 0;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '\n') barisBerkas += 1;
    if (dalamKutip) {
      if (c === '"' && t[i + 1] === '"') {
        sel += '"';
        i += 1;
      } else if (c === '"') {
        dalamKutip = false;
      } else {
        sel += c;
      }
    } else if (c === '"') {
      dalamKutip = true;
      kutipDibukaDi = barisBerkas;
    } else if (c === pemisah) {
      kolom.push(sel);
      sel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') {
        i += 1;
        barisBerkas += 1;
      }
      kolom.push(sel);
      baris.push(kolom);
      kolom = [];
      sel = '';
    } else {
      sel += c;
    }
  }
  if (sel.length > 0 || kolom.length > 0) {
    kolom.push(sel);
    baris.push(kolom);
  }
  // Baris kosong (mis. baris baru di akhir berkas) bukan data.
  return { baris: baris.filter((b) => b.some((s) => s.trim().length > 0)), kutipTerbuka: dalamKutip ? kutipDibukaDi : null };
}

/** Kalimat galat untuk kutip yang tidak ditutup; sama untuk semua pengurai impor. */
function galatKutipTerbuka(baris: number): string {
  return `Tanda kutip di baris ${baris} tidak ditutup, jadi baris sesudahnya tidak bisa dibaca. Periksa berkasnya, lalu impor lagi.`;
}

/** Angka dengan desimal koma ATAU titik; `null` bila kosong, NaN bila bukan angka. */
function angka(s: string | undefined): number | null {
  const t = (s ?? '').trim();
  if (t.length === 0) return null;
  // "1.234,5" (gaya Indonesia) → 1234.5; "1234.5" dan "1234,5" → 1234.5.
  const normal = /,\d+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : Number.NaN;
}

// ---------------------------------------------------------------------------
// Hevy
// ---------------------------------------------------------------------------

const BULAN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7,
  aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};

/**
 * Waktu di ekspor Hevy, mis. "22 Sep 2026, 07:12". Hevy menulisnya dalam jam
 * PERANGKAT tanpa zona; app ini mengasumsikan Asia/Jakarta, sama dengan zona
 * kanonis seluruh app. Bentuk ISO juga diterima.
 */
export function uraiWaktuHevy(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const bulan = BULAN[m[2].toLowerCase()];
    if (!bulan) return null;
    const d = new Date(
      `${m[3]}-${String(bulan).padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00+07:00`,
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) {
    // ISO tanpa zona dianggap Asia/Jakarta, dengan zona dipakai apa adanya.
    const punyaZona = /(Z|[+-]\d{2}:?\d{2})$/.test(t);
    const d = new Date(punyaZona ? t.replace(' ', 'T') : `${t.replace(' ', 'T')}+07:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export type HasilImporHevy = {
  sesi: SesiLatihan[];
  jumlahSet: number;
  /** Satuan beban di berkas; lb dikonversi ke kg. */
  satuanBeban: 'kg' | 'lb';
  dilewati: BarisDilewati[];
};

const JENIS_SET_CSV: readonly JenisSet[] = ['normal', 'warmup', 'dropset', 'failure'];

/** Kolom yang WAJIB ada di ekspor Hevy. */
const KOLOM_HEVY = ['title', 'start_time', 'exercise_title', 'set_index', 'reps'] as const;

/**
 * Urai ekspor CSV Hevy menjadi sesi → latihan → set.
 *
 * Baris tanpa repetisi (kardio, plank berdurasi) dilewati dengan alasannya:
 * `workout_sets` menyimpan set beban, dan menyimpan "0 repetisi" untuk lari
 * 5 km akan tercatat sebagai set yang gagal.
 */
export function uraiCsvHevy(teks: string): HasilImporHevy | { galat: string } {
  const { baris, kutipTerbuka } = uraiCsvRinci(teks);
  if (kutipTerbuka !== null) return { galat: galatKutipTerbuka(kutipTerbuka) };
  if (baris.length === 0) return { galat: 'Berkasnya kosong.' };

  const judul = baris[0].map((j) => j.trim().toLowerCase());
  const kurang = KOLOM_HEVY.filter((k) => !judul.includes(k));
  const iKg = judul.indexOf('weight_kg');
  const iLb = judul.indexOf('weight_lbs');
  if (kurang.length > 0 || (iKg < 0 && iLb < 0)) {
    const hilang = [...kurang, ...(iKg < 0 && iLb < 0 ? ['weight_kg'] : [])];
    return { galat: `Ini bukan ekspor latihan Hevy: kolom ${hilang.join(', ')} tidak ada.` };
  }
  const i = (k: string) => judul.indexOf(k);
  const satuanBeban: 'kg' | 'lb' = iKg >= 0 ? 'kg' : 'lb';

  const dilewati: BarisDilewati[] = [];
  const peta = new Map<string, SesiLatihan & { _selesai: string | null }>();

  for (let r = 1; r < baris.length; r += 1) {
    const b = baris[r];
    const nomor = r + 1; // nomor baris di berkas, judul = baris 1
    const judulSesi = (b[i('title')] ?? '').trim();
    const mulai = uraiWaktuHevy(b[i('start_time')] ?? '');
    const latihan = (b[i('exercise_title')] ?? '').trim();
    const reps = angka(b[i('reps')]);
    const bebanMentah = angka(b[satuanBeban === 'kg' ? iKg : iLb]);
    const indeks = angka(b[i('set_index')]);
    const jenisSet = i('set_type') >= 0 ? (b[i('set_type')] ?? '').trim().toLowerCase() : '';

    if (!mulai) {
      dilewati.push({ baris: nomor, alasan: 'waktu mulai tidak terbaca' });
      continue;
    }
    if (latihan.length === 0) {
      dilewati.push({ baris: nomor, alasan: 'nama latihan kosong' });
      continue;
    }
    if (reps === null) {
      dilewati.push({ baris: nomor, alasan: 'tanpa repetisi (kardio atau berdurasi)' });
      continue;
    }
    if (!Number.isInteger(reps) || reps <= 0) {
      dilewati.push({ baris: nomor, alasan: 'repetisi tidak sah' });
      continue;
    }
    if (bebanMentah !== null && (Number.isNaN(bebanMentah) || bebanMentah < 0)) {
      dilewati.push({ baris: nomor, alasan: 'beban tidak sah' });
      continue;
    }
    const beban =
      bebanMentah === null || bebanMentah === 0
        ? null
        : satuanBeban === 'kg'
          ? bebanMentah
          : Math.round(bebanMentah * KG_PER_LB * 100) / 100;
    // Batas database per set: hanya set ini yang dilewati, bukan seluruh sesinya.
    const masalah = masalahSet(beban, reps);
    if (masalah) {
      dilewati.push({ baris: nomor, alasan: masalah });
      continue;
    }

    const kunci = `${mulai}|${judulSesi}`;
    let sesi = peta.get(kunci);
    if (!sesi) {
      const selesai = i('end_time') >= 0 ? uraiWaktuHevy(b[i('end_time')] ?? '') : null;
      sesi = {
        id: `hevy-csv-${peta.size + 1}`,
        mulai,
        nama: judulSesi || 'Latihan',
        durasi_menit: 0,
        latihan: [],
        _selesai: selesai,
      };
      peta.set(kunci, sesi);
    }

    let l = sesi.latihan.find((x) => x.latihan === latihan);
    if (!l) {
      l = { latihan, sets: [] };
      sesi.latihan.push(l);
    }
    const set: SetLatihan = {
      // Hevy memberi nomor set mulai 0; tanpa kolomnya, urutan kemunculan.
      set_ke: indeks !== null && Number.isInteger(indeks) && indeks >= 0 ? indeks + 1 : l.sets.length + 1,
      beban_kg: beban,
      reps,
      // Sama seperti API: pemanasan dikenali, jenis asing dibaca "normal".
      ...(jenisSet ? { jenis: (JENIS_SET_CSV as readonly string[]).includes(jenisSet) ? (jenisSet as JenisSet) : 'normal' } : {}),
    };
    l.sets.push(set);
  }

  const sesi = [...peta.values()]
    .map(({ _selesai, ...s }) => ({
      ...s,
      durasi_menit: _selesai
        ? Math.max(0, Math.round((Date.parse(_selesai) - Date.parse(s.mulai)) / 60_000))
        : 0,
    }))
    .sort((a, b) => a.mulai.localeCompare(b.mulai));

  return {
    sesi,
    jumlahSet: sesi.reduce((t, s) => t + s.latihan.reduce((u, l) => u + l.sets.length, 0), 0),
    satuanBeban,
    dilewati,
  };
}

// ---------------------------------------------------------------------------
// Ukuran lama
// ---------------------------------------------------------------------------

export type BarisUkuranImpor = { tanggal: string } & Partial<Record<BagianUkuran, number>>;

export type HasilImporUkuran = {
  baris: BarisUkuranImpor[];
  dilewati: BarisDilewati[];
};

/** Nama kolom yang dikenali per bagian: Indonesia, Inggris, dengan/tanpa "_cm". */
const ALIAS_BAGIAN: Record<BagianUkuran, string[]> = {
  pinggang_cm: ['pinggang', 'waist'],
  dada_cm: ['dada', 'chest'],
  leher_cm: ['leher', 'neck'],
  lengan_kiri_cm: ['lengan_kiri', 'lengan kiri', 'left_arm', 'arm_left'],
  lengan_kanan_cm: ['lengan_kanan', 'lengan kanan', 'right_arm', 'arm_right'],
  paha_kiri_cm: ['paha_kiri', 'paha kiri', 'left_thigh', 'thigh_left'],
  paha_kanan_cm: ['paha_kanan', 'paha kanan', 'right_thigh', 'thigh_right'],
};

const LABEL_BAGIAN: Record<BagianUkuran, string> = {
  pinggang_cm: 'pinggang',
  dada_cm: 'dada',
  leher_cm: 'leher',
  lengan_kiri_cm: 'lengan kiri',
  lengan_kanan_cm: 'lengan kanan',
  paha_kiri_cm: 'paha kiri',
  paha_kanan_cm: 'paha kanan',
};

function normalkanJudul(j: string): string {
  return j.trim().toLowerCase().replace(/\s*\(cm\)\s*$/, '').replace(/_cm$/, '').replace(/\s+/g, ' ');
}

/** Tanggal `YYYY-MM-DD`, `DD/MM/YYYY`, atau `DD-MM-YYYY`; `null` bila tidak sah. */
export function uraiTanggal(s: string): string | null {
  const t = s.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const id = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (id) [y, m, d] = [Number(id[3]), Number(id[2]), Number(id[1])];
  else return null;
  const tgl = new Date(Date.UTC(y, m - 1, d));
  // Menolak 31/02 dan sejenisnya, yang Date diam-diam geser ke bulan berikutnya.
  if (tgl.getUTCFullYear() !== y || tgl.getUTCMonth() !== m - 1 || tgl.getUTCDate() !== d) return null;
  return tgl.toISOString().slice(0, 10);
}

/**
 * Urai log ukuran lama. Satu baris = satu tanggal; kolom bagian yang kosong
 * boleh (pencatatan sebagian), tapi setiap baris butuh minimal satu angka.
 *
 * Satu angka di luar rentang menolak SELURUH barisnya, bukan hanya angka itu:
 * nilai mustahil hampir selalu berarti kolomnya bergeser, dan menyimpan sisa
 * baris yang bergeser itu lebih buruk daripada melewatinya.
 *
 * Tanggal ganda: baris TERAKHIR yang dipakai, yang sebelumnya dilaporkan —
 * sama dengan aturan satu pencatatan per tanggal di `body_measurements`.
 */
export function uraiCsvUkuran(teks: string, hariIni: string): HasilImporUkuran | { galat: string } {
  const { baris, kutipTerbuka } = uraiCsvRinci(teks);
  if (kutipTerbuka !== null) return { galat: galatKutipTerbuka(kutipTerbuka) };
  if (baris.length === 0) return { galat: 'Berkasnya kosong.' };

  const judul = baris[0].map(normalkanJudul);
  const iTanggal = judul.findIndex((j) => j === 'tanggal' || j === 'date');
  if (iTanggal < 0) return { galat: 'Kolom tanggal tidak ada.' };

  const kolom = (Object.keys(ALIAS_BAGIAN) as BagianUkuran[])
    .map((bagian) => ({ bagian, indeks: judul.findIndex((j) => ALIAS_BAGIAN[bagian].includes(j)) }))
    .filter((k) => k.indeks >= 0);
  if (kolom.length === 0) {
    return { galat: 'Tidak ada kolom ukuran yang dikenali (mis. pinggang, dada, leher).' };
  }

  const dilewati: BarisDilewati[] = [];
  const perTanggal = new Map<string, { baris: number; data: BarisUkuranImpor }>();

  for (let r = 1; r < baris.length; r += 1) {
    const b = baris[r];
    const nomor = r + 1;
    const tanggal = uraiTanggal(b[iTanggal] ?? '');
    if (!tanggal) {
      dilewati.push({ baris: nomor, alasan: 'tanggal tidak terbaca' });
      continue;
    }
    if (tanggal > hariIni) {
      dilewati.push({ baris: nomor, alasan: 'tanggal di masa depan' });
      continue;
    }

    const data: BarisUkuranImpor = { tanggal };
    let masalah: string | null = null;
    for (const { bagian, indeks } of kolom) {
      const n = angka(b[indeks]);
      if (n === null) continue;
      const { min, maks } = RENTANG_UKURAN_CM[bagian];
      if (Number.isNaN(n)) {
        masalah = `${LABEL_BAGIAN[bagian]} bukan angka`;
        break;
      }
      if (n < min || n > maks) {
        masalah = `${LABEL_BAGIAN[bagian]} ${String(n).replace('.', ',')} di luar ${min}–${maks} cm`;
        break;
      }
      data[bagian] = Math.round(n * 10) / 10;
    }
    if (masalah) {
      dilewati.push({ baris: nomor, alasan: masalah });
      continue;
    }
    if (Object.keys(data).length === 1) {
      dilewati.push({ baris: nomor, alasan: 'tidak ada satu pun ukuran' });
      continue;
    }

    const lama = perTanggal.get(tanggal);
    if (lama) {
      dilewati.push({ baris: lama.baris, alasan: `tanggal ganda; baris ${nomor} yang dipakai` });
    }
    perTanggal.set(tanggal, { baris: nomor, data });
  }

  return {
    baris: [...perTanggal.values()].map((x) => x.data).sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    dilewati: dilewati.sort((a, b) => a.baris - b.baris),
  };
}

// ---------------------------------------------------------------------------
// Pengiriman bertahap
// ---------------------------------------------------------------------------

/**
 * Ukuran potongan per sumber — SAMA dengan `maks_isi_batch_impor` di SQL.
 * Potongan kecil membuat kemajuan terasa ("120 dari 312") dan membuat satu
 * potongan yang gagal cukup diulang sendiri; potongan yang melebihi batas
 * server ditolak utuh.
 */
export const UKURAN_BATCH_IMPOR = { hevy_csv: 100, ukuran_lama: 500, apple_health: 5000 } as const;

/** Potong daftar menjadi potongan berurutan; daftar kosong → tanpa potongan. */
export function potongBatch<T>(daftar: readonly T[], ukuran: number): T[][] {
  if (!Number.isInteger(ukuran) || ukuran < 1) throw new Error('Ukuran potongan harus bilangan bulat positif');
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}
