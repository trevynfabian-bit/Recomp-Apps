/**
 * Webhook WHOOP (API v2).
 *
 * WHOOP menandatangani setiap peristiwa: base64(HMAC-SHA256(cap_waktu +
 * badan_mentah, client_secret)) di `X-WHOOP-Signature`, cap waktunya di
 * `X-WHOOP-Signature-Timestamp`. Tanda tangan diperiksa atas badan MENTAH
 * sebelum apa pun diurai; cap waktu yang lebih tua dari lima menit ditolak
 * supaya peristiwa lama tidak bisa diputar ulang.
 *
 * WHOOP memberi SATU detik untuk menjawab: peristiwa dijawab 200 segera,
 * pekerjaannya di latar. Sama seperti Strava, isi peristiwa hanya menunjuk
 * objek; angkanya diambil dari API WHOOP dengan token pemiliknya.
 *
 *   workout.updated  → latihan + energi (kJ → kcal)
 *   sleep.updated    → tidur (ringan + dalam + REM)
 *   recovery.updated → recovery, HR istirahat, HRV — `id` = id TIDUR (v2);
 *                      recovery diambil lewat siklus tidur itu
 *   *.deleted        → hapus hanya jenis yang bersangkutan
 *
 * Penyebaran (tanpa rahasia di repo):
 *   supabase secrets set WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=...
 *   supabase functions deploy webhook-whoop --no-verify-jwt
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  kirimanHapusRecoveryWhoop,
  kirimanHapusTidurWhoop,
  kirimanHapusWorkoutWhoop,
  kirimanRecoveryWhoop,
  kirimanTidurWhoop,
  kirimanWorkoutWhoop,
} from '../_shared/logika/index.ts';
import type { KirimanLuar, RecoveryWhoop, TidurWhoop, WorkoutWhoop } from '../_shared/logika/index.ts';
import {
  ambilJson,
  jalankanDiLatar,
  kirimKeDb,
  koneksiAkun,
  tandaTanganWhoopSah,
  tanganiGalat,
  tokenAkses,
} from '../_shared/sumberLuar.ts';

const API = 'https://api.prod.whoop.com/developer/v2';

type PeristiwaWhoop = {
  user_id: number;
  id: string | number;
  type: string;
  trace_id?: string;
};

function jawab(badan: unknown, status = 200): Response {
  return new Response(JSON.stringify(badan), { status, headers: { 'Content-Type': 'application/json' } });
}

function klienServer() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Ambil objek yang ditunjuk peristiwa dan ubah menjadi kiriman. */
async function susunKiriman(p: PeristiwaWhoop, token: string): Promise<KirimanLuar | null> {
  const id = String(p.id);
  switch (p.type) {
    case 'workout.updated': {
      const w = await ambilJson<WorkoutWhoop>(`${API}/activity/workout/${id}`, token);
      return w ? kirimanWorkoutWhoop(w) : kirimanHapusWorkoutWhoop(id);
    }
    case 'workout.deleted':
      return kirimanHapusWorkoutWhoop(id);
    case 'sleep.updated': {
      const s = await ambilJson<TidurWhoop>(`${API}/activity/sleep/${id}`, token);
      return s ? kirimanTidurWhoop(s) : kirimanHapusTidurWhoop(id);
    }
    case 'sleep.deleted':
      return kirimanHapusTidurWhoop(id);
    case 'recovery.updated': {
      const s = await ambilJson<TidurWhoop>(`${API}/activity/sleep/${id}`, token);
      if (!s) return kirimanHapusRecoveryWhoop(id);
      const r = await ambilJson<RecoveryWhoop>(`${API}/cycle/${s.cycle_id}/recovery`, token);
      return r ? kirimanRecoveryWhoop(r, s) : kirimanHapusRecoveryWhoop(id);
    }
    case 'recovery.deleted':
      return kirimanHapusRecoveryWhoop(id);
    default:
      return null;
  }
}

async function proses(p: PeristiwaWhoop): Promise<void> {
  const db = klienServer();
  const akun = String(p.user_id);
  const koneksi = await koneksiAkun(db, 'whoop', akun);
  if (!koneksi) return;

  try {
    const token = await tokenAkses(db, 'whoop', koneksi);
    const kiriman = await susunKiriman(p, token);
    if (kiriman) await kirimKeDb(db, 'whoop', akun, kiriman);
  } catch (e) {
    await tanganiGalat(db, 'whoop', akun, e);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  const badanMentah = await req.text();
  const sah = await tandaTanganWhoopSah(
    badanMentah,
    req.headers.get('X-WHOOP-Signature-Timestamp'),
    req.headers.get('X-WHOOP-Signature'),
    Deno.env.get('WHOOP_CLIENT_SECRET') ?? '',
  );
  if (!sah) return jawab({ galat: 'Tanda tangan tidak sah' }, 401);

  let p: PeristiwaWhoop;
  try {
    p = JSON.parse(badanMentah) as PeristiwaWhoop;
  } catch {
    return jawab({ galat: 'Badan bukan JSON' }, 400);
  }
  if (!Number.isSafeInteger(p.user_id) || p.id == null || typeof p.type !== 'string') {
    return jawab({ galat: 'Peristiwa tidak lengkap' }, 400);
  }

  jalankanDiLatar('whoop', () => proses(p));
  return jawab({ diterima: true });
});
