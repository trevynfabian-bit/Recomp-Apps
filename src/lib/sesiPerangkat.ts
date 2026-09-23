import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SesiTersimpan } from '@recomp/logika';

/**
 * Catatan sesi milik app di perangkat (batas 30 hari yang menggeser, lihat
 * `pulihkanSesi`). Terpisah dari token Supabase, yang disimpan Supabase
 * sendiri; catatan ini gerbangnya (`putuskanSesi`).
 *
 * Penyimpanan bisa gagal (mode privat browser, penyimpanan penuh). Gagal
 * membaca = belum masuk; gagal menulis = sesi hanya bertahan sampai app
 * ditutup. Keduanya tidak boleh menghalangi app dipakai.
 */
export type PenyimpananSesi = {
  baca: () => Promise<string | null>;
  simpan: (sesi: SesiTersimpan) => Promise<void>;
  hapus: () => Promise<void>;
};

export function penyimpananSesi(kunci: string): PenyimpananSesi {
  return {
    async baca() {
      try {
        return await AsyncStorage.getItem(kunci);
      } catch {
        return null;
      }
    },
    async simpan(sesi) {
      try {
        await AsyncStorage.setItem(kunci, JSON.stringify(sesi));
      } catch {
        // Lihat di atas: sesi tetap berlaku di memori.
      }
    },
    async hapus() {
      try {
        await AsyncStorage.removeItem(kunci);
      } catch {
        // Tidak ada yang bisa dilakukan; isi yang tertinggal akan ditolak saat
        // dibaca bila rusak atau berakhir.
      }
    },
  };
}
