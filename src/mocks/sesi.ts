/**
 * Autentikasi tiruan (Fase 4, sisi frontend). Antarmukanya sama dengan yang
 * akan dipakai Supabase Auth: galat membawa `code` seperti galat Supabase,
 * sehingga pemetaan pesannya (`kodeGagalMasuk`) sudah diuji sebelum backend ada.
 *
 * Untuk mencoba keadaan gagal:
 *   kata sandi "salah"        → email/kata sandi tidak cocok
 *   email @belum.contoh       → email belum dikonfirmasi
 *   email berawalan "offline" → tidak bisa terhubung
 */
export type PenggunaTiruan = { id: string; email: string };

export const mockPenggunaAwal: PenggunaTiruan = { id: 'stub-user', email: 'trevyn@contoh.id' };

const JEDA_MS = 900;

export function mockMasuk(email: string, sandi: string): Promise<PenggunaTiruan> {
  return new Promise((selesai, gagal) =>
    setTimeout(() => {
      const e = email.trim().toLowerCase();
      if (e.startsWith('offline')) return gagal({ status: 0, message: 'Failed to fetch' });
      if (e.endsWith('@belum.contoh')) return gagal({ code: 'email_not_confirmed', status: 400 });
      if (sandi === 'salah') return gagal({ code: 'invalid_credentials', status: 400 });
      selesai({ id: 'stub-user', email: e });
    }, JEDA_MS),
  );
}

export function mockKirimAturUlang(_email: string): Promise<void> {
  return new Promise((selesai) => setTimeout(selesai, JEDA_MS));
}

export function mockKeluar(): Promise<void> {
  return new Promise((selesai) => setTimeout(selesai, 300));
}
