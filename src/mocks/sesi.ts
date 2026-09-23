import type { AuthApp, Pengguna } from '@/data/auth';
import { penyimpananSesi } from '@/lib/sesiPerangkat';

/**
 * Autentikasi tiruan. Antarmukanya `AuthApp`, sama dengan `authSupabase`:
 * galat membawa `code` seperti galat Supabase, sehingga pemetaan pesannya
 * (`kodeGagalMasuk`) teruji juga tanpa server.
 *
 * Untuk mencoba keadaan gagal (masuk; tiga terakhir juga tautan atur ulang):
 *   kata sandi "salah"         → email/kata sandi tidak cocok
 *   email @belum.contoh        → email belum dikonfirmasi
 *   email berawalan "nonaktif" → akun dinonaktifkan
 *   email berawalan "batas"    → percobaan dibatasi
 *   email berawalan "server"   → server tidak menjawab
 *   email berawalan "offline"  → tidak bisa terhubung
 *
 * Dipakai hanya bila kredensial Supabase belum diisi (`supabaseSiap`), mis.
 * saat mencoba app di web tanpa proyek Supabase. Catatan sesinya tersimpan
 * di AsyncStorage (di web: localStorage), jadi app yang dibuka ulang langsung
 * masuk.
 */
const JEDA_MS = 900;

export function mockMasuk(email: string, sandi: string): Promise<Pengguna> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      const e = email.trim().toLowerCase();
      const galat = galatTiruan(e, 'over_request_rate_limit');
      if (galat) return gagal(galat);
      if (e.endsWith('@belum.contoh')) return gagal({ code: 'email_not_confirmed', status: 400 });
      if (e.startsWith('nonaktif')) return gagal({ code: 'user_banned', status: 403 });
      if (sandi === 'salah') return gagal({ code: 'invalid_credentials', status: 400 });
      // Id per email: berganti akun benar-benar berganti pengguna.
      selesai({ id: `tiruan:${e}`, email: e });
    }, JEDA_MS),
  );
}

export function mockKirimAturUlang(email: string): Promise<void> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      const galat = galatTiruan(email.trim().toLowerCase(), 'over_email_send_rate_limit');
      if (galat) return gagal(galat);
      selesai();
    }, JEDA_MS),
  );
}

/** Galat yang sama untuk masuk & atur ulang, berbentuk galat Supabase. */
function galatTiruan(email: string, kodeBatas: string): { code?: string; status: number; message?: string } | null {
  const luring = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (luring || email.startsWith('offline')) return { status: 0, message: 'Failed to fetch' };
  if (email.startsWith('batas')) return { code: kodeBatas, status: 429 };
  if (email.startsWith('server')) return { status: 503, message: 'Service Unavailable' };
  return null;
}

/** Mencabut sesi di server. Gagal bila perangkat luring (untuk mencoba jalur itu di web). */
export function mockKeluar(): Promise<void> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return gagal({ status: 0, message: 'Failed to fetch' });
      }
      selesai();
    }, 300),
  );
}

/**
 * Pengganti `authSupabase` saat kredensial Supabase belum diisi. Tanpa server
 * tidak ada yang bisa dipastikan, jadi catatan app sendiri yang menentukan.
 * Kuncinya berbeda dari catatan sesi sungguhan, jadi keduanya tidak tercampur.
 */
export const authTiruan: AuthApp = {
  masuk: mockMasuk,
  keluar: mockKeluar,
  kirimAturUlang: mockKirimAturUlang,
  sesiServer: async () => ({ ada: 'tidak-pasti' }),
  async bersihkan() {},
  dengarkanBerakhir: () => () => undefined,
  catatan: penyimpananSesi('recomp.sesi-tiruan'),
};
