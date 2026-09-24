import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { terapkanSkema, type Skema } from './colors';

const KonteksSkema = createContext<Skema>('gelap');

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
 * atas navigator dan tidak hilang; yang kembali ke awal hanya posisi navigasi.
 */
export function PenyediaSkema({ children }: { children: React.ReactNode }) {
  const sistem = useColorScheme();
  const skema: Skema = sistem === 'light' ? 'terang' : 'gelap';
  // Sengaja di dalam render, bukan efek: anak-anak di bawah harus sudah
  // membaca palet baru pada render yang sama. Idempoten.
  terapkanSkema(skema);
  return <KonteksSkema.Provider value={skema}>{children}</KonteksSkema.Provider>;
}

/** Skema yang berlaku: 'gelap' atau 'terang'. */
export function useSkema(): Skema {
  return useContext(KonteksSkema);
}
