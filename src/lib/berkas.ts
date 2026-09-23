import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { Platform } from 'react-native';
import type { BerkasEkspor } from '@recomp/logika';

/** Kemas berkas-berkas teks menjadi satu ZIP (di memori). */
export function buatZip(berkas: BerkasEkspor[]): Uint8Array {
  return zipSync(Object.fromEntries(berkas.map((b) => [b.nama, strToU8(b.isi)])), { level: 6 });
}

/**
 * Serahkan ZIP kepada pengguna.
 *
 * iOS/Android: ditulis ke cache app, dibuka di lembar bagikan sistem (Simpan
 * ke Files, AirDrop, email), lalu DIHAPUS begitu lembarnya ditutup — salinan
 * data kesehatan tidak dibiarkan tertinggal di cache. Web: diunduh sebagai
 * berkas; URL sementaranya dicabut setelahnya.
 */
export async function serahkanZip(nama: string, isi: Uint8Array): Promise<'dibagikan' | 'diunduh'> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([isi as BlobPart], { type: 'application/zip' }));
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = nama;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return 'diunduh';
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('Lembar bagikan tidak tersedia di perangkat ini');
  const berkas = new File(Paths.cache, nama);
  if (berkas.exists) berkas.delete();
  berkas.create();
  berkas.write(isi);
  try {
    await Sharing.shareAsync(berkas.uri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: 'Ekspor data Recomp Coach',
    });
  } finally {
    if (berkas.exists) berkas.delete();
  }
  return 'dibagikan';
}
