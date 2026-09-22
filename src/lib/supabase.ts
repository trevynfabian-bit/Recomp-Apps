import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import type { Database } from '@/types/database';

/**
 * Klien Supabase untuk proyek yang SUDAH ADA (dipakai bersama web Next.js).
 * Nilainya dibaca dari environment variable ber-prefix `EXPO_PUBLIC_`, yang
 * ikut ter-bundle ke aplikasi — jadi HANYA anon key yang boleh ditaruh di sini,
 * tidak pernah service-role key. Isolasi data bersandar pada RLS, bukan pada
 * kerahasiaan anon key.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** true bila kredensial sudah diisi; dipakai layar untuk jatuh ke data tiruan. */
export const supabaseSiap = Boolean(url && anonKey);

if (!supabaseSiap && __DEV__) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY belum diisi. ' +
      'Salin .env.example menjadi .env.local lalu isi dari dashboard Supabase.',
  );
}

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'anon-key-belum-diisi',
  {
    auth: {
      // Sesi disimpan di perangkat supaya pengguna tidak login berulang kali.
      // Di web, AsyncStorage tidak tersedia saat render server; biarkan default.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Tidak ada alur OAuth berbasis URL di rilis awal.
      detectSessionInUrl: false,
    },
  },
);
