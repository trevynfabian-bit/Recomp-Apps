import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { kodeGagalMasuk, PESAN_GAGAL_MASUK } from '@recomp/logika';
import type { KodeGagalMasuk } from '@recomp/logika';
import { batalkanSemuaPengingat } from '@/lib/notifikasi';
import { mockKeluar, mockKirimAturUlang, mockMasuk, mockPenggunaAwal, type PenggunaTiruan } from '@/mocks/sesi';

/**
 * Sesi login, satu untuk seluruh app.
 *
 * Tata letak akar memakai `status` untuk memilih tumpukan layar: layar masuk
 * saat `keluar`, app saat `masuk`. Tidak ada layar yang memeriksa sesi
 * sendiri-sendiri — pengguna yang keluar tidak bisa "tertinggal" di satu layar
 * yang lupa memeriksa.
 *
 * Fase 4 sisi frontend: backend-nya tiruan (`@/mocks/sesi`) dan sesi dimulai
 * sudah masuk supaya app bisa dijelajahi; task backend menukarnya dengan
 * Supabase Auth (akun yang sama dengan web) tanpa mengubah antarmuka ini.
 */

export class KesalahanMasuk extends Error {
  constructor(readonly kode: KodeGagalMasuk) {
    super(PESAN_GAGAL_MASUK[kode]);
    this.name = 'KesalahanMasuk';
  }
}

type KonteksSesi = {
  status: 'memuat' | 'keluar' | 'masuk';
  pengguna: PenggunaTiruan | null;
  /** Melempar KesalahanMasuk dengan pesan yang layak tampil. */
  masuk: (email: string, sandi: string) => Promise<void>;
  keluar: () => Promise<void>;
  kirimAturUlangSandi: (email: string) => Promise<void>;
};

const Konteks = createContext<KonteksSesi | null>(null);

export function PenyediaSesi({ children }: { children: React.ReactNode }) {
  const [pengguna, setPengguna] = useState<PenggunaTiruan | null>(mockPenggunaAwal);

  const masuk = useCallback(async (email: string, sandi: string) => {
    try {
      setPengguna(await mockMasuk(email, sandi));
    } catch (e) {
      throw new KesalahanMasuk(kodeGagalMasuk(e as { code?: string; status?: number; message?: string }));
    }
  }, []);

  const keluar = useCallback(async () => {
    await mockKeluar();
    // Pengingat lokal milik akun ini; gagal membatalkan tidak menahan keluar.
    await batalkanSemuaPengingat().catch(() => undefined);
    setPengguna(null);
  }, []);

  const nilai = useMemo<KonteksSesi>(
    () => ({
      status: pengguna ? 'masuk' : 'keluar',
      pengguna,
      masuk,
      keluar,
      kirimAturUlangSandi: mockKirimAturUlang,
    }),
    [pengguna, masuk, keluar],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca sesi. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useSesi(): KonteksSesi {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useSesi dipakai di luar <PenyediaSesi>');
  return nilai;
}
