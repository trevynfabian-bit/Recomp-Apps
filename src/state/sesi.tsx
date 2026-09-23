import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { buatSesiTersimpan, kodeGagalMasuk, PESAN_GAGAL_MASUK, pesanPemulihanSesi, pulihkanSesi } from '@recomp/logika';
import type { HasilPulihkanSesi, KodeGagalMasuk, SesiTersimpan } from '@recomp/logika';
import { batalkanSemuaPengingat } from '@/lib/notifikasi';
import {
  mockBacaSesi,
  mockHapusSesi,
  mockKeluar,
  mockKirimAturUlang,
  mockMasuk,
  mockSimpanSesi,
  type PenggunaTiruan,
} from '@/mocks/sesi';

/**
 * Sesi login, satu untuk seluruh app.
 *
 * Tata letak akar memakai `status` untuk memilih tumpukan layar: layar masuk
 * saat `keluar`, app saat `masuk`. Tidak ada layar yang memeriksa sesi
 * sendiri-sendiri — pengguna yang keluar tidak bisa "tertinggal" di satu layar
 * yang lupa memeriksa.
 *
 * Masuk otomatis: saat app dibuka, sesi tersimpan dibaca (`memuat`), lalu
 * dinilai `pulihkanSesi` — masih berlaku → langsung masuk dan masa berlakunya
 * digeser; berakhir → layar masuk dengan email terisi dan satu kalimat yang
 * menjelaskan kenapa. Aturan yang sama dipakai lagi setiap app kembali ke
 * depan, karena app bisa berhari-hari di latar tanpa ditutup.
 *
 * Fase 4 sisi frontend: backend-nya tiruan (`@/mocks/sesi`); task backend
 * menukarnya dengan Supabase Auth (akun yang sama dengan web) tanpa mengubah
 * antarmuka ini.
 */

export class KesalahanMasuk extends Error {
  constructor(readonly kode: KodeGagalMasuk) {
    super(PESAN_GAGAL_MASUK[kode]);
    this.name = 'KesalahanMasuk';
  }
}

/** Kenapa app terbuka di layar masuk, bila ada yang perlu dikatakan. */
export type Pemulihan = { pesan: string | null; email: string | null };

type KonteksSesi = {
  status: 'memuat' | 'keluar' | 'masuk';
  pengguna: PenggunaTiruan | null;
  pemulihan: Pemulihan;
  /** Melempar KesalahanMasuk dengan pesan yang layak tampil. */
  masuk: (email: string, sandi: string) => Promise<void>;
  keluar: () => Promise<void>;
  kirimAturUlangSandi: (email: string) => Promise<void>;
};

const TANPA_PEMULIHAN: Pemulihan = { pesan: null, email: null };

const Konteks = createContext<KonteksSesi | null>(null);

export function PenyediaSesi({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<KonteksSesi['status']>('memuat');
  const [pengguna, setPengguna] = useState<PenggunaTiruan | null>(null);
  const [pemulihan, setPemulihan] = useState<Pemulihan>(TANPA_PEMULIHAN);
  /** Sesi yang berlaku; ref karena dibaca pendengar AppState. */
  const sesi = useRef<SesiTersimpan | null>(null);

  const mulai = useCallback((s: SesiTersimpan) => {
    sesi.current = s;
    void mockSimpanSesi(s);
    setPengguna(s.pengguna);
    setPemulihan(TANPA_PEMULIHAN);
    setStatus('masuk');
  }, []);

  /** Keluar karena pilihan pengguna ATAU sesi berakhir: perangkat dilupakan. */
  const akhiri = useCallback(async (p: Pemulihan) => {
    sesi.current = null;
    await mockHapusSesi();
    // Pengingat lokal milik akun ini; gagal membatalkan tidak menahan keluar.
    await batalkanSemuaPengingat().catch(() => undefined);
    setPengguna(null);
    setPemulihan(p);
    setStatus('keluar');
  }, []);

  const nilaiHasil = useCallback(
    (h: HasilPulihkanSesi) => {
      if (h.sesi) return mulai(h.sesi);
      void akhiri({ pesan: pesanPemulihanSesi(h.alasan), email: h.email ?? null });
    },
    [mulai, akhiri],
  );

  // Saat app dibuka: pulihkan sesi tersimpan.
  useEffect(() => {
    let batal = false;
    void mockBacaSesi().then((teks) => {
      if (!batal) nilaiHasil(pulihkanSesi(teks, new Date()));
    });
    return () => {
      batal = true;
    };
  }, [nilaiHasil]);

  // Kembali ke depan: aturan yang sama pada sesi yang sedang berjalan.
  useEffect(() => {
    const langganan = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !sesi.current) return;
      nilaiHasil(pulihkanSesi(JSON.stringify(sesi.current), new Date()));
    });
    return () => langganan.remove();
  }, [nilaiHasil]);

  const masuk = useCallback(
    async (email: string, sandi: string) => {
      let p: PenggunaTiruan;
      try {
        p = await mockMasuk(email, sandi);
      } catch (e) {
        throw new KesalahanMasuk(kodeGagalMasuk(e as { code?: string; status?: number; message?: string }));
      }
      mulai(buatSesiTersimpan(p, new Date()));
    },
    [mulai],
  );

  const keluar = useCallback(async () => {
    await mockKeluar();
    await akhiri(TANPA_PEMULIHAN);
  }, [akhiri]);

  const nilai = useMemo<KonteksSesi>(
    () => ({ status, pengguna, pemulihan, masuk, keluar, kirimAturUlangSandi: mockKirimAturUlang }),
    [status, pengguna, pemulihan, masuk, keluar],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca sesi. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useSesi(): KonteksSesi {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useSesi dipakai di luar <PenyediaSesi>');
  return nilai;
}
