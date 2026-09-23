import { Pressable, Text, View } from 'react-native';
import { formatAngka, PROFIL_SUMBER } from '@recomp/logika';
import type { KesehatanKoneksi, KoneksiSumber, TingkatKesehatan } from '@recomp/logika';
import { Card } from './Card';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

type Props = {
  koneksi: KoneksiSumber;
  kesehatan: KesehatanKoneksi;
  onHubungkan: () => void;
  onSinkronSekarang: () => void;
  onPutuskan: () => void;
};

/** Tinggi teks label ±18 pt; hitSlop ini menggenapkannya jadi 44 pt (TAP_MIN). */
const HIT_SLOP_TAUTAN = Math.ceil((TAP_MIN - 18) / 2);

/**
 * Warna status. Teks kecil memakai varian `aksenTeks` supaya lolos kontras AA,
 * dan warnanya SELALU disertai label — status tidak pernah disampaikan lewat
 * warna saja.
 */
const WARNA_TINGKAT: Record<TingkatKesehatan, string> = {
  sehat: colors.aksenTeks.jade,
  menunggu: colors.textMuted,
  terlambat: colors.amber,
  bermasalah: colors.aksenTeks.coral,
  belum: colors.textFaint,
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
            : colors.border,
      }}
    >
      <View
        accessible
        accessibilityLabel={`${profil.nama}: ${kesehatan.ringkas}. ${kesehatan.keterangan}`}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <Text style={{ ...typography.body, fontWeight: '700', color: colors.text, flexShrink: 1 }}>
            {profil.nama}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: warna }} />
            <Text style={{ ...typography.label, color: warna }}>{kesehatan.ringkas}</Text>
          </View>
        </View>

        <Text style={{ ...typography.caption, color: colors.textFaint }}>{profil.jalur}</Text>

        <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
          {kesehatan.keterangan}
        </Text>

        {koneksi.status === 'terhubung' && koneksi.masukHariIni.length > 0 ? (
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
            Hari ini: {koneksi.masukHariIni.map((m) => `${formatAngka(m.jumlah)} ${m.label}`).join(' · ')}
          </Text>
        ) : null}
      </View>

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
      <Text style={{ ...typography.label, color: colors.textFaint }}>Putuskan</Text>
    </Pressable>
  );
}

function TombolUtama({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TAP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.amber,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ ...typography.body, fontWeight: '700', color: colors.bg }}>{label}</Text>
    </Pressable>
  );
}

function TombolBertepi({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: TAP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderKuat,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
