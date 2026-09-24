import type { HasilHubungkan, KoneksiSumber, SumberData } from '@recomp/logika';
import type { KejadianMasuk } from '@/state/sinkron';

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

/** Jeda tiruan, supaya keadaan "menunggu izin" sempat terlihat dan bisa dibatalkan. */
const JEDA_HUBUNGKAN_MS = 1400;
const JEDA_PUTUSKAN_MS = 600;

/**
 * Tiruan otorisasi. Semua berhasil KECUALI kunci Hevy yang berakhiran `0000`,
 * yang ditolak — satu-satunya cara melihat keadaan "kunci tidak diterima" tanpa
 * server. Task backend menukar fungsi ini dengan izin HealthKit, OAuth, dan
 * penyimpanan kunci di server; kunci TIDAK pernah disimpan di perangkat.
 */
export function mockHubungkan(sumber: SumberData, kunci: string | null): Promise<HasilHubungkan> {
  return new Promise((selesai) =>
    setTimeout(() => {
      if (sumber === 'hevy' && kunci?.endsWith('0000')) {
        selesai({ ok: false, alasan: 'kunci-ditolak' });
      } else {
        selesai({ ok: true });
      }
    }, JEDA_HUBUNGKAN_MS),
  );
}

/** Tiruan pemutusan; `hapusData` diabaikan karena tidak ada data sungguhan. */
export function mockPutuskan(_sumber: SumberData, _hapusData: boolean): Promise<void> {
  return new Promise((selesai) => setTimeout(selesai, JEDA_PUTUSKAN_MS));
}

/**
 * Satu kiriman tiruan lewat Realtime: langkah dan energi aktif dari Apple
 * Health. Sengaja BUKAN berat pagi — berat yang diganti diam-diam oleh sinkron
 * adalah keputusan tersendiri (sumber mana yang menang), bukan urusan tiruan
 * indikator.
 */
export function mockKejadianMasuk(sekarang: Date = new Date()): KejadianMasuk {
  return {
    id: `masuk-${sekarang.getTime()}`,
    sumber: 'apple_health',
    waktu: sekarang.toISOString(),
    masuk: [
      { label: 'langkah', jumlah: 1204 },
      { label: 'kcal energi aktif', jumlah: 86 },
    ],
  };
}

/**
 * Sinkron manual tiruan: jeda seperti menarik dari layanan, lalu yang masuk.
 * Hevy membawa satu sesi; sumber lain tidak membawa data baru — supaya kedua
 * kalimat hasil ("… baru" dan "tidak ada data baru") sama-sama terlihat.
 */
export function mockSinkronSekarang(sumber: SumberData): Promise<{ label: string; jumlah: number }[]> {
  return new Promise((selesai) =>
    setTimeout(() => selesai(sumber === 'hevy' ? [{ label: 'sesi latihan', jumlah: 1 }] : []), 1200),
  );
}
