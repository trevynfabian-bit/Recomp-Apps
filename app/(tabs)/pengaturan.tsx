import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, SectionHeader } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { colors, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Pengaturan.
 *
 * Berisi pintu ke Sumber data dan Widget & pengingat; target per tipe hari,
 * fase program, profil, dan preferensi satuan menyusul. Baris sumber data sengaja TIDAK
 * menampilkan hitungan "3 dari 4 aktif" di sini: hitungannya milik layar Sumber
 * Data, dan angka yang sama di dua tempat hanya berguna kalau keduanya dijamin
 * selalu sama.
 */
export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.xl,
      }}
    >
      <Text style={{ ...typography.display, color: colors.text }}>Pengaturan</Text>

      <View>
        <SectionHeader judul="Data" />
        <Card flat>
          <BarisTautan
            ikon="sync-outline"
            judul="Sumber data"
            keterangan="Apple Health, WHOOP, Strava, Hevy"
            petunjuk="Membuka status sinkron tiap sumber"
            onPress={() => router.push('/sumber-data')}
          />
        </Card>
      </View>

      <View>
        <SectionHeader judul="Notifikasi" />
        <Card flat>
          <BarisTautan
            ikon="notifications-outline"
            judul="Widget & pengingat"
            keterangan="Timbang pagi, ringkasan mingguan, layar kunci"
            petunjuk="Membuka pengaturan pengingat dan widget"
            onPress={() => router.push('/widget-pengingat')}
          />
        </Card>
      </View>

      <Text style={{ ...typography.label, color: colors.textFaint, lineHeight: 19 }}>
        Target per tipe hari, fase program, profil, dan preferensi satuan menyusul di sini.
      </Text>
    </ScrollView>
  );
}

function BarisTautan({
  ikon,
  judul,
  keterangan,
  petunjuk,
  onPress,
}: {
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  judul: string;
  keterangan: string;
  petunjuk: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${judul}: ${keterangan}`}
      accessibilityHint={petunjuk}
      onPress={() => {
        ketukRingan();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: TAP_MIN,
        padding: spacing.lg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={ikon} size={22} color={colors.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>{judul}</Text>
        <Text style={{ ...typography.label, color: colors.textFaint }}>{keterangan}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}
