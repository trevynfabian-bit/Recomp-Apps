import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cariBarisTarget } from '@recomp/logika';
import type { Fase } from '@recomp/logika';
import { LayarMuatTarget } from '@/components/LayarMuatTarget';
import {
  KesalahanTarget,
  muatTarget,
  simpanTargetServer,
  type DataTarget,
  type PerubahanTarget,
} from '@/data/target';
import { BatasWaktuHabis, dalamBatasWaktu } from '@/lib/batasWaktu';
import { bacaCadangan, simpanCadangan } from '@/lib/cadangan';
import { supabaseSiap } from '@/lib/supabase';
import { mockDayTypes, mockDayTypeTargets } from '@/mocks/dailyLog';
import { mockSimpanTarget } from '@/mocks/target';
import { useSesi } from '@/state/sesi';
import type { DayType, DayTypeTarget } from '@/types/domain';

export type { PerubahanTarget } from '@/data/target';

/**
 * Tipe hari & target absolutnya, dibagikan ke seluruh layar.
 *
 * Satu sumber karena target yang disunting di Pengaturan harus langsung
 * dipakai Hari Ini: sisa kalori yang masih memakai angka lama setelah
 * pengguna menyimpan angka baru adalah jenis ketidakcocokan yang membuat
 * orang berhenti percaya pada app.
 *
 * Dengan Supabase: dimuat sekali per akun lewat `muat_target` dan disimpan
 * lewat `simpan_target` (`@/data/target`). Salinan terakhirnya disimpan di
 * perangkat (`@/lib/cadangan`), jadi app yang dibuka tanpa sinyal langsung
 * memakai angka yang terakhir diketahui sambil menyegarkannya di belakang.
 * Tanpa salinan, layar app belum dirender selama memuat (`LayarMuatTarget`):
 * tanpa daftar tipe hari, Hari Ini tidak punya tipe hari untuk ditampilkan,
 * dan "target belum diisi" yang sekilas muncul sebelum data datang adalah
 * kalimat yang salah. Tanpa kredensial Supabase, isinya tiruan di memori
 * (`@/mocks/target`) dengan antarmuka yang sama.
 */

type KonteksTarget = {
  tipeHari: DayType[];
  target: DayTypeTarget[];
  /**
   * Target untuk (tipe hari x fase), atau `null` bila belum diisi. TIDAK ada
   * cadangan: angka pinjaman dari tipe hari atau fase lain adalah angka salah
   * yang tampak benar — layar harus mengatakan "belum diisi".
   */
  cariTarget: (dayTypeId: string, fase: Fase) => DayTypeTarget | null;
  /**
   * Simpan beberapa baris sekaligus; semua atau tidak sama sekali. Melempar
   * `KesalahanTarget` (pesan layak tampil) bila gagal.
   */
  simpanTarget: (perubahan: PerubahanTarget[]) => Promise<{ hariDiredistribusiTetap: number }>;
};

const Konteks = createContext<KonteksTarget | null>(null);

const TIRUAN: DataTarget = { tipeHari: mockDayTypes, target: mockDayTypeTargets };
const KOSONG: DataTarget = { tipeHari: [], target: [] };

/**
 * Paling lama menunggu `muat_target`. Tanpa sinyal, klien Supabase mencoba
 * memperbarui token berulang-ulang (sampai ±30 detik) sebelum permintaan
 * datanya berangkat; layar memuat tidak boleh menunggu selama itu.
 */
const BATAS_MUAT_MS = 8000;

/** Salinan di perangkat diperlakukan sebagai masukan tak dipercaya. */
function dataTargetSah(x: unknown): x is DataTarget {
  const d = x as DataTarget | null;
  return (
    !!d &&
    Array.isArray(d.tipeHari) &&
    Array.isArray(d.target) &&
    d.tipeHari.every((t) => typeof t?.id === 'string' && typeof t.nama === 'string') &&
    d.target.every((t) => typeof t?.day_type_id === 'string' && typeof t.target_kalori === 'number')
  );
}

export function PenyediaTarget({ children }: { children: React.ReactNode }) {
  const { pengguna, keluar } = useSesi();
  // Penyedia ini dipasang ulang tiap akun berganti (kunci id pengguna), jadi
  // keputusan ini tetap selama umurnya. Tamu (layar masuk) tidak memuat apa pun.
  const pakaiServer = supabaseSiap && pengguna !== null;
  const [data, setData] = useState<DataTarget>(pakaiServer ? KOSONG : TIRUAN);
  const [muat, setMuat] = useState<{ jenis: 'memuat' } | { jenis: 'siap' } | { jenis: 'gagal'; pesan: string }>(
    pakaiServer ? { jenis: 'memuat' } : { jenis: 'siap' },
  );

  const penggunaId = pengguna?.id ?? null;
  /**
   * Naik setiap kali target disimpan. Hasil muat yang berangkat SEBELUM
   * simpanan terakhir dibuang: bisa jadi ia membawa angka lama yang baru saja
   * diganti.
   */
  const versi = useRef(0);
  /** Data terkini untuk menyusun salinan setelah simpan, tanpa efek di dalam updater. */
  const dataTerkini = useRef(data);
  dataTerkini.current = data;

  const muatDariServer = useCallback(
    async (adaSalinan: boolean) => {
      if (!penggunaId) return;
      const versiAwal = versi.current;
      if (!adaSalinan) setMuat({ jenis: 'memuat' });
      try {
        const segar = await dalamBatasWaktu(muatTarget(), BATAS_MUAT_MS);
        if (versi.current !== versiAwal) return;
        setData(segar);
        setMuat({ jenis: 'siap' });
        void simpanCadangan('target', penggunaId, segar);
      } catch (e) {
        // Dengan salinan, app tetap berjalan di atas angka terakhir yang diketahui.
        if (adaSalinan) return;
        setMuat({
          jenis: 'gagal',
          pesan:
            e instanceof KesalahanTarget
              ? e.message
              : e instanceof BatasWaktuHabis
                ? 'Target belum bisa dimuat. Periksa koneksi, lalu coba lagi.'
                : 'Target belum bisa dimuat. Coba lagi sebentar lagi.',
        });
      }
    },
    [penggunaId],
  );

  useEffect(() => {
    if (!pakaiServer || !penggunaId) return;
    let batal = false;
    void (async () => {
      const salinan = await bacaCadangan('target', penggunaId);
      if (batal) return;
      const adaSalinan = dataTargetSah(salinan);
      if (adaSalinan) {
        setData(salinan);
        setMuat({ jenis: 'siap' });
      }
      await muatDariServer(adaSalinan);
    })();
    return () => {
      batal = true;
    };
  }, [pakaiServer, penggunaId, muatDariServer]);

  // Aturan "tanpa cadangan" yang sama dengan web & server (@recomp/logika).
  const cariTarget = useCallback((dayTypeId: string, fase: Fase) => cariBarisTarget(data.target, dayTypeId, fase), [data]);

  const simpanTarget = useCallback(
    async (perubahan: PerubahanTarget[]) => {
      if (pakaiServer) {
        // Waktu muat tiap baris ikut dikirim: bila baris itu sudah diubah di
        // perangkat lain sejak dimuat, server menolak alih-alih menimpanya.
        const denganWaktu = perubahan.map((p) => ({
          ...p,
          diperbarui_pada:
            p.diperbarui_pada ??
            dataTerkini.current.target.find((t) => t.day_type_id === p.day_type_id && t.fase === p.fase)?.diperbarui_pada,
        }));
        let hasil: Awaited<ReturnType<typeof simpanTargetServer>>;
        try {
          hasil = await simpanTargetServer(denganWaktu);
        } catch (e) {
          // Angka terbaru dimuat supaya yang dilihat pengguna saat menyimpan lagi
          // adalah angka dari perangkat lain itu, bukan yang lama.
          if (e instanceof KesalahanTarget && e.kode === 'konflik') await muatDariServer(true);
          throw e;
        }
        versi.current += 1;
        // Baris dari server yang dipakai, bukan isian: itu yang benar-benar tersimpan.
        const lama = dataTerkini.current;
        const baru: DataTarget = {
          ...lama,
          target: [
            ...lama.target.filter((t) => !hasil.target.some((b) => b.day_type_id === t.day_type_id && b.fase === t.fase)),
            ...hasil.target,
          ],
        };
        setData(baru);
        if (penggunaId) void simpanCadangan('target', penggunaId, baru);
        return { hariDiredistribusiTetap: hasil.hariDiredistribusiTetap };
      }
      try {
        await mockSimpanTarget(perubahan);
      } catch {
        throw new KesalahanTarget('Belum tersimpan. Periksa koneksi, lalu coba lagi; isian Anda masih di sini.', true);
      }
      // Upsert: target yang belum ada (tipe hari baru, fase yang belum diisi) dibuat.
      setData((lama) => {
        const diperbarui = lama.target.map((t) => {
          const p = perubahan.find((x) => x.day_type_id === t.day_type_id && x.fase === t.fase);
          return p ? { ...t, ...p.nilai } : t;
        });
        const baru = perubahan
          .filter((p) => !lama.target.some((t) => t.day_type_id === p.day_type_id && t.fase === p.fase))
          .map((p) => ({ id: `tgt-${p.day_type_id}-${p.fase}`, day_type_id: p.day_type_id, fase: p.fase, ...p.nilai }));
        return { ...lama, target: [...diperbarui, ...baru] };
      });
      return { hariDiredistribusiTetap: 0 };
    },
    [pakaiServer, penggunaId, muatDariServer],
  );

  const nilai = useMemo<KonteksTarget>(
    () => ({ tipeHari: data.tipeHari, target: data.target, cariTarget, simpanTarget }),
    [data, cariTarget, simpanTarget],
  );

  if (muat.jenis !== 'siap') {
    return (
      <LayarMuatTarget
        pesanGagal={muat.jenis === 'gagal' ? muat.pesan : null}
        onCobaLagi={() => void muatDariServer(false)}
        onKeluar={() => void keluar()}
      />
    );
  }

  // Termuat tapi tanpa tipe hari satu pun (seed akun baru gagal, atau data
  // rusak): tidak ada tipe hari untuk dihitung targetnya. Katakan apa adanya,
  // jangan biarkan Hari Ini jatuh karena daftar kosong.
  if (data.tipeHari.length === 0) {
    return (
      <LayarMuatTarget
        kosong
        pesanGagal={null}
        onCobaLagi={() => void muatDariServer(false)}
        onKeluar={() => void keluar()}
      />
    );
  }

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca target. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useTarget(): KonteksTarget {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useTarget dipakai di luar <PenyediaTarget>');
  return nilai;
}
