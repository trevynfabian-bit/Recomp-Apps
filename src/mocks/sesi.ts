import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SesiTersimpan } from '@recomp/logika';

/**
 * Autentikasi tiruan (Fase 4, sisi frontend). Antarmukanya sama dengan yang
 * akan dipakai Supabase Auth: galat membawa `code` seperti galat Supabase,
 * sehingga pemetaan pesannya (`kodeGagalMasuk`) sudah diuji sebelum backend ada.
 *
 * Untuk mencoba keadaan gagal:
 *   kata sandi "salah"        → email/kata sandi tidak cocok
 *   email @belum.contoh       → email belum dikonfirmasi
 *   email berawalan "offline" → tidak bisa terhubung
 *
 * Sesinya tersimpan di AsyncStorage (di web: localStorage), jadi app yang
 * dibuka ulang langsung masuk. Supabase Auth menyimpan sesinya sendiri di
 * tempat yang sama; task backend cukup menukar fungsi-fungsi di sini.
 */
export type PenggunaTiruan = { id: string; email: string };

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

const KUNCI_SESI = 'recomp.sesi-tiruan';

/**
 * Penyimpanan bisa gagal (mode privat browser, penyimpanan penuh). Gagal
 * membaca = belum masuk; gagal menulis = sesi hanya bertahan sampai app
 * ditutup. Keduanya tidak boleh menghalangi app dipakai.
 */
export async function mockBacaSesi(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KUNCI_SESI);
  } catch {
    return null;
  }
}

export async function mockSimpanSesi(sesi: SesiTersimpan): Promise<void> {
  try {
    await AsyncStorage.setItem(KUNCI_SESI, JSON.stringify(sesi));
  } catch {
    // Lihat di atas: sesi tetap berlaku di memori.
  }
}

export async function mockHapusSesi(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KUNCI_SESI);
  } catch {
    // Tidak ada yang bisa dilakukan; isi yang tertinggal akan ditolak saat
    // dibaca bila rusak atau berakhir.
  }
}
