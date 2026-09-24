import type { TextStyle } from 'react-native';

/**
 * Token pratinjau widget layar kunci iOS (`PratinjauWidget`).
 *
 * Sengaja TIDAK ikut skema app dan TIDAK memakai palet semantik: iOS
 * menggambar widget layar kunci monokrom (vibrant) di atas wallpaper, apa pun
 * mode app-nya. Tiga tingkat putih transparan ini meniru itu; aksen amber atau
 * coral di sini akan menjanjikan warna yang tidak pernah muncul di layar kunci
 * sungguhan. Huruf dan ukurannya mengikuti iOS, bukan skala tipografi app.
 */
export const layarKunci = {
  warna: {
    /** Wallpaper tiruan: gelap netral, sama di mode gelap dan terang. */
    latar: '#0B0C10',
    /** Jam layar kunci. */
    jam: '#E9EAEE',
    /** Teks utama widget. */
    teks: '#FFFFFF',
    /** Label, satuan, baris kedua (putih 70%). */
    teksRedup: '#FFFFFFB3',
    /** Isian widget persegi dan jalur cincin (putih 14%). */
    isian: '#FFFFFF24',
  },
  huruf: {
    jam: { fontSize: 56, fontWeight: '300', letterSpacing: -1.5 },
    angkaCincin: { fontWeight: '700' },
    /** 9 pt: satuan di dalam cincin widget bundar iOS; di bawah TEKS_MIN karena meniru sistem. */
    satuanCincin: { fontSize: 9, fontWeight: '600' },
    barisKedua: { fontWeight: '500' },
  } satisfies Record<string, TextStyle>,
  ukuran: {
    /** Widget bundar iOS. */
    cincin: 72,
    tebalCincin: 6,
    /** Widget persegi (accessoryRectangular) iOS. */
    persegiLebar: 160,
    persegiTinggiMin: 72,
    /** Jarak antarbaris di widget persegi, serapat iOS. */
    jarakBaris: 1,
  },
} as const;
