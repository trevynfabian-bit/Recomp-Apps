import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography, ukuranIkon } from '@/theme';
import { Card } from './Card';
import { Tombol } from './Tombol';

/**
 * Tempat keadaan ditampilkan:
 * - `kartu`: di antara kartu-kartu lain di layar (paling umum).
 * - `polos`: di dalam kartu/sheet yang sudah ada, tanpa kartu tambahan.
 * - `layar`: menggantikan seluruh layar (mis. data dasar app belum termuat).
 */
export type TampilanKeadaan = 'kartu' | 'polos' | 'layar';

type Aksi = { label: string; onPress: () => void };

type Props = {
  judul: string;
  /** Satu-dua kalimat: apa yang terjadi dan apa yang bisa dilakukan. */
  keterangan?: string;
  /** Aksi utama (mis. "Tambah hasil lab", "Coba lagi"). */
  aksi?: Aksi;
  /** Aksi kedua yang lebih ringan (mis. "Keluar"). */
  aksiKedua?: Aksi;
  tampilan?: TampilanKeadaan;
};

/** Bingkai bersama ketiga keadaan: kartu, polos, atau layar penuh. */
function Bingkai({ tampilan, children }: { tampilan: TampilanKeadaan; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  if (tampilan === 'kartu') return <Card style={{ gap: spacing.sm }}>{children}</Card>;
  if (tampilan === 'polos') return <View style={{ gap: spacing.sm }}>{children}</View>;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.latar,
        justifyContent: 'center',
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.xl,
        paddingHorizontal: spacing.lg,
        gap: spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

function DeretAksi({ aksi, aksiKedua, utamaBertepi }: { aksi?: Aksi; aksiKedua?: Aksi; utamaBertepi: boolean }) {
  if (!aksi && !aksiKedua) return null;
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
      {aksi ? <Tombol label={aksi.label} onPress={aksi.onPress} varian={utamaBertepi ? 'bertepi' : 'utama'} /> : null}
      {aksiKedua ? <Tombol label={aksiKedua.label} onPress={aksiKedua.onPress} varian="bertepi" /> : null}
    </View>
  );
}

/**
 * Sedang memuat. Spinner + kalimat yang menyebut APA yang dimuat ("Memuat
 * target harian…"), bukan sekadar "Memuat…". Diumumkan ke pembaca layar.
 */
export function KeadaanMemuat({ label, tampilan = 'polos' }: { label: string; tampilan?: TampilanKeadaan }) {
  return (
    <Bingkai tampilan={tampilan}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={label}
        style={{ flexDirection: tampilan === 'layar' ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}
      >
        <ActivityIndicator color={colors.aksen.isian} />
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{label}</Text>
      </View>
    </Bingkai>
  );
}

/**
 * Belum ada data. Nadanya netral dan menjelaskan apa yang akan tampil di sini
 * serta cara mengisinya — bukan pesan galat.
 */
export function KeadaanKosong({
  judul,
  keterangan,
  aksi,
  aksiKedua,
  tampilan = 'kartu',
  ikon,
}: Props & { ikon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <Bingkai tampilan={tampilan}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {ikon ? <Ionicons name={ikon} size={ukuranIkon.kecil} color={colors.teksRedup} /> : null}
        <Text accessibilityRole="header" style={{ ...typography.bodySedang, color: colors.teks, flex: 1 }}>
          {judul}
        </Text>
      </View>
      {keterangan ? <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{keterangan}</Text> : null}
      <DeretAksi aksi={aksi} aksiKedua={aksiKedua} utamaBertepi={false} />
    </Bingkai>
  );
}

/**
 * Gagal memuat/menyimpan. Selalu menyebut apa yang gagal, kalimat sebabnya
 * yang layak tampil, dan jalan keluar (biasanya "Coba lagi"). Ikon + judul,
 * tidak pernah warna saja; diumumkan ke pembaca layar.
 */
export function KeadaanGagal({ judul, keterangan, aksi, aksiKedua, tampilan = 'kartu' }: Props) {
  return (
    <Bingkai tampilan={tampilan}>
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="alert-circle-outline" size={ukuranIkon.kecil} color={colors.status.bahaya.teks} />
          <Text
            accessibilityRole="header"
            style={{ ...(tampilan === 'layar' ? typography.title : typography.bodySedang), color: colors.teks, flex: 1 }}
          >
            {judul}
          </Text>
        </View>
        {keterangan ? (
          <Text style={{ ...(tampilan === 'layar' ? typography.body : typography.labelBiasa), color: colors.teksRedup }}>
            {keterangan}
          </Text>
        ) : null}
      </View>
      {/* Di layar penuh "Coba lagi" adalah satu-satunya jalan, jadi utama;
          di kartu ia aksi kedua di antara isi layar lain, jadi bertepi. */}
      <DeretAksi aksi={aksi} aksiKedua={aksiKedua} utamaBertepi={tampilan !== 'layar'} />
    </Bingkai>
  );
}
