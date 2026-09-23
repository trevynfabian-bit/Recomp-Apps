import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  buatSesiTersimpan,
  kodeGagalMasuk,
  PESAN_GAGAL_MASUK,
  pesanGagalAturUlang,
  pesanPemulihanSesi,
  pulihkanSesi,
  putuskanSesi,
} from '@recomp/logika';
import type { KeputusanSesi, KodeGagalMasuk, SesiServer, SesiTersimpan } from '@recomp/logika';
import { authSupabase, type AuthApp, type Pengguna } from '@/data/auth';
import { dalamBatasWaktu } from '@/lib/batasWaktu';
import { hapusSemuaCadangan } from '@/lib/cadangan';
import { batalkanSemuaPengingat } from '@/lib/notifikasi';
import { supabase, supabaseSiap } from '@/lib/supabase';
import { authTiruan } from '@/mocks/sesi';

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
 * Backend-nya Supabase Auth, akun yang sama dengan web (`@/data/auth`);
 * tanpa kredensial Supabase, tiruan (`@/mocks/sesi`) dengan antarmuka yang
 * sama. Dua catatan dinilai bersama oleh `putuskanSesi`: catatan sesi milik
 * app (gerbang 30 hari) dan sesi Supabase — dicabut dari web (kata sandi
 * diganti, keluar dari semua perangkat) berarti app ikut keluar, saat dibuka
 * maupun saat sedang dipakai.
 */

const auth: AuthApp = supabaseSiap ? authSupabase : authTiruan;

export class KesalahanMasuk extends Error {
  constructor(readonly kode: KodeGagalMasuk) {
    super(PESAN_GAGAL_MASUK[kode]);
    this.name = 'KesalahanMasuk';
  }
}

/** Tautan atur ulang tidak terkirim; `message` layak tampil apa adanya. */
export class KesalahanAturUlang extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'KesalahanAturUlang';
  }
}

/** Kenapa app terbuka di layar masuk, bila ada yang perlu dikatakan. */
export type Pemulihan = { pesan: string | null; email: string | null };

type KonteksSesi = {
  status: 'memuat' | 'keluar' | 'masuk';
  pengguna: Pengguna | null;
  pemulihan: Pemulihan;
  /** Melempar KesalahanMasuk dengan pesan yang layak tampil. */
  masuk: (email: string, sandi: string) => Promise<void>;
  /** Tidak pernah melempar: perangkat selalu keluar, server atau tidak. */
  keluar: () => Promise<void>;
  /** Melempar KesalahanAturUlang dengan pesan yang layak tampil. */
  kirimAturUlangSandi: (email: string) => Promise<void>;
};

const TANPA_PEMULIHAN: Pemulihan = { pesan: null, email: null };

/** Paling lama menunggu server saat keluar. */
const BATAS_KELUAR_MS = 3000;

/**
 * Paling lama menunggu server saat masuk atau meminta tautan atur ulang.
 * Sinyal yang putus-sambung bisa membuat permintaan menggantung tanpa galat;
 * tombol yang berputar tanpa akhir lebih buruk daripada pesan "tidak bisa
 * terhubung" yang bisa dicoba lagi.
 */
const BATAS_MASUK_MS = 15000;

/**
 * Paling lama menunggu Supabase saat app dibuka. Lewat dari ini dianggap
 * tidak pasti (`putuskanSesi`): app terbuka dengan catatannya sendiri, bukan
 * tertahan di layar memuat karena sinyal lemah.
 */
const BATAS_PERIKSA_MS = 4000;

const Konteks = createContext<KonteksSesi | null>(null);

export function PenyediaSesi({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<KonteksSesi['status']>('memuat');
  const [pengguna, setPengguna] = useState<Pengguna | null>(null);
  const [pemulihan, setPemulihan] = useState<Pemulihan>(TANPA_PEMULIHAN);
  /** Sesi yang berlaku; ref karena dibaca pendengar AppState. */
  const sesi = useRef<SesiTersimpan | null>(null);
  /**
   * Pencabutan sesi Supabase yang mungkin masih berjalan (keluar yang lewat
   * batas waktu, pembersihan sisa sesi). Masuk menunggunya lebih dulu, supaya
   * pencabutan yang terlambat tidak menghapus sesi BARU.
   */
  const pencabutan = useRef<Promise<unknown>>(Promise.resolve());

  const mulai = useCallback((s: SesiTersimpan) => {
    sesi.current = s;
    void auth.catatan.simpan(s);
    setPengguna(s.pengguna);
    setPemulihan(TANPA_PEMULIHAN);
    setStatus('masuk');
  }, []);

  /** Keluar karena pilihan pengguna ATAU sesi berakhir: perangkat dilupakan. */
  const akhiri = useCallback(async (p: Pemulihan) => {
    sesi.current = null;
    await auth.catatan.hapus();
    // Pengingat lokal & salinan data milik akun ini; gagal membersihkan tidak menahan keluar.
    await batalkanSemuaPengingat().catch(() => undefined);
    await hapusSemuaCadangan();
    setPengguna(null);
    setPemulihan(p);
    setStatus('keluar');
  }, []);

  const jalankan = useCallback(
    (k: KeputusanSesi) => {
      if (k.masuk) return mulai(k.masuk);
      if (k.bersihkanServer) pencabutan.current = auth.bersihkan();
      void akhiri({ pesan: pesanPemulihanSesi(k.alasan), email: k.email ?? null });
    },
    [mulai, akhiri],
  );

  // Saat app dibuka: catatan app lalu sesi Supabase, dinilai bersama.
  useEffect(() => {
    let batal = false;
    void (async () => {
      const lokal = pulihkanSesi(await auth.catatan.baca(), new Date());
      // Tanpa catatan yang berlaku, server tidak perlu ditanya: app tetap keluar.
      const server: SesiServer = lokal.sesi
        ? await dalamBatasWaktu(auth.sesiServer(), BATAS_PERIKSA_MS).catch(() => ({ ada: 'tidak-pasti' }) as const)
        : { ada: 'tidak-pasti' };
      if (!batal) jalankan(putuskanSesi(lokal, server, new Date()));
    })();
    return () => {
      batal = true;
    };
  }, [jalankan]);

  // Kembali ke depan: batas 30 hari pada sesi yang sedang berjalan. Sesi
  // Supabase tidak ditanya di sini; bila dicabut, pendengar di bawah yang tahu.
  useEffect(() => {
    const langganan = AppState.addEventListener('change', (s) => {
      // Di perangkat, Supabase memperbarui token hanya selama app di depan.
      if (supabaseSiap && Platform.OS !== 'web') {
        if (s === 'active') supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
      }
      if (s !== 'active' || !sesi.current) return;
      const lokal = pulihkanSesi(JSON.stringify(sesi.current), new Date());
      jalankan(putuskanSesi(lokal, { ada: 'tidak-pasti' }, new Date()));
    });
    return () => langganan.remove();
  }, [jalankan]);

  // Supabase mengakhiri sesi dari sisinya (token pembaru dicabut/berakhir)
  // saat app sedang dipakai. Keluar yang dipilih sendiri tidak lewat sini:
  // `sesi.current` sudah dikosongkan lebih dulu.
  useEffect(
    () =>
      auth.dengarkanBerakhir(() => {
        const s = sesi.current;
        if (!s) return;
        void akhiri({ pesan: pesanPemulihanSesi('berakhir'), email: s.pengguna.email });
      }),
    [akhiri],
  );

  const masuk = useCallback(
    async (email: string, sandi: string) => {
      await dalamBatasWaktu(pencabutan.current, BATAS_KELUAR_MS).catch(() => undefined);
      let p: Pengguna;
      try {
        p = await dalamBatasWaktu(auth.masuk(email, sandi), BATAS_MASUK_MS);
      } catch (e) {
        throw new KesalahanMasuk(kodeGagalMasuk(e as { code?: string; status?: number; message?: string }));
      }
      mulai(buatSesiTersimpan(p, new Date()));
    },
    [mulai],
  );

  const keluar = useCallback(async () => {
    // Server lebih dulu (mencabut sesinya di sana), tetapi perangkat SELALU
    // keluar: tanpa jaringan pun, orang yang mengetuk Keluar harus benar-benar
    // keluar — bukan tertahan di app menunggu server yang tidak terjangkau.
    // Catatan dikosongkan lebih dulu supaya pendengar sesi berakhir tidak
    // menganggap keluar ini sebagai sesi yang dicabut.
    sesi.current = null;
    const cabut = auth.keluar();
    pencabutan.current = cabut.catch(() => undefined);
    await dalamBatasWaktu(cabut, BATAS_KELUAR_MS).catch(() => undefined);
    await akhiri(TANPA_PEMULIHAN);
  }, [akhiri]);

  const kirimAturUlangSandi = useCallback(async (email: string) => {
    try {
      await dalamBatasWaktu(auth.kirimAturUlang(email), BATAS_MASUK_MS);
    } catch (e) {
      const pesan = pesanGagalAturUlang(kodeGagalMasuk(e as { code?: string; status?: number; message?: string }));
      // null: dijawab seperti terkirim (tidak membocorkan email mana yang terdaftar).
      if (pesan) throw new KesalahanAturUlang(pesan);
    }
  }, []);

  const nilai = useMemo<KonteksSesi>(
    () => ({ status, pengguna, pemulihan, masuk, keluar, kirimAturUlangSandi }),
    [status, pengguna, pemulihan, masuk, keluar, kirimAturUlangSandi],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}

/** Baca sesi. Melempar bila dipakai di luar penyedia — itu bug, bukan keadaan. */
export function useSesi(): KonteksSesi {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('useSesi dipakai di luar <PenyediaSesi>');
  return nilai;
}
