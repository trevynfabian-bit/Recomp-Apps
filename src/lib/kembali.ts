import { useCallback } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';

/**
 * Induk logis tiap layar tumpukan (docs/desain/peta-navigasi.md): tempat
 * "kembali" bila layar dibuka tanpa riwayat — tautan langsung, URL di web,
 * atau rute yang dipulihkan setelah skema berganti.
 */
const INDUK: Record<string, Href> = {
  '/ukuran': '/tren',
  '/latihan': '/sumber-data',
  '/impor-riwayat': '/pengaturan',
  '/sumber-data': '/pengaturan',
  '/widget-pengingat': '/pengaturan',
  '/target-harian': '/pengaturan',
  '/privasi': '/pengaturan',
  '/hasil-lab': '/pengaturan',
  '/tambah-hasil-lab': '/hasil-lab',
  '/arah-visual': '/pengaturan',
  '/peraga': '/pengaturan',
  '/paritas': '/pengaturan',
};

/**
 * "Kembali" selalu tepat SATU langkah: ke layar sebelumnya bila ada riwayat,
 * atau naik ke induk logisnya bila tidak — tidak pernah diam, tidak pernah
 * melompat ke awal app. Dipakai `HeaderLayar` dan setiap aksi "selesai lalu
 * kembali" (simpan, hapus, batal).
 */
export function useKembali(): () => void {
  const router = useRouter();
  const rute = usePathname();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(INDUK[rute] ?? '/');
  }, [router, rute]);
}
