import { createContext, useContext } from 'react';
import { useColorScheme, View, type ColorSchemeName } from 'react-native';
import { colors, terapkanSkema, type Skema } from './colors';

const KonteksSkema = createContext<Skema>('gelap');

/**
 * Setelan tampilan sistem → skema app. Hanya 'light' yang eksplisit memilih
 * terang; `null`/'unspecified' (sistem lama, web tanpa preferensi) jatuh ke
 * gelap, mode utama app. Murni, supaya bisa diuji tanpa perangkat.
 */
export function skemaDariSistem(sistem: ColorSchemeName | 'unspecified' | undefined): Skema {
  return sistem === 'light' ? 'terang' : 'gelap';
}

/**
 * Skema warna yang berlaku, mengikuti setelan terang/gelap sistem.
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
  const skema = skemaDariSistem(useColorScheme());
  // Sengaja di dalam render, bukan efek: anak-anak di bawah harus sudah
  // membaca palet baru pada render yang sama. Idempoten.
  terapkanSkema(skema);
  return (
    <KonteksSkema.Provider value={skema}>
      {/* Latar akar: terlihat sekejap saat navigator dipasang ulang dan di balik
          layar yang belum selesai digambar, jadi ikut skema juga. */}
      <View style={{ flex: 1, backgroundColor: colors.latar }}>{children}</View>
    </KonteksSkema.Provider>
  );
}

/** Skema yang berlaku: 'gelap' atau 'terang'. */
export function useSkema(): Skema {
  return useContext(KonteksSkema);
}
