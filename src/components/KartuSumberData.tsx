import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { formatAngka, PROFIL_SUMBER } from '@recomp/logika';
import type { KesehatanKoneksi, KoneksiSumber, TingkatKesehatan } from '@recomp/logika';
import { Card } from './Card';
import { Tombol } from './Tombol';

import { colors, radius, spacing, tint, typography, ukuran, ukuranIkon } from '@/theme';

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
  /** Sinkron manual yang sedang berjalan atau baru selesai (kalimat hasilnya). */
  sinkron?: { berjalan: boolean; hasil: string | null };
};

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
  sinkron,
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
            ? tint(warna, 'tepiKuat')
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
        <Tombol varian="teks" ukuran="kecil" sejajar="awal" label={tautan.label} onPress={tautan.onPress} />
      ) : null}

      {/* Hasil sinkron manual: dikatakan juga saat tidak ada yang baru, supaya
          "sudah diperiksa" tidak dikira "belum jalan". */}
      {sinkron?.hasil ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name="checkmark-circle" size={ukuranIkon.kecil} color={colors.status.sukses.teks} />
          <Text style={{ ...typography.labelBiasa, color: colors.teksRedup, flex: 1 }}>{sinkron.hasil}</Text>
        </View>
      ) : null}

      <AksiKartu
        memproses={sinkron?.berjalan ?? false}
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
  memproses,
  tingkat,
  nama,
  bisaSinkronManual,
  onHubungkan,
  onSinkronSekarang,
  onPutuskan,
}: {
  memproses: boolean;
  tingkat: TingkatKesehatan;
  nama: string;
  bisaSinkronManual: boolean;
  onHubungkan: () => void;
  onSinkronSekarang: () => void;
  onPutuskan: () => void;
}) {
  if (tingkat === 'belum' || tingkat === 'bermasalah') {
    const label = tingkat === 'belum' ? `Hubungkan ${nama}` : 'Sambungkan ulang';
    return <Tombol label={label} onPress={onHubungkan} />;
  }

  if (tingkat === 'terlambat' && bisaSinkronManual) {
    return (
      <Tombol
        varian="bertepi"
        label={memproses ? 'Menyinkron…' : 'Sinkron sekarang'}
        memproses={memproses}
        onPress={onSinkronSekarang}
      />
    );
  }

  // Sehat, menunggu, atau terlambat lewat webhook: tidak ada yang perlu
  // ditekan. "Putuskan" tetap ada, tapi sebagai tautan redup — ia tindakan
  // yang jarang dan merusak, bukan ajakan.
  // Sumber yang ditarik app (bukan webhook) boleh disinkron manual kapan saja;
  // saat sehat cukup sebagai tautan kecil di samping Putuskan.
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg }}>
      {bisaSinkronManual ? (
        <Tombol
          varian="teks"
          ukuran="kecil"
          label={memproses ? 'Menyinkron…' : 'Sinkron sekarang'}
          aksesLabel={`Sinkron ${nama} sekarang`}
          memproses={memproses}
          onPress={onSinkronSekarang}
        />
      ) : null}
      <Tombol
        varian="teks"
        ukuran="kecil"
        nada="netral"
        label="Putuskan"
        aksesLabel={`Putuskan ${nama}`}
        onPress={() => onPutuskan()}
      />
    </View>
  );
}
