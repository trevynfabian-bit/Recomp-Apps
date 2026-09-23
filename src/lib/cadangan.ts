import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Salinan terakhir data yang dimuat dari server, per akun, di perangkat.
 *
 * Dipakai supaya app yang dibuka tanpa sinyal tetap bisa dipakai dengan
 * angka yang terakhir diketahui, bukan tertahan di layar memuat. Isinya
 * data milik akun itu saja (kunci memuat id pengguna), dan SEMUA salinan
 * dihapus saat keluar (`hapusSemuaCadangan`, dipanggil penyedia sesi).
 *
 * Penyimpanan bisa gagal (mode privat, penuh): gagal membaca = tidak ada
 * salinan, gagal menulis = tidak ada salinan berikutnya. Keduanya tidak
 * menghalangi app.
 */
const AWALAN = 'recomp.cadangan.';
const VERSI = 1;

const kunci = (nama: string, penggunaId: string) => `${AWALAN}${nama}.${penggunaId}`;

export async function bacaCadangan(nama: string, penggunaId: string): Promise<unknown> {
  try {
    const teks = await AsyncStorage.getItem(kunci(nama, penggunaId));
    if (!teks) return null;
    const isi = JSON.parse(teks) as { versi?: unknown; data?: unknown };
    return isi && isi.versi === VERSI ? (isi.data ?? null) : null;
  } catch {
    return null;
  }
}

export async function simpanCadangan(nama: string, penggunaId: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(kunci(nama, penggunaId), JSON.stringify({ versi: VERSI, data }));
  } catch {
    // Lihat di atas.
  }
}

export async function hapusSemuaCadangan(): Promise<void> {
  try {
    const semua = await AsyncStorage.getAllKeys();
    const milikApp = semua.filter((k) => k.startsWith(AWALAN));
    if (milikApp.length > 0) await AsyncStorage.multiRemove(milikApp);
  } catch {
    // Salinan yang tertinggal berkunci id akun lama; tidak terbaca akun lain.
  }
}
