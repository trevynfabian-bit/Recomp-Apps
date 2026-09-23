import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { rataRata7Hari, tanggalHariIni, terapkanGantiFase } from '@recomp/logika';
import type { Fase, HasilGantiFase, PeriodeFase, RataRata7Hari } from '@recomp/logika';
import { mockProfile, mockRiwayatBerat } from '@/mocks/dailyLog';
import { mockRiwayatFase } from '@/mocks/pengaturan';
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
 * Mengganti fase mengikuti `ganti_fase` lewat kembarannya
 * (`terapkanGantiFase`): riwayat ditutup/diganti dengan aturan yang sama
 * dengan server, dan jangkar koridornya rata-rata 7 hari, bukan timbangan
 * hari itu. `pratinjauGantiFase` menjalankan aturan yang sama TANPA
 * menyimpan, supaya sheet konfirmasi menyebut apa yang benar-benar terjadi.
 *
 * Fase 4 sisi frontend: semuanya di memori; task backend menukar isinya
 * dengan `profiles` + RPC `ganti_fase` tanpa mengubah antarmuka hook ini.
 */
export type PratinjauGantiFase = { hasil: HasilGantiFase; jangkar: RataRata7Hari; tanggal: string };

type KonteksProfil = {
  profil: Profile;
  /** Riwayat fase, lama → baru; periode terakhir yang berjalan. */
  riwayatFase: PeriodeFase[];
  /** Apa yang AKAN terjadi bila fase diganti hari ini; tidak mengubah apa pun. */
  pratinjauGantiFase: (fase: Fase) => PratinjauGantiFase;
  gantiFase: (fase: Fase) => HasilGantiFase;
  /**
   * Perbarui sebagian field profil (tinggi badan, jenis kelamin, batas
   * pinggang). Dipakai layar yang perlu melengkapi data sebelum sebuah
   * perhitungan bisa jalan, tanpa harus memindahkan pengguna ke Setelan dan
   * kehilangan konteks apa yang sedang ia kerjakan.
   */
  perbaruiProfil: (perubahan: Partial<Profile>) => void | Promise<void>;
};

const Konteks = createContext<KonteksProfil | null>(null);

export function PenyediaProfil({ children }: { children: React.ReactNode }) {
  const [profil, setProfil] = useState<Profile>(mockProfile);
  const [riwayatFase, setRiwayatFase] = useState<PeriodeFase[]>(mockRiwayatFase);

  const pratinjauGantiFase = useCallback(
    (fase: Fase): PratinjauGantiFase => {
      const tanggal = tanggalHariIni();
      const jangkar = rataRata7Hari(mockRiwayatBerat, tanggal);
      return { hasil: terapkanGantiFase(riwayatFase, fase, tanggal, jangkar.rataRataKg), jangkar, tanggal };
    },
    [riwayatFase],
  );

  const gantiFase = useCallback(
    (fase: Fase) => {
      const { hasil } = pratinjauGantiFase(fase);
      if (hasil.jenis === 'ditutup' || hasil.jenis === 'diganti') {
        setRiwayatFase(hasil.riwayat);
        setProfil((p) => ({ ...p, fase_aktif: fase }));
      }
      return hasil;
    },
    [pratinjauGantiFase],
  );

  const nilai = useMemo<KonteksProfil>(
    () => ({
      profil,
      riwayatFase,
      pratinjauGantiFase,
      gantiFase,
      perbaruiProfil: (perubahan) => setProfil((p) => ({ ...p, ...perubahan })),
    }),
    [profil, riwayatFase, pratinjauGantiFase, gantiFase],
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
