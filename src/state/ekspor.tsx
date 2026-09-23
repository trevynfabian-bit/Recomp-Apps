import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { namaBerkasEkspor, NOTIF_EKSPOR_SIAP, ringkasIsiEkspor, susunBerkasEkspor, tanggalHariIni } from '@recomp/logika';
import { kumpulkanTabelEkspor } from '@/data/ekspor';
import { buatZip, serahkanZip } from '@/lib/berkas';
import { kirimNotifikasiSekarang } from '@/lib/notifikasi';
import { useProfil } from '@/state/profil';
import { useSesi } from '@/state/sesi';
import { useTarget } from '@/state/target';

/**
 * Ekspor data, satu untuk seluruh app.
 *
 * Menyiapkan berkas bisa makan waktu (di backend: kueri semua tabel lalu
 * dikemas), jadi prosesnya hidup di sini, bukan di sheet: sheet boleh
 * ditutup dan pengguna boleh pindah layar. Saat berkasnya siap:
 *   • sheet terbuka → langsung tampil di sheet;
 *   • sheet tertutup → pemberitahuan di dalam app (`BannerEksporSiap`);
 *   • app di latar → notifikasi lokal bila izinnya SUDAH diberikan (tidak
 *     pernah meminta izin di sini), dengan kalimat netral tanpa angka.
 *
 * ZIP-nya disimpan di memori sampai dibagikan atau dibuang, lalu dilepas —
 * data kesehatan tidak dibiarkan menumpuk. Penyedia ini berada di dalam
 * penyedia berkunci id pengguna, jadi berkas milik akun sebelumnya ikut
 * hilang saat keluar atau berganti akun.
 *
 * Fase 4 sisi frontend: datanya tiruan (`@/data/ekspor`), dan jeda
 * `JEDA_TIRUAN_MS` meniru server yang sedang menyiapkan berkas.
 */

const JEDA_TIRUAN_MS = 2500;

export type StatusEkspor =
  | { jenis: 'diam' }
  | { jenis: 'memproses' }
  | { jenis: 'siap'; namaBerkas: string; ukuranByte: number; dibuatPada: string }
  | { jenis: 'diserahkan'; cara: 'dibagikan' | 'diunduh' }
  | { jenis: 'gagal' };

type KonteksEkspor = {
  status: StatusEkspor;
  /** Apa yang AKAN ada di berkas, dari data saat ini. */
  isi: { label: string; jumlah: number }[];
  mulai: () => Promise<void>;
  /** Bagikan (native) atau unduh (web); melempar bila gagal. */
  serahkan: () => Promise<void>;
  /** Buang berkas yang sudah disiapkan tanpa membagikannya. */
  buang: () => void;
  /** Sheet ekspor sedang terbuka di layar mana pun. */
  setSheetTerbuka: (terbuka: boolean) => void;
  /** Berkas siap saat sheet tertutup; dibaca banner. */
  perluDiberitahu: boolean;
  tutupPemberitahuan: () => void;
};

const Konteks = createContext<KonteksEkspor | null>(null);

export function PenyediaEkspor({ children }: { children: React.ReactNode }) {
  const { profil, riwayatFase } = useProfil();
  const { tipeHari, target } = useTarget();
  const { pengguna } = useSesi();
  const [status, setStatus] = useState<StatusEkspor>({ jenis: 'diam' });
  const [perluDiberitahu, setPerluDiberitahu] = useState(false);
  const zip = useRef<Uint8Array | null>(null);
  const sheetTerbuka = useRef(false);

  const tabel = useMemo(
    () => kumpulkanTabelEkspor({ profil, riwayatFase, tipeHari, target }),
    [profil, riwayatFase, tipeHari, target],
  );
  const isi = useMemo(() => ringkasIsiEkspor(tabel), [tabel]);

  const mulai = useCallback(async () => {
    setStatus({ jenis: 'memproses' });
    setPerluDiberitahu(false);
    try {
      await new Promise((r) => setTimeout(r, JEDA_TIRUAN_MS));
      const dibuatPada = new Date().toISOString();
      zip.current = buatZip(susunBerkasEkspor(tabel, { dibuatPada, email: pengguna?.email ?? null }));
      setStatus({ jenis: 'siap', namaBerkas: namaBerkasEkspor(tanggalHariIni()), ukuranByte: zip.current.byteLength, dibuatPada });
      if (!sheetTerbuka.current) setPerluDiberitahu(true);
      if (AppState.currentState !== 'active') {
        void kirimNotifikasiSekarang({ ...NOTIF_EKSPOR_SIAP, jenis: 'ekspor' }).catch(() => undefined);
      }
    } catch {
      zip.current = null;
      setStatus({ jenis: 'gagal' });
    }
  }, [tabel, pengguna]);

  const serahkan = useCallback(async () => {
    if (status.jenis !== 'siap' || !zip.current) return;
    const cara = await serahkanZip(status.namaBerkas, zip.current);
    zip.current = null;
    setPerluDiberitahu(false);
    setStatus({ jenis: 'diserahkan', cara });
  }, [status]);

  const buang = useCallback(() => {
    zip.current = null;
    setPerluDiberitahu(false);
    setStatus({ jenis: 'diam' });
  }, []);

  const setSheetTerbuka = useCallback((terbuka: boolean) => {
    sheetTerbuka.current = terbuka;
    if (terbuka) setPerluDiberitahu(false);
  }, []);

  const nilai = useMemo<KonteksEkspor>(
    () => ({
      status,
      isi,
      mulai,
      serahkan,
      buang,
      setSheetTerbuka,
      perluDiberitahu,
      tutupPemberitahuan: () => setPerluDiberitahu(false),
    }),
    [status, isi, mulai, serahkan, buang, setSheetTerbuka, perluDiberitahu],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca ekspor. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useEkspor(): KonteksEkspor {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useEkspor dipakai di luar <PenyediaEkspor>');
  return nilai;
}
