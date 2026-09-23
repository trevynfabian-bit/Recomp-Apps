import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { namaBerkasEkspor, NOTIF_EKSPOR_SIAP, ringkasIsiEkspor, susunBerkasEkspor, tanggalHariIni } from '@recomp/logika';
import type { TabelEkspor } from '@recomp/logika';
import { eksporDataSaya, kumpulkanTabelEkspor, ringkasEksporDataSaya } from '@/data/ekspor';
import { dalamBatasWaktu } from '@/lib/batasWaktu';
import { buatZip, serahkanZip } from '@/lib/berkas';
import { kirimNotifikasiSekarang } from '@/lib/notifikasi';
import { supabaseSiap } from '@/lib/supabase';
import { useHasilLab } from '@/state/hasilLab';
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
 * Dengan Supabase, seluruh isinya — termasuk hasil lab — datang dari server
 * (`ekspor_data_saya`, RLS yang menjaga); hitungan "apa yang akan ada di
 * berkas" diambil (`ringkas_ekspor_data_saya`) setiap sheet dibuka. Tanpa kredensial Supabase, datanya tiruan (`@/data/ekspor`) dan
 * jeda `JEDA_TIRUAN_MS` meniru server yang sedang menyiapkan berkas.
 */

const JEDA_TIRUAN_MS = 2500;

/** Paling lama menunggu seluruh data dari server. */
const BATAS_EKSPOR_MS = 45000;
/** Paling lama menunggu hitungannya; lewat dari itu sheet tetap bisa menyiapkan berkas. */
const BATAS_HITUNG_MS = 10000;

export type StatusEkspor =
  | { jenis: 'diam' }
  | { jenis: 'memproses' }
  | { jenis: 'siap'; namaBerkas: string; ukuranByte: number; dibuatPada: string }
  | { jenis: 'diserahkan'; cara: 'dibagikan' | 'diunduh' }
  | { jenis: 'gagal' };

type KonteksEkspor = {
  status: StatusEkspor;
  /**
   * Apa yang AKAN ada di berkas, dari data saat ini. `null` selama hitungannya
   * diambil dari server; `isiGagal` bila hitungannya belum bisa diambil.
   */
  isi: { label: string; jumlah: number }[] | null;
  isiGagal: boolean;
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
  const { riwayat: hasilLab } = useHasilLab();
  const { pengguna } = useSesi();
  const [status, setStatus] = useState<StatusEkspor>({ jenis: 'diam' });
  const [perluDiberitahu, setPerluDiberitahu] = useState(false);
  const zip = useRef<Uint8Array | null>(null);
  const sheetTerbuka = useRef(false);

  // Penyedia ini dipasang ulang tiap akun berganti (kunci id pengguna).
  const pakaiServer = supabaseSiap && pengguna !== null;
  const tabelTiruan = useMemo(
    () => (pakaiServer ? null : kumpulkanTabelEkspor({ profil, riwayatFase, tipeHari, target, hasilLab })),
    [pakaiServer, profil, riwayatFase, tipeHari, target, hasilLab],
  );
  const [hitunganServer, setHitunganServer] = useState<{ label: string; jumlah: number }[] | 'memuat' | 'gagal'>('memuat');
  const isi = useMemo(() => {
    if (tabelTiruan) return ringkasIsiEkspor(tabelTiruan);
    return Array.isArray(hitunganServer) ? hitunganServer : null;
  }, [tabelTiruan, hitunganServer]);

  const hitungDariServer = useCallback(async () => {
    setHitunganServer('memuat');
    try {
      setHitunganServer(await dalamBatasWaktu(ringkasEksporDataSaya(), BATAS_HITUNG_MS));
    } catch {
      setHitunganServer('gagal');
    }
  }, []);

  /** Seluruh tabel untuk berkas: dari server (+ hasil lab) atau tiruan. */
  const ambilTabel = useCallback(async (): Promise<{ tabel: TabelEkspor[]; dibuatPada: string }> => {
    if (tabelTiruan) {
      await new Promise((r) => setTimeout(r, JEDA_TIRUAN_MS));
      return { tabel: tabelTiruan, dibuatPada: new Date().toISOString() };
    }
    const dariServer = await dalamBatasWaktu(eksporDataSaya(), BATAS_EKSPOR_MS);
    // Hitungan di sheet diganti isi yang benar-benar masuk berkas.
    setHitunganServer(ringkasIsiEkspor(dariServer.tabel));
    return { tabel: dariServer.tabel, dibuatPada: dariServer.dibuatPada };
  }, [tabelTiruan]);

  const mulai = useCallback(async () => {
    setStatus({ jenis: 'memproses' });
    setPerluDiberitahu(false);
    try {
      const { tabel, dibuatPada } = await ambilTabel();
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
  }, [ambilTabel, pengguna]);

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

  const setSheetTerbuka = useCallback(
    (terbuka: boolean) => {
      sheetTerbuka.current = terbuka;
      if (terbuka) setPerluDiberitahu(false);
      // Hitungan segar setiap sheet dibuka: data bisa bertambah sejak terakhir.
      if (terbuka && pakaiServer) void hitungDariServer();
    },
    [pakaiServer, hitungDariServer],
  );

  const nilai = useMemo<KonteksEkspor>(
    () => ({
      status,
      isi,
      isiGagal: hitunganServer === 'gagal' && !tabelTiruan,
      mulai,
      serahkan,
      buang,
      setSheetTerbuka,
      perluDiberitahu,
      tutupPemberitahuan: () => setPerluDiberitahu(false),
    }),
    [status, isi, hitunganServer, tabelTiruan, mulai, serahkan, buang, setSheetTerbuka, perluDiberitahu],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca ekspor. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useEkspor(): KonteksEkspor {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useEkspor dipakai di luar <PenyediaEkspor>');
  return nilai;
}
