import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { HasilRedistribusi } from '@recomp/logika';

/**
 * Redistribusi kalori yang sudah diterapkan pekan ini, dibagikan ke semua layar.
 *
 * Diterapkan di Budget, tapi yang berubah adalah TARGET HARIAN hari-hari
 * mendatang: Hari Ini pada hari itu dan Target harian harus memakai angka yang
 * sama. Dulu hasilnya hanya disimpan di state layar Budget, jadi layar lain
 * tetap menampilkan target semula (dan hasilnya hilang saat navigator dipasang
 * ulang, mis. saat skema berganti).
 *
 * Fase 1: di memori, per akun (penyedia ini ada di bawah `PenyediaProfil`
 * berkunci pengguna). Dengan Supabase, `terapkan_redistribusi` menulis target
 * baru ke catatan harian dan `targetBerlaku` membacanya dari snapshot.
 */
type KonteksRedistribusi = {
  /** `null` bila belum ada redistribusi pekan ini (atau dilepas). */
  hasil: HasilRedistribusi | null;
  terapkan: (hasil: HasilRedistribusi) => void;
  lepas: () => void;
  /** Target kalori hasil redistribusi untuk tanggal itu, atau `null` bila tidak terkena. */
  kaloriUntuk: (tanggal: string) => number | null;
};

const Konteks = createContext<KonteksRedistribusi | null>(null);

export function PenyediaRedistribusi({ children }: { children: React.ReactNode }) {
  const [hasil, setHasil] = useState<HasilRedistribusi | null>(null);
  const lepas = useCallback(() => setHasil(null), []);
  const kaloriUntuk = useCallback(
    (tanggal: string) => {
      if (!hasil || hasil.opsi === 'abaikan') return null;
      const h = hasil.hari.find((x) => x.tanggal === tanggal);
      return h && h.selisih !== 0 ? h.targetBaru : null;
    },
    [hasil],
  );
  const nilai = useMemo(() => ({ hasil, terapkan: setHasil, lepas, kaloriUntuk }), [hasil, lepas, kaloriUntuk]);
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca redistribusi pekan ini. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useRedistribusi(): KonteksRedistribusi {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useRedistribusi dipakai di luar <PenyediaRedistribusi>');
  return nilai;
}
