// BERKAS TURUNAN — jangan diedit. Disalin dari packages/logika/src oleh
// `npm run salin:logika`; satu-satunya perubahan: akhiran .ts pada impor relatif.
import type { Fase, KoridorTarget, StatusKoridor, TitikKoridor } from './tipe.ts';
import { majuHari } from './tren.ts';

/**
 * Koridor target berat: rentang laju perubahan yang masuk akal untuk tiap fase.
 *
 * Angkanya PERSEN BERAT BADAN PER MINGGU, bukan kilogram tetap — laju yang
 * wajar bagi orang 60 kg berbeda dari orang 100 kg. Ini nilai bawaan yang
 * lazim dipakai untuk rekomposisi; pengguna bisa mengubahnya lewat Pengaturan
 * nanti.
 *
 * Gunanya bukan menilai benar/salah, melainkan menjawab satu pertanyaan:
 * "apakah lajuku masih di rentang yang bisa dipertahankan?" — naik terlalu
 * cepat berarti tambahan lemak yang tidak perlu, turun terlalu cepat berarti
 * otot ikut hilang.
 */
export const LAJU_PER_MINGGU: Record<Fase, { min: number; maks: number }> = {
  // Lean gain pelan: cukup untuk membangun otot tanpa menumpuk lemak.
  'Lean Gain': { min: 0.0025, maks: 0.005 },
  // Cut: cukup cepat untuk terlihat, cukup pelan untuk menjaga otot.
  Cut: { min: -0.01, maks: -0.005 },
  // Maintenance: koridor simetris tipis; goyangan air sudah memakan sebagiannya.
  Maintenance: { min: -0.002, maks: 0.002 },
};

/**
 * Bangun koridor target harian dari satu titik jangkar.
 *
 * @param beratJangkarKg berat (rata-rata 7 hari) saat fase dimulai
 * @param tanggalJangkar tanggal mulai fase
 * @param jumlahHari berapa hari koridor digambar sejak jangkar
 */
export function koridorTarget(
  beratJangkarKg: number,
  tanggalJangkar: string,
  fase: Fase,
  jumlahHari: number,
): KoridorTarget {
  const laju = LAJU_PER_MINGGU[fase];
  const titik: TitikKoridor[] = [];

  for (let h = 0; h < jumlahHari; h += 1) {
    const minggu = h / 7;
    // Pertumbuhan majemuk, bukan linear: laju itu persen dari berat BERJALAN.
    const bawah = beratJangkarKg * (1 + laju.min) ** minggu;
    const atas = beratJangkarKg * (1 + laju.maks) ** minggu;
    titik.push({
      tanggal: majuHari(tanggalJangkar, h),
      // min/maks ditentukan nilainya, bukan namanya — pada fase Cut keduanya negatif.
      bawahKg: bulatkan(Math.min(bawah, atas), 2),
      atasKg: bulatkan(Math.max(bawah, atas), 2),
    });
  }

  return { fase, beratJangkarKg, tanggalJangkar, titik };
}

/**
 * Posisi rata-rata sekarang terhadap koridor.
 * Nadanya sengaja deskriptif: "di atas koridor", bukan "terlalu gemuk".
 */
export function statusKoridor(
  koridor: KoridorTarget,
  tanggal: string,
  rataRataKg: number | null,
): StatusKoridor {
  const t = koridor.titik.find((k) => k.tanggal === tanggal);
  if (!t || rataRataKg === null) {
    return { posisi: 'belum bisa dinilai', selisihKg: null, bawahKg: null, atasKg: null };
  }
  if (rataRataKg < t.bawahKg) {
    return {
      posisi: 'di bawah koridor',
      selisihKg: bulatkan(rataRataKg - t.bawahKg, 2),
      bawahKg: t.bawahKg,
      atasKg: t.atasKg,
    };
  }
  if (rataRataKg > t.atasKg) {
    return {
      posisi: 'di atas koridor',
      selisihKg: bulatkan(rataRataKg - t.atasKg, 2),
      bawahKg: t.bawahKg,
      atasKg: t.atasKg,
    };
  }
  return { posisi: 'di dalam koridor', selisihKg: 0, bawahKg: t.bawahKg, atasKg: t.atasKg };
}

function bulatkan(nilai: number, desimal: number): number {
  const f = 10 ** desimal;
  return Math.round(nilai * f) / f;
}
