import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { kesehatanKoneksi } from '@recomp/logika';
import type { KeadaanSinkronApp, KoneksiSumber, SumberData } from '@recomp/logika';
import { mockKejadianMasuk, mockKoneksiSumber } from '@/mocks/sumberData';

/**
 * Keadaan sinkron seluruh app: koneksi tiap sumber, koneksi Realtime, dan
 * data yang baru saja masuk.
 *
 * Satu penyedia, bukan state per layar, karena tiga tempat membaca hal yang
 * SAMA: indikator di kepala layar Hari Ini, layar Sumber data, dan banner
 * "data baru masuk". Kalau Strava disambungkan ulang di Sumber data tapi
 * indikator masih berkata "1 sumber perlu perhatian", pengguna tidak punya
 * cara tahu mana yang benar.
 *
 * Fase 3 sisi frontend: semuanya tiruan. Realtime "tersambung" sesaat setelah
 * app dibuka, lalu satu kiriman Apple Health masuk beberapa detik kemudian —
 * cukup untuk melihat indikator, banner, dan kartu sumber bergerak bersama.
 * Task backend menukar isinya dengan `health_connections` dan langganan
 * Supabase Realtime tanpa mengubah antarmuka hook ini.
 */

/** Satu kiriman data yang baru masuk lewat Realtime. */
export type KejadianMasuk = {
  id: string;
  sumber: SumberData;
  /** ISO 8601. */
  waktu: string;
  /** Apa saja yang masuk, mis. `{ label: 'langkah', jumlah: 1204 }`. */
  masuk: { label: string; jumlah: number }[];
};

type KonteksSinkron = {
  koneksi: KoneksiSumber[];
  ubahKoneksi: (sumber: SumberData, perubahan: Partial<KoneksiSumber>) => void;
  keadaan: KeadaanSinkronApp;
  /** Kiriman terbaru yang belum ditutup; dibaca banner. */
  kejadianTerbaru: KejadianMasuk | null;
  tutupKejadian: () => void;
  /**
   * Jam bersama untuk waktu relatif & status "terlambat", berdetak tiap 30
   * detik. Satu jam untuk semua pembaca, supaya indikator dan kartu sumber
   * tidak pernah berbeda pendapat soal "sekarang".
   */
  sekarang: Date;
};

const Konteks = createContext<KonteksSinkron | null>(null);

/** Jeda tiruan: Realtime tersambung, lalu satu kiriman masuk. */
const JEDA_TERSAMBUNG_MS = 900;
const JEDA_KIRIMAN_MS = 6000;
const LAMA_MENYINKRON_MS = 1200;

export function PenyediaSinkron({ children }: { children: React.ReactNode }) {
  const [koneksi, setKoneksi] = useState<KoneksiSumber[]>(() => mockKoneksiSumber());
  const [realtime, setRealtime] = useState<KeadaanSinkronApp['realtime']>('menyambung');
  const [sedangMenyinkron, setSedangMenyinkron] = useState(false);
  const [terakhirMasuk, setTerakhirMasuk] = useState<string | null>(null);
  const [kejadianTerbaru, setKejadianTerbaru] = useState<KejadianMasuk | null>(null);
  const [sekarang, setSekarang] = useState(() => new Date());
  const pewaktu = useRef<ReturnType<typeof setTimeout>[]>([]);

  const ubahKoneksi = useCallback((sumber: SumberData, perubahan: Partial<KoneksiSumber>) => {
    setKoneksi((lama) => lama.map((k) => (k.sumber === sumber ? { ...k, ...perubahan } : k)));
  }, []);

  useEffect(() => {
    const t = pewaktu.current;
    t.push(setTimeout(() => setRealtime('terhubung'), JEDA_TERSAMBUNG_MS));
    t.push(
      setTimeout(() => {
        setSedangMenyinkron(true);
        t.push(
          setTimeout(() => {
            const kejadian = mockKejadianMasuk();
            setSedangMenyinkron(false);
            setTerakhirMasuk(kejadian.waktu);
            setKejadianTerbaru(kejadian);
            setSekarang(new Date());
            setKoneksi((lama) =>
              lama.map((k) =>
                k.sumber === kejadian.sumber
                  ? {
                      ...k,
                      sinkronTerakhir: kejadian.waktu,
                      galatTerakhir: null,
                      masukHariIni: gabungMasuk(k.masukHariIni, kejadian.masuk),
                    }
                  : k,
              ),
            );
          }, LAMA_MENYINKRON_MS),
        );
      }, JEDA_KIRIMAN_MS),
    );
    // "Perlu perhatian" dan "12 menit lalu" bergantung jam.
    const detak = setInterval(() => setSekarang(new Date()), 30_000);
    return () => {
      t.forEach(clearTimeout);
      clearInterval(detak);
    };
  }, []);

  const nilai = useMemo<KonteksSinkron>(() => {
    const perluPerhatian = koneksi.filter((k) => {
      const t = kesehatanKoneksi(k, sekarang).tingkat;
      return t === 'bermasalah' || t === 'terlambat';
    }).length;
    return {
      koneksi,
      ubahKoneksi,
      keadaan: {
        realtime,
        sedangMenyinkron,
        // Tiruan belum punya antrean offline; task backend mengisinya dari
        // antrean tulis lokal.
        tertunda: 0,
        terakhirMasuk,
        sumberPerluPerhatian: perluPerhatian,
      },
      kejadianTerbaru,
      tutupKejadian: () => setKejadianTerbaru(null),
      sekarang,
    };
  }, [koneksi, ubahKoneksi, realtime, sedangMenyinkron, terakhirMasuk, kejadianTerbaru, sekarang]);

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca keadaan sinkron. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useSinkron(): KonteksSinkron {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useSinkron dipakai di luar <PenyediaSinkron>');
  return nilai;
}

/** Tambahkan kiriman baru ke hitungan hari ini, per label. */
function gabungMasuk(
  lama: KoneksiSumber['masukHariIni'],
  baru: KejadianMasuk['masuk'],
): KoneksiSumber['masukHariIni'] {
  const hasil = lama.map((m) => ({ ...m }));
  for (const b of baru) {
    const ada = hasil.find((m) => m.label === b.label);
    if (ada) ada.jumlah += b.jumlah;
    else hasil.push({ ...b });
  }
  return hasil;
}
