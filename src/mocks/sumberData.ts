import type { KoneksiSumber } from '@recomp/logika';

/**
 * Koneksi sumber data tiruan untuk halaman Sumber Data (Fase 3, sisi frontend).
 *
 * Waktunya RELATIF terhadap `sekarang`, bukan tanggal tetap: status "terlambat"
 * dan "12 menit lalu" dihitung dari jam, dan tiruan bertanggal tetap akan
 * menampilkan semua sumber sebagai terlambat sehari setelah ditulis.
 *
 * Satu sumber sengaja bermasalah (Strava, izin dicabut) supaya keadaan yang
 * paling butuh desain — kartu yang meminta tindakan — ikut terlihat sejak awal.
 * Task backend menukar fungsi ini dengan query `health_connections`.
 */
export function mockKoneksiSumber(sekarang: Date = new Date()): KoneksiSumber[] {
  const lalu = (menit: number) => new Date(sekarang.getTime() - menit * 60_000).toISOString();
  return [
    {
      sumber: 'apple_health',
      status: 'terhubung',
      terhubungPada: lalu(60 * 24 * 40),
      sinkronTerakhir: lalu(12),
      galatTerakhir: null,
      masukHariIni: [
        { label: 'timbangan', jumlah: 1 },
        { label: 'langkah', jumlah: 8412 },
      ],
    },
    {
      sumber: 'whoop',
      status: 'terhubung',
      terhubungPada: lalu(60 * 24 * 40),
      sinkronTerakhir: lalu(60 * 3 + 20),
      galatTerakhir: null,
      masukHariIni: [{ label: 'data tidur', jumlah: 1 }],
    },
    {
      sumber: 'strava',
      status: 'terputus',
      terhubungPada: lalu(60 * 24 * 38),
      sinkronTerakhir: lalu(60 * 24 * 2 + 90),
      galatTerakhir:
        'Izin untuk app ini dicabut dari akun Strava. Sambungkan ulang agar aktivitas baru masuk lagi.',
      masukHariIni: [],
    },
    {
      sumber: 'hevy',
      status: 'terhubung',
      terhubungPada: lalu(60 * 24 * 40),
      sinkronTerakhir: lalu(47),
      galatTerakhir: null,
      masukHariIni: [{ label: 'sesi latihan', jumlah: 1 }],
    },
  ];
}
