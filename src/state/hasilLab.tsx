import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { HasilLab } from '@recomp/logika';
import { mockRiwayatLab, mockSimpanHasilLab } from '@/mocks/hasilLab';

/**
 * Riwayat hasil lab, satu untuk seluruh app: layar riwayat, form tambah,
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

  const nilai = useMemo<KonteksHasilLab>(() => ({ riwayat, tambah }), [riwayat, tambah]);
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca hasil lab. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useHasilLab(): KonteksHasilLab {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useHasilLab dipakai di luar <PenyediaHasilLab>');
  return nilai;
}
