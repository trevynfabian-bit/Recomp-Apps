import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Fase, NilaiTarget } from '@recomp/logika';
import { mockDayTypes, mockDayTypeTargets } from '@/mocks/dailyLog';
import { mockSimpanTarget } from '@/mocks/target';
import type { DayType, DayTypeTarget } from '@/types/domain';

/**
 * Tipe hari & target absolutnya, dibagikan ke seluruh layar.
 *
 * Satu sumber karena target yang disunting di Pengaturan harus langsung
 * dipakai Hari Ini: sisa kalori yang masih memakai angka lama setelah
 * pengguna menyimpan angka baru adalah jenis ketidakcocokan yang membuat
 * orang berhenti percaya pada app.
 *
 * Fase 4 sisi frontend: isinya tiruan di memori (`@/mocks/target`); task
 * backend menukarnya dengan `day_type_targets` tanpa mengubah antarmuka ini.
 */

export type PerubahanTarget = { day_type_id: string; fase: Fase; nilai: NilaiTarget };

type KonteksTarget = {
  tipeHari: DayType[];
  target: DayTypeTarget[];
  /** Target untuk (tipe hari x fase); cadangan baris pertama bila datanya kurang. */
  cariTarget: (dayTypeId: string, fase: Fase) => DayTypeTarget;
  /** Simpan beberapa baris sekaligus; semua atau tidak sama sekali. */
  simpanTarget: (perubahan: PerubahanTarget[]) => Promise<void>;
};

const Konteks = createContext<KonteksTarget | null>(null);

export function PenyediaTarget({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<DayTypeTarget[]>(mockDayTypeTargets);

  const cariTarget = useCallback(
    (dayTypeId: string, fase: Fase) => {
      const hit = target.find((t) => t.day_type_id === dayTypeId && t.fase === fase);
      if (hit) return hit;
      if (__DEV__) console.warn(`[target] tidak ada target untuk ${dayTypeId} pada fase ${fase}`);
      return target[0];
    },
    [target],
  );

  const simpanTarget = useCallback(async (perubahan: PerubahanTarget[]) => {
    await mockSimpanTarget(perubahan);
    setTarget((lama) =>
      lama.map((t) => {
        const p = perubahan.find((x) => x.day_type_id === t.day_type_id && x.fase === t.fase);
        return p ? { ...t, ...p.nilai } : t;
      }),
    );
  }, []);

  const nilai = useMemo<KonteksTarget>(
    () => ({ tipeHari: mockDayTypes, target, cariTarget, simpanTarget }),
    [target, cariTarget, simpanTarget],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca target. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useTarget(): KonteksTarget {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useTarget dipakai di luar <PenyediaTarget>');
  return nilai;
}
