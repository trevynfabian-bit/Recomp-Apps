import type { JenisOlahraga } from './tipe';

/**
 * Normalisasi kiriman Strava & WHOOP menjadi bentuk yang diterima
 * `terima_kiriman_luar` (SQL).
 *
 * Yang SENGAJA tidak dilakukan di sini: mengubah waktu menjadi tanggal.
 * Waktu diteruskan apa adanya (UTC dari Strava, UTC dari WHOOP), dan tanggal
 * Asia/Jakarta diturunkan DATABASE — untuk latihan lewat CHECK, untuk
 * health_data lewat kolom turunan. Satu tempat konversi berarti tidak ada
 * penulis yang bisa lupa: lari pukul 05.30 WIB (22.30 UTC kemarin) selalu
 * jatuh di hari yang benar, siapa pun yang menulisnya.
 *
 * Dua jebakan satuan yang ditangani di sini:
 *   • WHOOP melaporkan energi dalam KILOJOULE. 2.092 kJ adalah 500 kcal;
 *     menyimpannya sebagai kcal membuat satu sesi terbaca empat kali lipat.
 *   • Strava & WHOOP memakai detik/milidetik; app memakai menit.
 */

/** 1 kcal = 4,184 kJ. */
export const KJ_PER_KCAL = 4.184;

/** Latihan dari layanan luar, siap untuk tabel `workouts`. */
export type LatihanLuar = {
  /** Id di layanan asal; kunci dedup per sumber. */
  id: string;
  nama: string;
  jenis: JenisOlahraga;
  /** ISO 8601 dengan zona (UTC). Tanggal WIB diturunkan database. */
  mulai: string;
  durasi_menit: number | null;
};

/** Angka kesehatan dari layanan luar, siap untuk `health_data`. */
export type DataLuar = {
  jenis: 'kalori_aktif' | 'tidur' | 'hr_istirahat' | 'hrv' | 'recovery';
  id: string;
  nilai: number;
  mulai: string;
  selesai?: string | null;
};

/** Satu kiriman untuk `terima_kiriman_luar`. */
export type KirimanLuar = {
  latihan?: LatihanLuar[];
  data?: DataLuar[];
  hapus_latihan?: string[];
  hapus_data?: { id: string; jenis: DataLuar['jenis'] }[];
};

/** Tambah detik ke waktu ISO, hasil ISO UTC. */
export function tambahDetik(iso: string, detik: number): string {
  return new Date(Date.parse(iso) + detik * 1000).toISOString();
}

function menit(detik: number | null | undefined): number | null {
  if (detik == null || !Number.isFinite(detik) || detik < 0) return null;
  return Math.min(1440, Math.round(detik / 60));
}

// ---------------------------------------------------------------------------
// Strava
// ---------------------------------------------------------------------------

/** Bagian aktivitas Strava (DetailedActivity) yang dipakai. */
export type AktivitasStrava = {
  id: number;
  name: string;
  sport_type?: string;
  /** Bidang lama; dipakai bila `sport_type` tidak ada. */
  type?: string;
  /** UTC, mis. "2026-09-15T22:30:00Z". */
  start_date: string;
  elapsed_time: number;
  moving_time?: number;
  /** Hanya ada di representasi terperinci; bisa 0 bila tanpa sensor. */
  calories?: number;
};

const LARI_STRAVA = new Set(['Run', 'TrailRun', 'VirtualRun']);
const BEBAN_STRAVA = new Set(['WeightTraining']);
const PADEL_STRAVA = new Set(['Padel']);

/** Jenis olahraga app dari `sport_type` Strava. */
export function jenisOlahragaStrava(sportType: string | undefined): JenisOlahraga {
  if (!sportType) return 'lainnya';
  if (LARI_STRAVA.has(sportType)) return 'lari';
  if (BEBAN_STRAVA.has(sportType)) return 'angkat_beban';
  if (PADEL_STRAVA.has(sportType)) return 'padel';
  return 'lainnya';
}

/**
 * Satu aktivitas Strava → satu latihan + (bila ada) energinya. Energi
 * aktivitas masuk sebagai `kalori_aktif` per aktivitas; anti-dobel memilih
 * sumber harian yang dihitung, jadi energi ini tidak pernah ditambahkan ke
 * total jam tangan.
 */
export function kirimanAktivitasStrava(a: AktivitasStrava): KirimanLuar {
  const id = String(a.id);
  const kiriman: KirimanLuar = {
    latihan: [
      {
        id,
        nama: (a.name ?? '').trim().slice(0, 120) || 'Aktivitas Strava',
        jenis: jenisOlahragaStrava(a.sport_type ?? a.type),
        mulai: a.start_date,
        durasi_menit: menit(a.moving_time ?? a.elapsed_time),
      },
    ],
    data: [],
  };
  if (a.calories != null && Number.isFinite(a.calories) && a.calories > 0) {
    kiriman.data!.push({
      jenis: 'kalori_aktif',
      id,
      nilai: Math.round(a.calories),
      mulai: a.start_date,
      selesai: tambahDetik(a.start_date, a.elapsed_time),
    });
  }
  return kiriman;
}

/** Aktivitas Strava dihapus: latihan & energinya ikut hilang. */
export function kirimanHapusStrava(idAktivitas: number | string): KirimanLuar {
  const id = String(idAktivitas);
  return { hapus_latihan: [id], hapus_data: [{ id, jenis: 'kalori_aktif' }] };
}

// ---------------------------------------------------------------------------
// WHOOP (API v2)
// ---------------------------------------------------------------------------

type StatusSkor = 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

export type WorkoutWhoop = {
  id: string;
  start: string;
  end: string;
  sport_name?: string;
  score_state: StatusSkor;
  score?: { kilojoule?: number; strain?: number } | null;
};

export type TidurWhoop = {
  id: string;
  cycle_id: number;
  start: string;
  end: string;
  nap: boolean;
  score_state: StatusSkor;
  score?: {
    stage_summary?: {
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
  } | null;
};

export type RecoveryWhoop = {
  cycle_id: number;
  sleep_id: string;
  score_state: StatusSkor;
  score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number } | null;
};

/** Normalisasi nama olahraga WHOOP: "Functional-Fitness" → "functional fitness". */
function namaWhoop(s: string | undefined): string {
  return (s ?? '').toLowerCase().replace(/[-_]+/g, ' ').trim();
}

const LARI_WHOOP = new Set(['running', 'track & field']);
const BEBAN_WHOOP = new Set(['weightlifting', 'powerlifting', 'strength trainer']);
const PADEL_WHOOP = new Set(['padel']);

export function jenisOlahragaWhoop(sportName: string | undefined): JenisOlahraga {
  const n = namaWhoop(sportName);
  if (LARI_WHOOP.has(n)) return 'lari';
  if (BEBAN_WHOOP.has(n)) return 'angkat_beban';
  if (PADEL_WHOOP.has(n)) return 'padel';
  return 'lainnya';
}

/** Kilojoule → kcal, dibulatkan. */
export function kcalDariKj(kj: number): number {
  return Math.round(kj / KJ_PER_KCAL);
}

/**
 * Workout WHOOP. Latihannya selalu dikirim (supaya tipe hari terdeteksi
 * segera); energinya hanya setelah WHOOP selesai MENILAI — angka sebelum itu
 * belum final, dan `workout.updated` berikutnya membawa yang final.
 */
export function kirimanWorkoutWhoop(w: WorkoutWhoop): KirimanLuar {
  const nama = namaWhoop(w.sport_name);
  const durasi = (Date.parse(w.end) - Date.parse(w.start)) / 1000;
  const kiriman: KirimanLuar = {
    latihan: [
      {
        id: w.id,
        nama: nama ? nama.charAt(0).toUpperCase() + nama.slice(1) : 'Aktivitas WHOOP',
        jenis: jenisOlahragaWhoop(w.sport_name),
        mulai: w.start,
        durasi_menit: menit(durasi),
      },
    ],
    data: [],
  };
  const kj = w.score?.kilojoule;
  if (w.score_state === 'SCORED' && kj != null && Number.isFinite(kj) && kj > 0) {
    kiriman.data!.push({ jenis: 'kalori_aktif', id: w.id, nilai: kcalDariKj(kj), mulai: w.start, selesai: w.end });
  }
  return kiriman;
}

export function kirimanHapusWorkoutWhoop(id: string): KirimanLuar {
  return { hapus_latihan: [id], hapus_data: [{ id, jenis: 'kalori_aktif' }] };
}

/**
 * Tidur WHOOP: waktu TIDUR sebenarnya (ringan + dalam + REM), bukan waktu di
 * ranjang. Tidur siang ikut sebagai sesi tersendiri; health_data menjumlahkan
 * sesi dari sumber yang sama.
 */
export function kirimanTidurWhoop(s: TidurWhoop): KirimanLuar {
  if (s.score_state !== 'SCORED' || !s.score?.stage_summary) return {};
  const t = s.score.stage_summary;
  const milli =
    (t.total_light_sleep_time_milli ?? 0) + (t.total_slow_wave_sleep_time_milli ?? 0) + (t.total_rem_sleep_time_milli ?? 0);
  if (milli <= 0) return {};
  return { data: [{ jenis: 'tidur', id: s.id, nilai: Math.round(milli / 60_000), mulai: s.start, selesai: s.end }] };
}

export function kirimanHapusTidurWhoop(id: string): KirimanLuar {
  return { hapus_data: [{ id, jenis: 'tidur' }] };
}

/**
 * Recovery WHOOP. Waktunya adalah waktu BANGUN dari tidur yang mendasarinya:
 * recovery pagi ini milik hari ini, walau tidurnya mulai kemarin malam.
 * Id-nya id tidur (webhook v2 mengirim id tidur untuk recovery).
 */
export function kirimanRecoveryWhoop(r: RecoveryWhoop, tidur: Pick<TidurWhoop, 'id' | 'end'>): KirimanLuar {
  if (r.score_state !== 'SCORED' || !r.score) return {};
  const data: DataLuar[] = [];
  const bangun = tidur.end;
  if (r.score.recovery_score != null) {
    data.push({ jenis: 'recovery', id: tidur.id, nilai: Math.round(r.score.recovery_score), mulai: bangun });
  }
  if (r.score.resting_heart_rate != null) {
    data.push({ jenis: 'hr_istirahat', id: tidur.id, nilai: Math.round(r.score.resting_heart_rate), mulai: bangun });
  }
  if (r.score.hrv_rmssd_milli != null) {
    data.push({ jenis: 'hrv', id: tidur.id, nilai: Math.round(r.score.hrv_rmssd_milli * 10) / 10, mulai: bangun });
  }
  return { data };
}

export function kirimanHapusRecoveryWhoop(idTidur: string): KirimanLuar {
  return {
    hapus_data: [
      { id: idTidur, jenis: 'recovery' },
      { id: idTidur, jenis: 'hr_istirahat' },
      { id: idTidur, jenis: 'hrv' },
    ],
  };
}
