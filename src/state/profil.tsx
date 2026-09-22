import { createContext, useContext, useMemo, useState } from 'react';
import type { Fase } from '@recomp/logika';
import { mockProfile } from '@/mocks/dailyLog';
import type { Profile } from '@/types/domain';

/**
 * Profil pengguna beserta fase aktifnya, dibagikan ke seluruh layar.
 *
 * Fase harus hidup di satu tempat karena ia mengubah BANYAK hal sekaligus:
 * target harian, koridor tren, dan budget mingguan. Kalau tiap layar memegang
 * salinannya sendiri, mengganti fase di satu layar akan meninggalkan layar lain
 * menampilkan angka fase lama — persis jenis ketidakcocokan yang paling sulit
 * disadari pengguna.
 *
 * Fase 1 menyimpannya di memori saja; task backend menukar isinya dengan
 * `profiles.fase_aktif` di Supabase tanpa mengubah antarmuka hook ini.
 */
type KonteksProfil = {
  profil: Profile;
  gantiFase: (fase: Fase) => void;
};

const Konteks = createContext<KonteksProfil | null>(null);

export function PenyediaProfil({ children }: { children: React.ReactNode }) {
  const [profil, setProfil] = useState<Profile>(mockProfile);

  const nilai = useMemo<KonteksProfil>(
    () => ({
      profil,
      gantiFase: (fase) => setProfil((p) => ({ ...p, fase_aktif: fase })),
    }),
    [profil],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca profil aktif. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useProfil(): KonteksProfil {
  const nilai = useContext(Konteks);
  if (!nilai) {
    throw new Error('useProfil dipakai di luar <PenyediaProfil>');
  }
  return nilai;
}
