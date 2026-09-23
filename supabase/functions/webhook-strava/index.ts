/**
 * Webhook Strava.
 *
 *   GET  — validasi langganan: Strava mengirim `hub.challenge` dan
 *          `hub.verify_token`; kita menggemakan tantangannya bila tokennya cocok.
 *   POST — peristiwa aktivitas/atlet. Dijawab 200 SEGERA (Strava memberi 2
 *          detik), pekerjaannya dijalankan di latar.
 *
 * Webhook Strava TIDAK ditandatangani. Karena itu:
 *   • peristiwa harus membawa `subscription_id` milik kita;
 *   • angka tidak pernah diambil dari isi peristiwa — aktivitasnya diambil
 *     ulang dari API Strava dengan token pemiliknya;
 *   • "hapus" hanya dijalankan bila API Strava sendiri menjawab 404, dan
 *     "izin dicabut" hanya bila API menolak token pemiliknya. Peristiwa palsu
 *     paling jauh membuat kita membaca ulang data asli.
 *
 * Waktu diteruskan UTC apa adanya; tanggal WIB diturunkan database.
 *
 * Penyebaran (tanpa rahasia di repo):
 *   supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... \
 *     STRAVA_VERIFY_TOKEN=... STRAVA_SUBSCRIPTION_ID=...
 *   supabase functions deploy webhook-strava --no-verify-jwt
 * `--no-verify-jwt` wajib: Strava tidak membawa JWT Supabase. Pintu ini
 * dijaga token verifikasi, id langganan, dan pembuktian ke API di atas.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { kirimanAktivitasStrava, kirimanHapusStrava } from '../_shared/logika/index.ts';
import type { AktivitasStrava } from '../_shared/logika/index.ts';
import {
  ambilJson,
  jalankanDiLatar,
  kirimKeDb,
  koneksiAkun,
  samaWaktuTetap,
  tanganiGalat,
  tokenAkses,
} from '../_shared/sumberLuar.ts';

const API = 'https://www.strava.com/api/v3';

type PeristiwaStrava = {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
};

function jawab(badan: unknown, status = 200): Response {
  return new Response(JSON.stringify(badan), { status, headers: { 'Content-Type': 'application/json' } });
}

function klienServer() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function proses(p: PeristiwaStrava): Promise<void> {
  const db = klienServer();
  const akun = String(p.owner_id);
  const koneksi = await koneksiAkun(db, 'strava', akun);
  // Atlet yang tidak (lagi) terhubung: tidak ada yang perlu dilakukan.
  if (!koneksi) return;

  try {
    const token = await tokenAkses(db, 'strava', koneksi);

    if (p.object_type === 'athlete') {
      if (p.updates?.authorized === 'false') {
        // Dibuktikan dulu: token yang masih diterima API berarti peristiwa ini palsu.
        await ambilJson(`${API}/athlete`, token);
        console.warn(`[strava] peristiwa izin-dicabut untuk ${akun}, tapi token masih diterima; diabaikan`);
      }
      return;
    }

    if (p.object_type !== 'activity') return;
    const aktivitas = await ambilJson<AktivitasStrava>(`${API}/activities/${p.object_id}`, token);

    if (aktivitas === null) {
      // 404 dari Strava sendiri: aktivitasnya memang sudah tidak ada (dihapus,
      // atau dijadikan privat tanpa izin read_all).
      await kirimKeDb(db, 'strava', akun, kirimanHapusStrava(p.object_id));
      return;
    }
    if (p.aspect_type === 'delete') {
      console.warn(`[strava] peristiwa hapus ${p.object_id}, tapi aktivitasnya masih ada; diabaikan`);
      return;
    }
    await kirimKeDb(db, 'strava', akun, kirimanAktivitasStrava(aktivitas));
  } catch (e) {
    await tanganiGalat(db, 'strava', akun, e);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const tantangan = url.searchParams.get('hub.challenge');
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const seharusnya = Deno.env.get('STRAVA_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && tantangan && seharusnya && (await samaWaktuTetap(token, seharusnya))) {
      return jawab({ 'hub.challenge': tantangan });
    }
    return jawab({ galat: 'Tidak berwenang' }, 403);
  }

  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  let p: PeristiwaStrava;
  try {
    p = (await req.json()) as PeristiwaStrava;
  } catch {
    return jawab({ galat: 'Badan bukan JSON' }, 400);
  }

  const langganan = Deno.env.get('STRAVA_SUBSCRIPTION_ID') ?? '';
  if (!langganan || !(await samaWaktuTetap(String(p.subscription_id ?? ''), langganan))) {
    return jawab({ galat: 'Langganan tidak dikenal' }, 403);
  }
  if (!Number.isSafeInteger(p.owner_id) || !Number.isSafeInteger(p.object_id)) {
    return jawab({ galat: 'Peristiwa tidak lengkap' }, 400);
  }

  jalankanDiLatar('strava', () => proses(p));
  return jawab({ diterima: true });
});
