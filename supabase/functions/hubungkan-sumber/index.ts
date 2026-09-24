/**
 * Edge Function `hubungkan-sumber` — menyambungkan WHOOP, Strava, atau Hevy.
 *
 *   POST { sumber: 'whoop' | 'strava', kode, redirect_uri }
 *   POST { sumber: 'hevy', kunci_api }
 *   → 200 { koneksi: { sumber, status, akun_eksternal, terhubung_pada } }
 *
 * App mendapat kode izin dari layar izin WHOOP/Strava (atau kunci API dari
 * pengaturan Hevy) lalu mengirimnya ke sini. Kode ditukar dengan token di
 * SERVER, memakai client secret yang tidak pernah ada di perangkat; kunci Hevy
 * dicoba sekali ke API Hevy sebelum disimpan. Koneksi & rahasianya ditulis
 * atomik oleh `simpan_koneksi_sumber` (hanya service role). Jawabannya tidak
 * pernah memuat token atau kunci.
 *
 * Rahasia yang dibutuhkan (Supabase → Edge Functions → Secrets):
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 *
 * Memutus sumber tidak lewat sini: app memanggil RPC `putuskan_sumber`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { periksaPermintaanHubungkan, tokenDariJawabanOAuth, URL_TOKEN, type TokenBaru } from '../_shared/sumberLuar.ts';

const KEPALA_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const URL_PROFIL_WHOOP = 'https://api.prod.whoop.com/developer/v1/user/profile/basic';
const URL_CEK_HEVY = 'https://api.hevyapp.com/v1/workouts/count';

function jawab(isi: unknown, status = 200): Response {
  return new Response(JSON.stringify(isi), { status, headers: { ...KEPALA_CORS, 'Content-Type': 'application/json' } });
}

/** Galat yang sudah berupa kalimat untuk pengguna, beserta status HTTP-nya. */
class GalatPengguna extends Error {
  constructor(pesan: string, readonly status: number) {
    super(pesan);
  }
}

async function tukarKode(sumber: 'whoop' | 'strava', kode: string, redirectUri: string): Promise<TokenBaru> {
  const prefiks = sumber.toUpperCase();
  const idKlien = Deno.env.get(`${prefiks}_CLIENT_ID`);
  const rahasiaKlien = Deno.env.get(`${prefiks}_CLIENT_SECRET`);
  if (!idKlien || !rahasiaKlien) {
    // Nama variabelnya sengaja tidak disebut ke klien.
    console.error(`${prefiks}_CLIENT_ID/SECRET belum diset pada Edge Function`);
    throw new GalatPengguna('Sambungan ini belum siap di server. Coba lagi nanti.', 503);
  }
  let r: Response;
  try {
    r = await fetch(URL_TOKEN[sumber], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: kode,
        redirect_uri: redirectUri,
        client_id: idKlien,
        client_secret: rahasiaKlien,
      }),
    });
  } catch {
    throw new GalatPengguna('Layanan ini sedang tidak terjangkau. Coba lagi sebentar lagi.', 502);
  }
  if (r.status === 400 || r.status === 401) {
    throw new GalatPengguna('Kode izin sudah kedaluwarsa atau sudah dipakai. Hubungkan lagi dari awal.', 400);
  }
  if (!r.ok) throw new GalatPengguna('Layanan ini sedang tidak menjawab. Coba lagi sebentar lagi.', 502);
  const token = tokenDariJawabanOAuth(sumber, await r.json());
  if (!token) throw new GalatPengguna('Layanan ini tidak memberi izin akses. Hubungkan lagi dari awal.', 502);

  if (sumber === 'whoop') {
    // Jawaban token WHOOP tidak membawa id pengguna; webhook diarahkan dengan id ini.
    const p = await fetch(URL_PROFIL_WHOOP, { headers: { Authorization: `Bearer ${token.access_token}` } }).catch(() => null);
    const profil = p?.ok ? ((await p.json()) as { user_id?: unknown }) : null;
    if (profil?.user_id == null) throw new GalatPengguna('Profil WHOOP tidak terbaca. Coba lagi sebentar lagi.', 502);
    token.akun_eksternal = String(profil.user_id);
  }
  if (!token.akun_eksternal) throw new GalatPengguna('Akun Strava tidak terbaca. Hubungkan lagi dari awal.', 502);
  return token;
}

async function periksaKunciHevy(kunci: string): Promise<void> {
  let r: Response;
  try {
    r = await fetch(URL_CEK_HEVY, { headers: { 'api-key': kunci, Accept: 'application/json' } });
  } catch {
    throw new GalatPengguna('Hevy sedang tidak terjangkau. Coba lagi sebentar lagi.', 502);
  }
  if (r.status === 401 || r.status === 403) {
    throw new GalatPengguna('Kunci API Hevy tidak dikenali. Salin lagi dari Hevy (Settings → Developer); fitur ini butuh Hevy Pro.', 400);
  }
  if (!r.ok) throw new GalatPengguna('Hevy sedang tidak menjawab. Coba lagi sebentar lagi.', 502);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: KEPALA_CORS });
  if (req.method !== 'POST') return jawab({ galat: 'Metode tidak didukung' }, 405);

  const otorisasi = req.headers.get('Authorization');
  if (!otorisasi) return jawab({ galat: 'Sesi Anda berakhir. Masuk lagi.' }, 401);
  const sebagaiPengguna = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: otorisasi } },
  });
  const { data: sesi } = await sebagaiPengguna.auth.getUser();
  const userId = sesi?.user?.id;
  if (!userId) return jawab({ galat: 'Sesi Anda berakhir. Masuk lagi.' }, 401);

  let badan: unknown;
  try {
    badan = await req.json();
  } catch {
    return jawab({ galat: 'Permintaan tidak lengkap.' }, 400);
  }
  const p = periksaPermintaanHubungkan(badan);
  if ('galat' in p) return jawab({ galat: p.galat }, 400);

  try {
    let token: TokenBaru | null = null;
    if (p.sumber === 'hevy') await periksaKunciHevy(p.kunciApi);
    else token = await tukarKode(p.sumber, p.kode, p.redirectUri);

    const server = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false },
    });
    const { data, error } = await server.rpc('simpan_koneksi_sumber', {
      p_user_id: userId,
      p_sumber: p.sumber,
      p_akun_eksternal: token?.akun_eksternal ?? null,
      p_access_token: token?.access_token ?? null,
      p_refresh_token: token?.refresh_token ?? null,
      p_kedaluwarsa_pada: token?.kedaluwarsa_pada ?? null,
      p_cakupan: token?.cakupan ?? null,
      p_kunci_api: p.sumber === 'hevy' ? p.kunciApi : null,
    });
    if (error) {
      if (error.code === '23505') {
        return jawab({ galat: 'Akun ini sudah terhubung ke akun Recomp lain. Putuskan di sana dulu, lalu coba lagi.' }, 409);
      }
      console.error(`simpan_koneksi_sumber gagal (${error.code})`);
      return jawab({ galat: 'Sambungan belum tersimpan. Coba lagi sebentar lagi.' }, 500);
    }
    const k = data as { sumber: string; status: string; akun_eksternal: string | null; terhubung_pada: string };
    return jawab({
      koneksi: { sumber: k.sumber, status: k.status, akun_eksternal: k.akun_eksternal, terhubung_pada: k.terhubung_pada },
    });
  } catch (e) {
    if (e instanceof GalatPengguna) return jawab({ galat: e.message }, e.status);
    console.error('hubungkan-sumber:', e instanceof Error ? e.message : String(e));
    return jawab({ galat: 'Sambungan belum berhasil. Coba lagi sebentar lagi.' }, 500);
  }
});
