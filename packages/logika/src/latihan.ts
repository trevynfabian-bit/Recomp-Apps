import { awalMinggu } from './budget';
import { formatAngka, formatDesimal } from './format';
import { tanggalDariWaktu } from './percakapan';

/**
 * Latihan yang dibaca dari Hevy: sesi → latihan → set.
 *
 * App ini TIDAK mencatat latihan; Hevy yang mencatat, app membaca. Karena itu
 * tidak ada fungsi di sini yang mengubah set, dan layar yang memakainya hanya
 * menampilkan.
 *
 * Satu-satunya angka turunan adalah e1RM (perkiraan satu repetisi maksimum)
 * dengan rumus Epley — dan ia ESTIMASI, jadi selalu ditandai begitu di UI.
 * PRD membatasinya pada set dengan repetisi ≤ 12: makin banyak repetisi,
 * makin jauh set itu dari beban maksimal, dan rumus apa pun mulai menebak.
 */

/** Batas repetisi untuk e1RM; SAMA dengan aturan `workout_sets.e1rm_kg` di PRD. */
export const MAKS_REPS_E1RM = 12;

/** Jenis set di Hevy. Pemanasan tetap disimpan, tapi bukan bukti kekuatan. */
export type JenisSet = 'normal' | 'warmup' | 'dropset' | 'failure';

/** Satu set seperti yang tersimpan di `workout_sets`. */
export type SetLatihan = {
  set_ke: number;
  /** `null` untuk latihan berat badan (pull-up, dip) tanpa beban tambahan. */
  beban_kg: number | null;
  reps: number;
  /** Dari API Hevy; ekspor CSV lama tidak selalu membawanya. */
  jenis?: JenisSet;
};

export type LatihanDalamSesi = {
  /** Nama latihan persis dari Hevy, mis. "Bench Press (Barbell)". */
  latihan: string;
  sets: SetLatihan[];
};

/** Satu sesi dari Hevy, seperti yang tersimpan di `workouts` + `workout_sets`. */
export type SesiLatihan = {
  id: string;
  /** ISO 8601 waktu mulai; tanggal Asia/Jakarta diturunkan darinya. */
  mulai: string;
  /** Nama rutinitas di Hevy, mis. "Push Day A". */
  nama: string;
  durasi_menit: number;
  latihan: LatihanDalamSesi[];
};

/**
 * e1RM Epley: beban × (1 + reps / 30), dibulatkan satu desimal.
 *
 * `null` bila tidak layak diperkirakan: repetisi di atas 12, repetisi nol, atau
 * tanpa beban (berat badan tidak diketahui per set, dan menebaknya membuat
 * e1RM pull-up berubah setiap kali berat badan naik-turun).
 * Satu repetisi mengembalikan bebannya sendiri — itu memang 1RM-nya, bukan
 * perkiraan yang lebih besar 3%.
 */
export function e1rmEpley(bebanKg: number | null, reps: number): number | null {
  if (bebanKg === null || bebanKg <= 0) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > MAKS_REPS_E1RM) return null;
  if (reps === 1) return bulat1(bebanKg);
  // Dihitung dalam BILANGAN BULAT (gram × (30 + reps), lalu dibagi 3000 untuk
  // mendapat persepuluhan kg). Dengan pecahan biasa, 6,75 kg × 8 = 8,55 tepat
  // tersimpan sebagai 8,549… dan dibulatkan ke 8,5 — sementara `numeric` di SQL,
  // yang akan mengisi `workout_sets.e1rm_kg`, membulatkannya ke 8,6.
  const pembilang = Math.round(bebanKg * 1000) * (30 + reps);
  return Math.floor((pembilang + 1500) / 3000) / 10;
}

/** Pembulatan satu desimal yang sama dengan `Math.round` di tempat lain app. */
function bulat1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Volume satu set: beban × repetisi; set tanpa beban tidak menambah volume. */
function volumeSet(s: SetLatihan): number {
  return s.beban_kg !== null && s.beban_kg > 0 ? s.beban_kg * s.reps : 0;
}

/** Beban gaya Indonesia: "80 kg", "82,5 kg"; berat badan ditulis "BB". */
export function formatBeban(bebanKg: number | null): string {
  if (bebanKg === null || bebanKg <= 0) return 'BB';
  const b = bulat1(bebanKg);
  return `${Number.isInteger(b) ? formatAngka(b) : formatDesimal(b, 1)} kg`;
}

export type RingkasanLatihan = {
  latihan: string;
  jumlahSet: number;
  /**
   * Rangkuman set yang bisa dibaca sekilas: "3 × 8 · 80 kg" bila semua set
   * sama, selain itu daftar per set "80 kg × 8, 85 kg × 6".
   */
  set: string;
  /** e1RM tertinggi dari set yang layak; `null` bila tidak ada satu pun. */
  e1rmKg: number | null;
  /** Set yang menghasilkan e1RM itu, mis. "85 kg × 6"; `null` bila tidak ada. */
  setTerbaik: string | null;
  volumeKg: number;
};

export function ringkasLatihan(l: LatihanDalamSesi): RingkasanLatihan {
  const sets = [...l.sets].sort((a, b) => a.set_ke - b.set_ke);
  const semuaSama =
    sets.length > 1 && sets.every((s) => s.beban_kg === sets[0].beban_kg && s.reps === sets[0].reps);

  let e1rmKg: number | null = null;
  let setTerbaik: string | null = null;
  for (const s of sets) {
    const e = e1rmEpley(s.beban_kg, s.reps);
    if (e !== null && (e1rmKg === null || e > e1rmKg)) {
      e1rmKg = e;
      setTerbaik = `${formatBeban(s.beban_kg)} × ${s.reps}`;
    }
  }

  return {
    latihan: l.latihan,
    jumlahSet: sets.length,
    set: semuaSama
      ? `${sets.length} × ${sets[0].reps} · ${formatBeban(sets[0].beban_kg)}`
      : sets.map((s) => `${formatBeban(s.beban_kg)} × ${s.reps}`).join(', '),
    e1rmKg,
    setTerbaik,
    volumeKg: bulat1(sets.reduce((t, s) => t + volumeSet(s), 0)),
  };
}

export type RingkasanSesi = {
  jumlahLatihan: number;
  jumlahSet: number;
  volumeKg: number;
  latihan: RingkasanLatihan[];
};

export function ringkasSesi(sesi: SesiLatihan): RingkasanSesi {
  const latihan = sesi.latihan.map(ringkasLatihan);
  return {
    jumlahLatihan: latihan.length,
    jumlahSet: latihan.reduce((t, l) => t + l.jumlahSet, 0),
    volumeKg: bulat1(latihan.reduce((t, l) => t + l.volumeKg, 0)),
    latihan,
  };
}

/**
 * Sesi dalam pekan Senin–Minggu yang memuat `hariIni` (Asia/Jakarta), beserta
 * total volumenya — angka utama layar Latihan. Awal pekannya memakai
 * `awalMinggu` yang sama dengan budget mingguan, jadi "pekan ini" berarti hal
 * yang sama di kedua layar.
 */
export function ringkasPekan(
  sesi: SesiLatihan[],
  hariIni: string,
): { jumlahSesi: number; volumeKg: number } {
  const senin = awalMinggu(hariIni);
  const minggu = tambahHari(senin, 6);
  const dalam = sesi.filter((s) => {
    const t = tanggalDariWaktu(s.mulai);
    return t >= senin && t <= minggu;
  });
  return {
    jumlahSesi: dalam.length,
    volumeKg: bulat1(dalam.reduce((t, s) => t + ringkasSesi(s).volumeKg, 0)),
  };
}

function tambahHari(tanggal: string, n: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --- Arah kekuatan (keterangan awam) ---------------------------------------

/**
 * Perubahan di bawah ambang ini dibaca DATAR: e1RM dari satu set berayun
 * beberapa persen antar sesi (tidur, pemanasan, urutan latihan) tanpa kekuatan
 * yang sungguh berubah.
 */
export const AMBANG_ARAH_KEKUATAN = 0.02;

/** 1 / ambang (50): perbandingan ambang tanpa pecahan. */
const PEMBAGI_AMBANG_KEKUATAN = Math.round(1 / AMBANG_ARAH_KEKUATAN);

export type ArahGerakan = {
  latihan: string;
  awalKg: number;
  akhirKg: number;
  /** Selisih e1RM akhir − awal, satu desimal. */
  selisihKg: number;
  arah: 'naik' | 'turun' | 'datar';
  /** Jumlah sesi dengan e1RM untuk gerakan ini. */
  jumlahSesi: number;
};

export type ArahKekuatan = {
  gerakan: ArahGerakan[];
  naik: number;
  turun: number;
  datar: number;
  /** Satu-dua kalimat awam; `null` bila belum ada gerakan yang diulang. */
  kalimat: string | null;
};

/**
 * Arah kekuatan per gerakan dari sesi-sesi yang ada: e1RM sesi TERAKHIR
 * dibanding sesi PERTAMA gerakan itu. Hanya gerakan yang muncul di minimal dua
 * sesi dengan e1RM (satu titik tidak punya arah). Diurutkan: naik, turun, datar,
 * lalu nama.
 */
export function arahKekuatan(sesi: SesiLatihan[]): ArahKekuatan {
  const urut = [...sesi].sort((a, b) => a.mulai.localeCompare(b.mulai));
  const titik = new Map<string, number[]>();
  for (const s of urut) {
    for (const l of s.latihan) {
      const e = ringkasLatihan(l).e1rmKg;
      if (e === null) continue;
      titik.set(l.latihan, [...(titik.get(l.latihan) ?? []), e]);
    }
  }
  const URUT_ARAH = { naik: 0, turun: 1, datar: 2 } as const;
  const gerakan: ArahGerakan[] = [...titik.entries()]
    .filter(([, t]) => t.length >= 2)
    .map(([latihan, t]) => {
      const awalKg = t[0];
      const akhirKg = t[t.length - 1];
      const selisihKg = bulat1(akhirKg - awalKg);
      // Dibandingkan dalam persepuluhan kg (bilangan bulat): 107,1 − 105 dalam
      // pecahan biner adalah 2,0999…, jadi kenaikan TEPAT 2% terbaca datar.
      // `e1rm_epley` di SQL menghitung dengan `numeric`; dengan ini keduanya sama.
      const awal10 = Math.round(awalKg * 10);
      const beda10 = Math.round(akhirKg * 10) - awal10;
      const arah = Math.abs(beda10) * PEMBAGI_AMBANG_KEKUATAN < awal10 ? 'datar' : beda10 > 0 ? 'naik' : 'turun';
      return { latihan, awalKg, akhirKg, selisihKg, arah, jumlahSesi: t.length } as ArahGerakan;
    })
    .sort((a, b) => URUT_ARAH[a.arah] - URUT_ARAH[b.arah] || a.latihan.localeCompare(b.latihan));

  const naik = gerakan.filter((g) => g.arah === 'naik').length;
  const turun = gerakan.filter((g) => g.arah === 'turun').length;
  const datar = gerakan.length - naik - turun;

  let kalimat: string | null = null;
  if (gerakan.length > 0) {
    const dari = `${naik} dari ${gerakan.length} gerakan yang diulang`;
    kalimat =
      naik > turun
        ? `${dari} makin kuat: otot sedang bertambah atau setidaknya terjaga, arah yang dicari saat rekomposisi.`
        : turun > naik
          ? `${turun} dari ${gerakan.length} gerakan yang diulang melemah. Sekali-dua kali wajar (tidur, kelelahan); bila berlanjut dua pekan, periksa asupan protein dan kalori.`
          : `Kekuatan cenderung stabil (${dari} naik). Stabil saat defisit sudah bagus; saat Lean Gain, beban perlu mulai naik.`;
  }
  return { gerakan, naik, turun, datar, kalimat };
}

/**
 * Sumbu kekuatan dalam satu frasa + arahnya, dari `arahKekuatan`. Dipakai
 * kartu Arah kekuatan, sumbu Kekuatan evaluasi 4 pekan, dan jawaban Coach,
 * supaya "x dari y gerakan naik" sama di mana pun ia tampil.
 */
export function ringkasArahKekuatan(a: ArahKekuatan): {
  arah: 'naik' | 'turun' | 'datar' | 'belum jelas';
  teks: string;
} {
  if (a.gerakan.length === 0) return { arah: 'belum jelas', teks: 'belum ada gerakan yang diulang' };
  const arah = a.naik > a.turun ? 'naik' : a.turun > a.naik ? 'turun' : 'datar';
  return { arah, teks: `${a.naik} dari ${a.gerakan.length} gerakan naik` };
}
