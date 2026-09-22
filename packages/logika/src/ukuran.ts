import type { RingkasanPerubahan, PerubahanUkuran, TitikUkuran } from './tipe';

/**
 * Riwayat perubahan satu ukuran tubuh.
 *
 * Nilai mentahnya sendiri hampir tidak berguna untuk dibaca berderet: "85,4 —
 * 85,2 — 84,8" memaksa orang mengurangi di kepala tiap kali. Yang dicari selalu
 * PERUBAHANNYA, dan perubahan itu baru bermakna kalau jaraknya ikut disebut.
 *
 * Karena itu tiap selang juga membawa laju per pekan: +0,3 cm dalam 3 hari dan
 * +0,3 cm dalam 12 hari adalah dua hal yang sangat berbeda, dan pencatatan
 * mingguan yang tertunda sehari-dua hari itu keadaan normal, bukan kekecualian.
 */

/** Panjang satu pekan, dipakai menormalkan laju antar selang. */
export const HARI_PER_PEKAN = 7;

/**
 * Susun riwayat perubahan dari deret nilai satu bagian tubuh.
 * Titik diurutkan menurut tanggal lebih dulu, jadi pemanggil tidak perlu
 * menjamin urutannya.
 */
export function ringkasPerubahan(titik: TitikUkuran[]): RingkasanPerubahan {
  const urut = [...titik].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  if (urut.length === 0) {
    return { perubahan: [], totalSelisih: null, rentangHari: null, awal: null, akhir: null };
  }

  const perubahan: PerubahanUkuran[] = [];
  for (let i = 1; i < urut.length; i += 1) {
    const dari = urut[i - 1];
    const ke = urut[i];
    const jarakHari = selisihHariUkuran(dari.tanggal, ke.tanggal);
    const selisih = bulat(ke.nilai - dari.nilai);
    perubahan.push({
      dari: dari.tanggal,
      ke: ke.tanggal,
      nilaiDari: dari.nilai,
      nilaiKe: ke.nilai,
      selisih,
      jarakHari,
      // Selang 0 hari tidak mungkin (satu tanggal satu pencatatan), tapi kalau
      // data dari server sempat rusak, laju dibiarkan 0 alih-alih Infinity.
      lajuPerPekan: jarakHari > 0 ? bulat((selisih / jarakHari) * HARI_PER_PEKAN) : 0,
    });
  }

  const awal = urut[0];
  const akhir = urut[urut.length - 1];
  return {
    perubahan,
    totalSelisih: urut.length > 1 ? bulat(akhir.nilai - awal.nilai) : null,
    rentangHari: urut.length > 1 ? selisihHariUkuran(awal.tanggal, akhir.tanggal) : null,
    awal,
    akhir,
  };
}

/** Jumlah hari antara dua tanggal `YYYY-MM-DD`, aman terhadap zona waktu. */
function selisihHariUkuran(dari: string, ke: string): number {
  const urai = (t: string) => {
    const [y, m, d] = t.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((urai(ke) - urai(dari)) / 86_400_000);
}

/** Bulatkan ke 0,1 cm — ketelitian meteran kain, bukan lebih. */
function bulat(nilai: number): number {
  return Math.round(nilai * 10) / 10;
}
