import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { statusSinkronApp } from '@recomp/logika';
import type { TingkatSinkronApp } from '@recomp/logika';
import { ketukRingan } from '@/lib/haptics';
import { useSinkron } from '@/state/sinkron';
import { colors, radius, sisaSentuh, spacing, TAP_MIN, tint, typography, ukuran } from '@/theme';

/** Warna titik status; SELALU disertai label, tidak pernah warna saja. */
const WARNA: Record<TingkatSinkronApp, string> = {
  get langsung() {
    return colors.status.sukses.teks;
  },
  get menyinkron() {
    return colors.teksRedup;
  },
  get menyambung() {
    return colors.teksRedup;
  },
  get perhatian() {
    return colors.status.bahaya.teks;
  },
  get terputus() {
    return colors.status.peringatan.teks;
  },
};

/**
 * Indikator sinkron kecil di kepala layar: apakah angka di layar ini segar.
 *
 * Kecil dengan sengaja. Sebagian besar waktu isinya "Langsung", dan indikator
 * yang berteriak saat semuanya baik-baik saja hanya mengajari orang untuk tidak
 * melihatnya. Ketukannya membuka Sumber data — tempat setiap keadaan selain
 * "Langsung" punya tindakannya.
 */
export function IndikatorSinkron() {
  const router = useRouter();
  const { keadaan, sekarang } = useSinkron();
  const status = statusSinkronApp(keadaan, sekarang);
  const warna = WARNA[status.tingkat];
  const sibuk = status.tingkat === 'menyinkron' || status.tingkat === 'menyambung';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.aksesLabel}
      accessibilityHint="Membuka Sumber data"
      accessibilityState={{ busy: sibuk }}
      onPress={() => {
        ketukRingan();
        router.push('/sumber-data');
      }}
      hitSlop={{ top: sisaSentuh(24), bottom: sisaSentuh(24) }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: ukuran.celahTitik,
        minHeight: 24,
        paddingHorizontal: ukuran.chip.horizontal,
        borderRadius: radius.pill,
        backgroundColor: colors.permukaan,
        borderWidth: 1,
        borderColor: status.tingkat === 'langsung' ? colors.garis : tint(warna, 'tepiKuat'),
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {sibuk ? (
        <ActivityIndicator size="small" color={warna} style={{ transform: [{ scale: 0.6 }], width: 8, height: 8 }} />
      ) : (
        <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: warna }} />
      )}
      <Text style={{ ...typography.caption, color: status.tingkat === 'langsung' ? colors.teksRedup : warna }}>
        {status.label}
      </Text>
    </Pressable>
  );
}
