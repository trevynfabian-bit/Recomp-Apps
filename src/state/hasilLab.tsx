import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { HasilLab } from '@recomp/logika';
import { mockRiwayatLab, mockSimpanHasilLab } from '@/mocks/hasilLab';

/**
 * Riwayat hasil lab, satu untuk seluruh app: layar riwayat, form tambah/ubah,
 * baris Pengaturan, dan ekspor membaca daftar yang sama — hasil yang baru
 * ditambahkan langsung ada di keempatnya.
 *
 * Fase 4 sisi frontend: tiruan di memori; task backend menukarnya dengan
 * tabel hasil lab di Supabase tanpa mengubah antarmuka ini.
 */
type KonteksHasilLab = {
  riwayat: HasilLab[];
  /** Simpan hasil baru; melempar bila gagal. Mengembalikan hasil yang tersimpan. */
  tambah: (hasil: Omit<HasilLab, 'id'>) => Promise<HasilLab>;
  /** Ganti isi satu entri; melempar bila gagal (entri lama tetap). */
  ubah: (id: string, hasil: Omit<HasilLab, 'id'>) => Promise<void>;
  /** Hapus satu entri; melempar bila gagal (entri tetap ada). */
  hapus: (id: string) => Promise<void>;
};

const Konteks = createContext<KonteksHasilLab | null>(null);

export function PenyediaHasilLab({ children }: { children: React.ReactNode }) {
  const [riwayat, setRiwayat] = useState<HasilLab[]>(mockRiwayatLab);

  const tambah = useCallback(async (hasil: Omit<HasilLab, 'id'>) => {
    await mockSimpanHasilLab();
    const baru: HasilLab = { ...hasil, id: `lab-${Date.now()}` };
    setRiwayat((r) => [...r, baru]);
    return baru;
  }, []);

  const ubah = useCallback(async (id: string, hasil: Omit<HasilLab, 'id'>) => {
    await mockSimpanHasilLab();
    setRiwayat((r) => r.map((h) => (h.id === id ? { ...hasil, id } : h)));
  }, []);

  const hapus = useCallback(async (id: string) => {
    await mockSimpanHasilLab();
    setRiwayat((r) => r.filter((h) => h.id !== id));
  }, []);

  const nilai = useMemo<KonteksHasilLab>(() => ({ riwayat, tambah, ubah, hapus }), [riwayat, tambah, ubah, hapus]);
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca hasil lab. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useHasilLab(): KonteksHasilLab {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useHasilLab dipakai di luar <PenyediaHasilLab>');
  return nilai;
}
