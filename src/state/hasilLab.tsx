import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { HasilLab } from '@recomp/logika';
import { dalamBatasWaktu } from '@/lib/batasWaktu';
import {
  hapusHasilLabServer,
  KesalahanHasilLab,
  muatHasilLab,
  simpanHasilLabServer,
} from '@/data/hasilLab';
import { supabaseSiap } from '@/lib/supabase';
import { mockRiwayatLab, mockSimpanHasilLab } from '@/mocks/hasilLab';
import { useSesi } from '@/state/sesi';

/**
 * Riwayat hasil lab, satu untuk seluruh app: layar riwayat, form tambah/ubah,
 * baris Pengaturan, dan ekspor membaca daftar yang sama — hasil yang baru
 * ditambahkan langsung ada di keempatnya.
 *
 * Dengan Supabase: dimuat saat masuk (`muat_hasil_lab`) dan ditulis lewat
 * `simpan_hasil_lab` / `hapus_hasil_lab` (`@/data/hasilLab`). Berbeda dengan
 * target, gagal memuat TIDAK menahan app: hanya layar hasil lab yang berkata
 * "belum termuat", dan hasil lab tidak disalin ke perangkat. Tanpa kredensial
 * Supabase, isinya tiruan di memori dengan antarmuka yang sama.
 */
type KonteksHasilLab = {
  riwayat: HasilLab[];
  /** `siap` untuk tiruan; dengan Supabase, keadaan pemuatan dari server. */
  status: 'memuat' | 'siap' | 'gagal';
  /** Kalimat layak tampil saat `status` gagal. */
  pesanGagal: string | null;
  muatUlang: () => void;
  /** Simpan hasil baru; melempar `KesalahanHasilLab` bila gagal. Mengembalikan hasil yang tersimpan. */
  tambah: (hasil: Omit<HasilLab, 'id'>) => Promise<HasilLab>;
  /** Ganti isi satu entri; melempar bila gagal (entri lama tetap). */
  ubah: (id: string, hasil: Omit<HasilLab, 'id'>) => Promise<void>;
  /** Hapus satu entri; melempar bila gagal (entri tetap ada). */
  hapus: (id: string) => Promise<void>;
};

const Konteks = createContext<KonteksHasilLab | null>(null);

/** Paling lama menunggu server memuat hasil lab. */
const BATAS_MUAT_MS = 10000;

const urut = (r: HasilLab[]) => [...r].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.nama.localeCompare(b.nama));

export function PenyediaHasilLab({ children }: { children: React.ReactNode }) {
  const { pengguna } = useSesi();
  // Dipasang ulang tiap akun berganti (kunci id pengguna).
  const pakaiServer = supabaseSiap && pengguna !== null;
  const [riwayat, setRiwayat] = useState<HasilLab[]>(pakaiServer ? [] : mockRiwayatLab);
  const [status, setStatus] = useState<KonteksHasilLab['status']>(pakaiServer ? 'memuat' : 'siap');
  const [pesanGagal, setPesanGagal] = useState<string | null>(null);
  /** Waktu terakhir berubah per id, dikirim kembali saat mengubah (konkurensi optimistis). */
  const waktu = useRef<Record<string, string>>({});

  const muatDariServer = useCallback(async () => {
    setStatus('memuat');
    setPesanGagal(null);
    try {
      const hasil = await dalamBatasWaktu(muatHasilLab(), BATAS_MUAT_MS);
      waktu.current = Object.fromEntries(hasil.map((h) => [h.id, h.diperbaruiPada]));
      setRiwayat(hasil.map(({ diperbaruiPada: _w, ...h }) => h));
      setStatus('siap');
    } catch (e) {
      setPesanGagal(
        e instanceof KesalahanHasilLab ? e.message : 'Hasil lab belum bisa dimuat. Periksa koneksi, lalu coba lagi.',
      );
      setStatus('gagal');
    }
  }, []);

  useEffect(() => {
    if (pakaiServer) void muatDariServer();
  }, [pakaiServer, muatDariServer]);

  const tambah = useCallback(
    async (hasil: Omit<HasilLab, 'id'>) => {
      if (pakaiServer) {
        const { diperbaruiPada, ...baru } = await simpanHasilLabServer(hasil);
        waktu.current[baru.id] = diperbaruiPada;
        setRiwayat((r) => urut([...r, baru]));
        return baru;
      }
      await mockSimpanHasilLab();
      const baru: HasilLab = { ...hasil, id: `lab-${Date.now()}` };
      setRiwayat((r) => [...r, baru]);
      return baru;
    },
    [pakaiServer],
  );

  const ubah = useCallback(
    async (id: string, hasil: Omit<HasilLab, 'id'>) => {
      if (pakaiServer) {
        try {
          const { diperbaruiPada, ...baru } = await simpanHasilLabServer(hasil, { id, diperbaruiPada: waktu.current[id] });
          waktu.current[id] = diperbaruiPada;
          setRiwayat((r) => urut(r.map((h) => (h.id === id ? baru : h))));
        } catch (e) {
          // Isi terbaru (atau hilangnya entri) dimuat supaya yang dilihat pengguna benar.
          if (e instanceof KesalahanHasilLab && (e.kode === 'konflik' || e.kode === 'tidak-ada')) await muatDariServer();
          throw e;
        }
        return;
      }
      await mockSimpanHasilLab();
      setRiwayat((r) => r.map((h) => (h.id === id ? { ...hasil, id } : h)));
    },
    [pakaiServer, muatDariServer],
  );

  const hapus = useCallback(
    async (id: string) => {
      if (pakaiServer) {
        try {
          await hapusHasilLabServer(id);
        } catch (e) {
          // Sudah dihapus di tempat lain: tujuan pengguna tercapai.
          if (!(e instanceof KesalahanHasilLab && e.kode === 'tidak-ada')) throw e;
        }
        delete waktu.current[id];
        setRiwayat((r) => r.filter((h) => h.id !== id));
        return;
      }
      await mockSimpanHasilLab();
      setRiwayat((r) => r.filter((h) => h.id !== id));
    },
    [pakaiServer],
  );

  const nilai = useMemo<KonteksHasilLab>(
    () => ({ riwayat, status, pesanGagal, muatUlang: () => void muatDariServer(), tambah, ubah, hapus }),
    [riwayat, status, pesanGagal, muatDariServer, tambah, ubah, hapus],
  );
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca hasil lab. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useHasilLab(): KonteksHasilLab {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useHasilLab dipakai di luar <PenyediaHasilLab>');
  return nilai;
}
