import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { deteksiTipeHari } from '@recomp/logika';
import type { HasilDeteksi } from '@recomp/logika';
import { mockDailyLogHariIni } from '@/mocks/dailyLog';
import { mockWorkoutsHariIni } from '@/mocks/workout';
import { useTarget } from '@/state/target';

/**
 * Tipe hari yang berlaku HARI INI, satu untuk seluruh app.
 *
 * Tipe hari menentukan target yang dipakai, dan ia bisa dipilih dari dua
 * tempat — kartu Tipe hari di Hari Ini dan halaman Target. Kalau masing-masing
 * memegang salinannya sendiri, memilih "Padel" di satu tempat meninggalkan
 * tempat lain dengan target Beban+Lari: dua angka "sisa kalori" yang sama
 * sahnya, dan pengguna tidak punya cara tahu mana yang benar.
 *
 * Aturannya sama dengan `daily_logs`: tanpa override, tipe hari MENGIKUTI
 * hasil deteksi dari workout hari ini; dengan override, pilihan pengguna
 * menang sampai ia kembali ke deteksi otomatis.
 *
 * Fase 4 sisi frontend: dimulai dari log tiruan hari ini; task backend
 * menukarnya dengan `setel_tipe_hari` tanpa mengubah antarmuka ini.
 */
type KonteksHariIni = {
  /** Tipe hari yang berlaku sekarang (override atau hasil deteksi). */
  dayTypeId: string;
  override: boolean;
  deteksi: HasilDeteksi;
  pilihTipeHari: (dayTypeId: string) => void;
  kembalikanAuto: () => void;
};

const Konteks = createContext<KonteksHariIni | null>(null);

export function PenyediaHariIni({ children }: { children: React.ReactNode }) {
  const { tipeHari } = useTarget();
  const [pilihan, setPilihan] = useState<{ dayTypeId: string; override: boolean }>({
    dayTypeId: mockDailyLogHariIni.day_type_id,
    override: mockDailyLogHariIni.day_type_override,
  });
  const deteksi = useMemo(() => deteksiTipeHari(mockWorkoutsHariIni, tipeHari), [tipeHari]);

  const pilihTipeHari = useCallback((dayTypeId: string) => setPilihan({ dayTypeId, override: true }), []);
  const kembalikanAuto = useCallback(
    () => setPilihan((p) => ({ dayTypeId: deteksi.dayTypeId ?? p.dayTypeId, override: false })),
    [deteksi],
  );

  const nilai = useMemo<KonteksHariIni>(
    () => ({
      dayTypeId: pilihan.override || deteksi.dayTypeId === null ? pilihan.dayTypeId : deteksi.dayTypeId,
      override: pilihan.override,
      deteksi,
      pilihTipeHari,
      kembalikanAuto,
    }),
    [pilihan, deteksi, pilihTipeHari, kembalikanAuto],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca tipe hari ini. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useHariIni(): KonteksHariIni {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useHariIni dipakai di luar <PenyediaHariIni>');
  return nilai;
}
