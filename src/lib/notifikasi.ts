import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { rencanaPengingatTimbang, tanggalHariIni } from '@recomp/logika';
import type { JamPengingat, JenisNotifikasi } from '@recomp/logika';

/**
 * Notifikasi LOKAL (dijadwalkan di perangkat, tanpa server push).
 *
 * Isinya tidak ditulis di sini: judul & isi datang dari rencana di
 * @recomp/logika, yang mengambilnya dari KATALOG_NOTIFIKASI — tempat nada
 * netral dan larangan angka diperiksa mesin (`npm run cek:widget`).
 *
 * Tanpa suara dan tanpa lencana: pengingat timbang adalah bantuan kebiasaan,
 * bukan alarm. Pratinjau web tidak menjadwalkan apa pun.
 */

export const notifikasiDidukung = Platform.OS === 'ios' || Platform.OS === 'android';

if (notifikasiDidukung) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type IzinNotifikasi = 'diizinkan' | 'ditolak' | 'belum-ditanya';

function bacaIzin(s: Notifications.NotificationPermissionsStatus): IzinNotifikasi {
  if (s.granted || s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'diizinkan';
  return s.canAskAgain ? 'belum-ditanya' : 'ditolak';
}

export async function izinNotifikasi(): Promise<IzinNotifikasi> {
  if (!notifikasiDidukung) return 'ditolak';
  return bacaIzin(await Notifications.getPermissionsAsync());
}

/** Minta izin — dipanggil saat pengguna MENYALAKAN pengingat, bukan saat app dibuka. */
export async function mintaIzinNotifikasi(): Promise<IzinNotifikasi> {
  if (!notifikasiDidukung) return 'ditolak';
  const kini = await Notifications.getPermissionsAsync();
  if (bacaIzin(kini) !== 'belum-ditanya') return bacaIzin(kini);
  return bacaIzin(
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } }),
  );
}

async function batalkanJenis(jenis: JenisNotifikasi): Promise<void> {
  const semua = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    semua
      .filter((n) => (n.content.data as { jenis?: string } | null)?.jenis === jenis)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Jadwalkan ULANG seluruh pengingat timbang: yang lama dibatalkan, rencana
 * baru dipasang. Aman dipanggil berulang (app dibuka, pengaturan berubah).
 * Mengembalikan jumlah notifikasi yang terjadwal.
 */
export async function jadwalkanPengingatTimbang(o: {
  aktif: boolean;
  jadwal: JamPengingat;
  sudahTimbangHariIni: boolean;
  sekarang?: Date;
}): Promise<number> {
  if (!notifikasiDidukung) return 0;
  await batalkanJenis('timbang');
  if (!o.aktif || (await izinNotifikasi()) !== 'diizinkan') return 0;

  const rencana = rencanaPengingatTimbang({
    aktif: true,
    jadwal: o.jadwal,
    hariIni: tanggalHariIni(),
    sekarang: o.sekarang ?? new Date(),
    sudahTimbangHariIni: o.sudahTimbangHariIni,
  });
  for (const r of rencana) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.judul, body: r.isi, data: { jenis: r.jenis, tanggal: r.tanggal }, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.waktu) },
    });
  }
  return rencana.length;
}

/** Berat hari ini tercatat: pengingat HARI INI tidak perlu lagi. Hari lain tetap. */
export async function batalkanPengingatTimbangHariIni(): Promise<void> {
  if (!notifikasiDidukung) return;
  await Notifications.cancelScheduledNotificationAsync(`timbang-${tanggalHariIni()}`);
}
