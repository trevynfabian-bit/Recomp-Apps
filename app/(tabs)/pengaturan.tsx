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
 * Baru berisi pintu ke Sumber Data; target per tipe hari, fase program,
 * profil, dan preferensi satuan menyusul. Baris sumber data sengaja TIDAK
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sumber data: Apple Health, WHOOP, Strava, Hevy"
            accessibilityHint="Membuka status sinkron tiap sumber"
            onPress={() => {
              ketukRingan();
              router.push('/sumber-data');
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
            <Ionicons name="sync-outline" size={22} color={colors.textMuted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>
                Sumber data
              </Text>
              <Text style={{ ...typography.label, color: colors.textFaint }}>
                Apple Health, WHOOP, Strava, Hevy
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        </Card>
      </View>

      <Text style={{ ...typography.label, color: colors.textFaint, lineHeight: 19 }}>
        Target per tipe hari, fase program, profil, dan preferensi satuan menyusul di sini.
      </Text>
    </ScrollView>
  );
}
