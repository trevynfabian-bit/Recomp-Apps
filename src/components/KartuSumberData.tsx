import { Pressable, Text, View } from 'react-native';
import { formatAngka, PROFIL_SUMBER } from '@recomp/logika';
import type { KesehatanKoneksi, KoneksiSumber, TingkatKesehatan } from '@recomp/logika';
import { Card } from './Card';
import { TombolBertepi, TombolUtama } from './Tombol';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';

type Props = {
  koneksi: KoneksiSumber;
  kesehatan: KesehatanKoneksi;
  onHubungkan: () => void;
  onSinkronSekarang: () => void;
  onPutuskan: () => void;
  /**
   * Tautan ke data yang dibawa sumber ini (mis. daftar latihan Hevy). Hanya
   * tampil saat terhubung: tautan ke data dari sumber yang terputus membuka
   * layar yang isinya sudah basi tanpa mengatakannya.
   */
  tautan?: { label: string; onPress: () => void };
};

/** Tinggi teks label ±18 pt; hitSlop ini menggenapkannya jadi 44 pt (TAP_MIN). */
const HIT_SLOP_TAUTAN = Math.ceil((TAP_MIN - 18) / 2);

/**
 * Warna status. Teks kecil memakai varian `aksenTeks` supaya lolos kontras AA,
 * dan warnanya SELALU disertai label — status tidak pernah disampaikan lewat
 * warna saja.
 */
const WARNA_TINGKAT: Record<TingkatKesehatan, string> = {
  get sehat() {
    return colors.status.sukses.teks;
  },
  get menunggu() {
    return colors.teksRedup;
  },
  get terlambat() {
    return colors.status.peringatan.teks;
  },
  get bermasalah() {
    return colors.status.bahaya.teks;
  },
  get belum() {
    return colors.teksSamar;
  },
};

/**
 * Satu sumber data: nama, status, apa yang terjadi, dan SATU tindakan yang
 * relevan untuk keadaannya.
 *
 * Tindakannya dipilih menurut keadaan, bukan ditampilkan semua sekaligus:
 * kartu yang bermasalah hanya menawarkan "Sambungkan ulang", kartu yang sehat
 * hanya menawarkan "Putuskan" sebagai tautan redup. Deretan tombol yang sama
 * di setiap kartu memaksa pengguna membaca semuanya untuk menemukan satu yang
 * memang perlu ditekan.
 */
export function KartuSumberData({
  koneksi,
  kesehatan,
  onHubungkan,
  onSinkronSekarang,
  onPutuskan,
  tautan,
}: Props) {
  const profil = PROFIL_SUMBER[koneksi.sumber];
  const warna = WARNA_TINGKAT[kesehatan.tingkat];

  return (
    <Card
      style={{
        gap: spacing.md,
        // Kartu yang butuh tindakan diberi tepi berwarna; sisanya tepi halus.
        borderColor:
          kesehatan.tingkat === 'bermasalah' || kesehatan.tingkat === 'terlambat'
            ? warna + '66'
            : colors.garis,
      }}
    >
      <View
        accessible
        accessibilityLabel={`${profil.nama}: ${kesehatan.ringkas}. ${kesehatan.keterangan}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <Text style={{ ...typography.bodyTebal, color: colors.teks, flexShrink: 1 }}>
            {profil.nama}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ukuran.celahTitik }}>
            <View style={{ width: ukuran.titik, height: ukuran.titik, borderRadius: radius.pill, backgroundColor: warna }} />
            <Text style={{ ...typography.label, color: warna }}>{kesehatan.ringkas}</Text>
          </View>
        </View>

        <Text style={{ ...typography.caption, color: colors.teksSamar }}>{profil.jalur}</Text>

        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          {kesehatan.keterangan}
        </Text>

        {koneksi.status === 'terhubung' && koneksi.masukHariIni.length > 0 ? (
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Hari ini: {koneksi.masukHariIni.map((m) => `${formatAngka(m.jumlah)} ${m.label}`).join(' · ')}
          </Text>
        ) : null}
      </View>

      {tautan && koneksi.status === 'terhubung' ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tautan.label}
          onPress={() => {
            ketukRingan();
            tautan.onPress();
          }}
          hitSlop={{ top: HIT_SLOP_TAUTAN, bottom: HIT_SLOP_TAUTAN, left: spacing.sm, right: spacing.lg }}
          style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ ...typography.label, color: colors.aksen.teks }}>{tautan.label} ›</Text>
        </Pressable>
      ) : null}

      <AksiKartu
        tingkat={kesehatan.tingkat}
        nama={profil.nama}
        bisaSinkronManual={profil.mekanisme !== 'webhook'}
        onHubungkan={onHubungkan}
        onSinkronSekarang={onSinkronSekarang}
        onPutuskan={onPutuskan}
      />
    </Card>
  );
}

function AksiKartu({
  tingkat,
  nama,
  bisaSinkronManual,
  onHubungkan,
  onSinkronSekarang,
  onPutuskan,
}: {
  tingkat: TingkatKesehatan;
  nama: string;
  bisaSinkronManual: boolean;
  onHubungkan: () => void;
  onSinkronSekarang: () => void;
  onPutuskan: () => void;
}) {
  if (tingkat === 'belum' || tingkat === 'bermasalah') {
    const label = tingkat === 'belum' ? `Hubungkan ${nama}` : 'Sambungkan ulang';
    return <TombolUtama label={label} onPress={onHubungkan} />;
  }

  if (tingkat === 'terlambat' && bisaSinkronManual) {
    return <TombolBertepi label="Sinkron sekarang" onPress={onSinkronSekarang} />;
  }

  // Sehat, menunggu, atau terlambat lewat webhook: tidak ada yang perlu
  // ditekan. "Putuskan" tetap ada, tapi sebagai tautan redup — ia tindakan
  // yang jarang dan merusak, bukan ajakan.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Putuskan ${nama}`}
      onPress={() => {
        ketukRingan();
        onPutuskan();
      }}
      // Target sentuh 44 pt dicapai lewat hitSlop, bukan tinggi baris: tautan
      // redup ini tidak boleh memakan ruang sebesar tombol utama.
      hitSlop={{ top: HIT_SLOP_TAUTAN, bottom: HIT_SLOP_TAUTAN, left: spacing.sm, right: spacing.lg }}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.label, color: colors.teksSamar }}>Putuskan</Text>
    </Pressable>
  );
}
