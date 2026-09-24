import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme, View, type ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, terapkanSkema, type Skema } from './colors';

/** Pilihan pengguna di Pengaturan: ikuti sistem, atau paksa satu skema. */
export type PilihanTampilan = 'sistem' | Skema;

type NilaiSkema = {
  /** Skema yang berlaku sekarang. */
  skema: Skema;
  /** Pilihan pengguna yang menghasilkannya. */
  pilihan: PilihanTampilan;
  /** Menyimpan pilihan di perangkat ini. */
  pilih: (p: PilihanTampilan) => void;
};

const KonteksSkema = createContext<NilaiSkema>({ skema: 'gelap', pilihan: 'sistem', pilih: () => undefined });

/**
 * Kunci penyimpanan. Pilihan tampilan milik PERANGKAT, bukan akun: sengaja di
 * luar awalan cadangan per akun, jadi tidak ikut terhapus saat keluar.
 */
const KUNCI_PILIHAN = 'recomp:tampilan';

function pilihanSah(nilai: string | null): PilihanTampilan | null {
  return nilai === 'sistem' || nilai === 'gelap' || nilai === 'terang' ? nilai : null;
}

/** Pilihan + setelan sistem → skema yang berlaku. Murni. */
export function skemaBerlakuDari(pilihan: PilihanTampilan, sistem: ColorSchemeName | 'unspecified' | undefined): Skema {
  return pilihan === 'sistem' ? skemaDariSistem(sistem) : pilihan;
}

/**
 * Setelan tampilan sistem → skema app. Hanya 'light' yang eksplisit memilih
 * terang; `null`/'unspecified' (sistem lama, web tanpa preferensi) jatuh ke
 * gelap, mode utama app. Murni, supaya bisa diuji tanpa perangkat.
 */
export function skemaDariSistem(sistem: ColorSchemeName | 'unspecified' | undefined): Skema {
  return sistem === 'light' ? 'terang' : 'gelap';
}

/**
 * Skema warna yang berlaku: mengikuti setelan terang/gelap sistem, kecuali
 * pengguna memaksa salah satunya di Pengaturan (disimpan di perangkat).
 *
 * `colors` ditukar isinya SEBELUM anak-anaknya dirender, jadi setiap layar yang
 * membaca `colors.x` saat render otomatis mendapat palet yang benar. Sistem
 * yang tidak menyebut pilihannya jatuh ke gelap, mode utama app.
 *
 * Layar yang sudah terpasang tidak ikut dirender ulang hanya karena `colors`
 * berubah; `TumpukanAkar` memasang ulang navigator dengan `key={skema}` agar
 * semuanya membaca palet baru. State per akun (profil, target, dst.) ada di
 * atas navigator dan tidak hilang, dan `usePulihkanRute` membuka kembali layar
 * yang sedang dilihat setelah pemasangan ulang.
 */
export function PenyediaSkema({ children }: { children: React.ReactNode }) {
  const sistem = useColorScheme();
  const [pilihan, setPilihan] = useState<PilihanTampilan>('sistem');

  useEffect(() => {
    let batal = false;
    AsyncStorage.getItem(KUNCI_PILIHAN)
      .then((nilai) => {
        const p = pilihanSah(nilai);
        if (!batal && p) setPilihan(p);
      })
      .catch(() => undefined); // gagal membaca = ikuti sistem
    return () => {
      batal = true;
    };
  }, []);

  const pilih = useCallback((p: PilihanTampilan) => {
    setPilihan(p);
    void AsyncStorage.setItem(KUNCI_PILIHAN, p).catch(() => undefined);
  }, []);

  const skema = skemaBerlakuDari(pilihan, sistem);
  // Sengaja di dalam render, bukan efek: anak-anak di bawah harus sudah
  // membaca palet baru pada render yang sama. Idempoten.
  terapkanSkema(skema);
  return (
    <KonteksSkema.Provider value={{ skema, pilihan, pilih }}>
      {/* Latar akar: terlihat sekejap saat navigator dipasang ulang dan di balik
          layar yang belum selesai digambar, jadi ikut skema juga. */}
      <View style={{ flex: 1, backgroundColor: colors.latar }}>{children}</View>
    </KonteksSkema.Provider>
  );
}

/** Skema yang berlaku: 'gelap' atau 'terang'. */
export function useSkema(): Skema {
  return useContext(KonteksSkema).skema;
}

/** Pilihan tampilan pengguna dan cara mengubahnya (Pengaturan → Tampilan). */
export function usePilihanTampilan(): Pick<NilaiSkema, 'pilihan' | 'pilih'> {
  const { pilihan, pilih } = useContext(KonteksSkema);
  return { pilihan, pilih };
}
