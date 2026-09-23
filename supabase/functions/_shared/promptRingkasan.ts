/**
 * Inti yang bisa diuji dari penulis ringkasan mingguan.
 *
 * MURNI seperti `promptCoach.ts`: tidak menyentuh jaringan, env, atau Supabase,
 * jadi seluruh aturannya diperiksa `npm run cek:ringkasan` tanpa kunci API.
 *
 * Tugas model di sini sempit dengan sengaja: menulis NARASI di atas angka yang
 * sudah jadi. Angkanya datang dari `poin_ringkasan_mingguan` di SQL, bentuk
 * tampilnya dari `@recomp/logika`, dan setiap angka yang ditulis model
 * diperiksa terhadap keduanya (`periksaAngkaBacaan`). Model yang menulis angka
 * lain diberi satu kesempatan memperbaiki; setelah itu narasinya diganti
 * `bacaanCadangan`, bukan disimpan apa adanya.
 */
import {
  bacaanCadangan,
  formatAngka,
  formatDeltaPoin,
  formatNilaiPoin,
  formatRentangTanggal,
  LABEL_POIN,
  MAKS_LANJUTAN,
  periksaAngkaBacaan,
  saringLanjutan,
} from '../../../packages/logika/src/index.ts';
import type { DataRingkasanMingguan } from '../../../packages/logika/src/index.ts';

/**
 * Effort penulis ringkasan, disetel EKSPLISIT dengan alasan yang sama seperti
 * coach: nilai bawaan bisa berubah bersama model tanpa satu baris kode berubah.
 */
export const UPAYA_RINGKASAN = 'medium' as const;

/** Batas token keluaran; thinking ikut dihitung di sini. */
export const MAKS_TOKEN_RINGKASAN = 8000;

/** Berapa kali model ditanya sebelum narasi cadangan dipakai. */
export const MAKS_PERCOBAAN_RINGKASAN = 2;

/** Batas panjang narasi yang diterima; kolom `bacaan` sendiri menampung 4000. */
export const RENTANG_BACAAN = { min: 40, maks: 1500 } as const;

/**
 * Aturan penulis ringkasan — bagian system yang TIDAK berubah antar pengguna.
 * Satu jadwal meringkas banyak pengguna berturut-turut, jadi prefiks yang
 * stabil ini yang membuat caching-nya berguna.
 */
export const ATURAN_RINGKASAN = `Kamu menulis ringkasan mingguan di dalam app body recomposition milik SATU pengguna.
Ringkasan ini dikirim otomatis Senin pagi. Pembacanya belum bertanya apa pun.

ANGKA
- Angka-angkanya sudah dihitung app dan ditampilkan sebagai kartu TEPAT DI ATAS
  narasimu. Tugasmu menjelaskan apa artinya bersama-sama, bukan membacakan ulang
  setiap angka.
- Kalau kamu menyebut angka, salin PERSIS dari field *_tampil yang diberikan
  (gaya Indonesia: 2.900, 74,4). Jangan membulatkan, jangan menjumlahkan, jangan
  menghitung selisih baru, jangan memperkirakan. Angka lain akan ditolak.
- Angka bersumber "estimasi" disebut sebagai perkiraan.
- Berat selalu rata-rata pekan; jangan membahas timbangan satu hari.

ISI
- Paragraf pertama: apa yang berjalan sesuai tujuan fase.
- Paragraf kedua: satu hal yang paling layak diperhatikan pekan depan, dengan
  satu langkah konkret. Kalau semuanya sesuai, katakan pertahankan.
- Field "arah" sudah menilai tiap angka terhadap tujuan fase (sesuai,
  berlawanan, netral). Ikuti penilaian itu; jangan membuat penilaian sendiri.
- Data yang kurang disebut apa adanya, tanpa menegur.

BATAS
- Bukan tenaga medis: jangan membahas obat, dosis, diagnosis, atau gejala.

GAYA
- Bahasa Indonesia, sapa dengan "Anda". Dua paragraf pendek, paling banyak
  sekitar 90 kata. Tanpa judul, tanpa daftar berpoin, tanpa emoji.
- Nada netral dan tenang. Tidak ada "hebat!", tidak ada "awas!".

LANJUTAN
- Usulkan sampai ${MAKS_LANJUTAN} pertanyaan lanjutan yang mungkin ingin pengguna tanyakan
  kepada coach setelah membaca ringkasan ini, ditulis dari sudut pandang pengguna,
  masing-masing satu kalimat pendek tanpa angka.

Balas HANYA dengan objek JSON sesuai skema: {"bacaan": string, "lanjutan": string[]}.`;

/**
 * Skema keluaran terstruktur. Sengaja sederhana — batas panjang dan jumlah
 * ditegakkan kode di bawah, bukan skema, supaya pelanggarannya bisa dijawab
 * dengan narasi cadangan alih-alih permintaan yang gagal.
 */
export const SKEMA_RINGKASAN = {
  type: 'object',
  properties: {
    bacaan: { type: 'string' },
    lanjutan: { type: 'array', items: { type: 'string' } },
  },
  required: ['bacaan', 'lanjutan'],
  additionalProperties: false,
} as const;

/**
 * Isi pesan user: data pekan itu dengan setiap angka SUDAH berbentuk tampil.
 *
 * Model tidak pernah melihat angka mentah (74.43, 2900). Yang ia lihat adalah
 * bentuk yang juga tampil di kartu ("74,4", "2.900"), jadi menyalin dengan
 * benar sama dengan lolos pemeriksaan — dan tidak ada godaan memformat sendiri.
 */
export function susunPermintaan(data: DataRingkasanMingguan): string {
  const poin = data.poin.map((p) => {
    const d = formatDeltaPoin(p);
    const dasar: Record<string, string> = {};
    for (const [kunci, nilai] of Object.entries(p.dasar ?? {})) {
      if (kunci === 'ambang' || nilai === null || nilai === undefined) continue;
      if (typeof nilai === 'number') {
        dasar[`${kunci}_tampil`] = /^(jumlah|hari|entri)_/.test(kunci)
          ? formatAngka(nilai)
          : formatNilaiPoin({ ...p, nilai });
      } else {
        dasar[kunci] = String(nilai);
      }
    }
    return {
      label: LABEL_POIN[p.kunci],
      nilai_tampil: `${formatNilaiPoin(p)} ${p.unit}`,
      selisih_tampil:
        d === null ? null : d.nol ? 'tidak berubah' : `${d.tanda}${d.angka} ${p.unit}`,
      dibanding: p.pembanding,
      arah_nilai: p.arah_nilai,
      arah: p.arah,
      sumber: p.sumber,
      dasar,
    };
  });

  return JSON.stringify(
    {
      periode_tampil: formatRentangTanggal(data.periode.dari, data.periode.sampai),
      fase: data.fase,
      poin,
      data_kurang: data.kurang,
    },
    null,
    2,
  );
}

export type HasilBacaan =
  | { ok: true; bacaan: string; lanjutan: string[] }
  | { ok: false; alasan: 'bukan-json' | 'bentuk' | 'panjang' | 'angka-asing'; asing?: string[] };

/**
 * Baca & periksa jawaban model. Yang lolos: JSON sesuai skema, panjang narasi
 * wajar, dan TIDAK ADA angka yang tidak berasal dari poin. Pertanyaan lanjutan
 * disaring terpisah — satu pertanyaan buruk tidak menggagalkan narasi yang baik.
 */
export function bacaJawaban(teks: string, data: DataRingkasanMingguan): HasilBacaan {
  let isi: unknown;
  try {
    isi = JSON.parse(teks);
  } catch {
    return { ok: false, alasan: 'bukan-json' };
  }
  if (typeof isi !== 'object' || isi === null || Array.isArray(isi)) {
    return { ok: false, alasan: 'bentuk' };
  }
  const { bacaan, lanjutan } = isi as { bacaan?: unknown; lanjutan?: unknown };
  if (typeof bacaan !== 'string') return { ok: false, alasan: 'bentuk' };

  const rapi = bacaan.trim();
  if (rapi.length < RENTANG_BACAAN.min || rapi.length > RENTANG_BACAAN.maks) {
    return { ok: false, alasan: 'panjang' };
  }

  const asing = periksaAngkaBacaan(rapi, data);
  if (asing.length > 0) return { ok: false, alasan: 'angka-asing', asing };

  return { ok: true, bacaan: rapi, lanjutan: saringLanjutan(lanjutan, data) };
}

/** Pesan perbaikan untuk percobaan kedua; menyebut persis apa yang salah. */
export function pesanPerbaikan(hasil: Extract<HasilBacaan, { ok: false }>): string {
  switch (hasil.alasan) {
    case 'angka-asing':
      return (
        `Angka berikut tidak ada di data yang diberikan: ${hasil.asing?.join(', ')}. ` +
        'Tulis ulang tanpa angka itu. Salin angka hanya dari field *_tampil, persis.'
      );
    case 'panjang':
      return `Panjang bacaan harus ${RENTANG_BACAAN.min}–${RENTANG_BACAAN.maks} karakter. Tulis ulang.`;
    default:
      return 'Balas hanya dengan objek JSON {"bacaan": string, "lanjutan": string[]}.';
  }
}

/** Narasi pengganti bila model tidak menghasilkan bacaan yang lolos. */
export function narasiCadangan(data: DataRingkasanMingguan): { bacaan: string; lanjutan: string[] } {
  return { bacaan: bacaanCadangan(data), lanjutan: [] };
}
