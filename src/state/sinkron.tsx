import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { kesehatanKoneksi, selisihMasuk } from '@recomp/logika';
import type { KeadaanSinkronApp, KoneksiSumber, SnapshotHariIni, SumberData } from '@recomp/logika';
import {
  ambilKoneksi,
  ambilSnapshotHariIni,
  koneksiDariBaris,
  langgananSinkron,
  susunKoneksi,
} from '@/data/realtime';
import { supabase, supabaseSiap } from '@/lib/supabase';
import { mockKejadianMasuk, mockKoneksiSumber } from '@/mocks/sumberData';
import type { HealthConnectionRow } from '@/types/database';

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
 * Dengan Supabase terpasang, isinya dari `health_connections` + Supabase
 * Realtime (`@/data/realtime`): denyut koneksi → snapshot hari ini dari
 * server → selisihnya menjadi banner "data baru masuk". Tanpa Supabase
 * (pratinjau web, pengembangan) isinya tiruan: Realtime "tersambung" sesaat
 * setelah app dibuka, lalu satu kiriman Apple Health masuk beberapa detik
 * kemudian. Antarmuka hook ini sama untuk keduanya.
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
  const [koneksi, setKoneksi] = useState<KoneksiSumber[]>(() =>
    supabaseSiap ? susunKoneksi([], null) : mockKoneksiSumber(),
  );
  const [realtime, setRealtime] = useState<KeadaanSinkronApp['realtime']>('menyambung');
  const [sedangMenyinkron, setSedangMenyinkron] = useState(false);
  const [terakhirMasuk, setTerakhirMasuk] = useState<string | null>(null);
  const [kejadianTerbaru, setKejadianTerbaru] = useState<KejadianMasuk | null>(null);
  const [sekarang, setSekarang] = useState(() => new Date());
  const pewaktu = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Snapshot terakhir dari server, pembanding untuk "yang baru masuk". */
  const snapshot = useRef<SnapshotHariIni | null>(null);
  /** sinkron_terakhir yang sudah diumumkan, per sumber. */
  const sudahDiumumkan = useRef<Partial<Record<SumberData, string | null>>>({});

  const ubahKoneksi = useCallback((sumber: SumberData, perubahan: Partial<KoneksiSumber>) => {
    setKoneksi((lama) => lama.map((k) => (k.sumber === sumber ? { ...k, ...perubahan } : k)));
  }, []);

  useEffect(() => {
    if (!supabaseSiap) return undefined;
    let batal = false;
    let berhenti: (() => void) | null = null;

    /** Denyut satu koneksi: perbarui kartunya; bila ada kiriman baru, umumkan isinya. */
    async function denyut(baris: HealthConnectionRow) {
      const sumber = baris.sumber;
      setKoneksi((lama) => lama.map((k) => (k.sumber === sumber ? koneksiDariBaris(sumber, baris, snapshot.current) : k)));
      const lamaSinkron = sudahDiumumkan.current[sumber] ?? null;
      if (!baris.sinkron_terakhir || baris.sinkron_terakhir === lamaSinkron) return;
      sudahDiumumkan.current[sumber] = baris.sinkron_terakhir;

      setSedangMenyinkron(true);
      try {
        const baru = await ambilSnapshotHariIni();
        if (batal) return;
        const masuk = selisihMasuk(snapshot.current, baru, sumber);
        snapshot.current = baru;
        setKoneksi((lama) => lama.map((k) => (k.sumber === sumber ? koneksiDariBaris(sumber, baris, baru) : k)));
        setTerakhirMasuk(baris.sinkron_terakhir);
        setSekarang(new Date());
        if (masuk.length > 0) {
          setKejadianTerbaru({ id: `${sumber}-${baris.sinkron_terakhir}`, sumber, waktu: baris.sinkron_terakhir, masuk });
        }
      } catch {
        // Snapshot gagal dimuat: kartu tetap diperbarui dari denyutnya; banner
        // menunggu denyut berikutnya.
      } finally {
        if (!batal) setSedangMenyinkron(false);
      }
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (batal || !userId) return;
      try {
        const [baris, snap] = await Promise.all([ambilKoneksi(), ambilSnapshotHariIni()]);
        if (batal) return;
        snapshot.current = snap;
        for (const b of baris) sudahDiumumkan.current[b.sumber] = b.sinkron_terakhir;
        setKoneksi(susunKoneksi(baris, snap));
        const terakhir = baris.map((b) => b.sinkron_terakhir).filter((w): w is string => w !== null).sort().pop();
        setTerakhirMasuk(terakhir ?? null);
      } catch {
        // Muat awal gagal: Realtime tetap disambungkan; denyut pertama mengisi kartunya.
      }
      if (batal) return;
      berhenti = langgananSinkron(userId, {
        onKoneksi: (b) => void denyut(b),
        onTabelBerubah: () => setSekarang(new Date()),
        onStatus: setRealtime,
      });
    })();

    const detak = setInterval(() => setSekarang(new Date()), 30_000);
    return () => {
      batal = true;
      berhenti?.();
      clearInterval(detak);
    };
  }, []);

  // --- Tiruan: tanpa Supabase ------------------------------------------------
  useEffect(() => {
    if (supabaseSiap) return undefined;
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
