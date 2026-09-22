import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDesimal, formatTanggalPanjang } from '@recomp/logika';
import { Card, SectionHeader } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { mockUkuran } from '@/mocks/ukuran';
import { useProfil } from '@/state/profil';
import type { BarisUkuran, UkuranTubuh } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/** Urutan tampil; label pendek supaya muat di dua kolom. */
const BAGIAN: { kunci: BarisUkuran['kunci']; label: string; pasangan?: 'kiri' | 'kanan' }[] = [
  { kunci: 'pinggang_cm', label: 'Pinggang' },
  { kunci: 'dada_cm', label: 'Dada' },
  { kunci: 'leher_cm', label: 'Leher' },
  { kunci: 'lengan_kiri_cm', label: 'Lengan kiri', pasangan: 'kiri' },
  { kunci: 'lengan_kanan_cm', label: 'Lengan kanan', pasangan: 'kanan' },
  { kunci: 'paha_kiri_cm', label: 'Paha kiri', pasangan: 'kiri' },
  { kunci: 'paha_kanan_cm', label: 'Paha kanan', pasangan: 'kanan' },
];

/**
 * Layar Ukuran Tubuh.
 *
 * Ukuran melengkapi berat, bukan menggantikannya: berat bisa datar sementara
 * pinggang mengecil dan lengan membesar — itu justru rekomposisi yang berhasil,
 * dan tidak akan terlihat sama sekali dari timbangan.
 *
 * Fase 1 memakai data tiruan. Estimasi body fat Navy dan alert batas pinggang
 * dipasang di task berikutnya pada halaman ini.
 */
export default function UkuranScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profil } = useProfil();

  const terbaru = mockUkuran[mockUkuran.length - 1];
  const sebelumnya = mockUkuran[mockUkuran.length - 2] ?? null;
  const pertama = mockUkuran[0] ?? null;

  const baris: BarisUkuran[] = BAGIAN.map((b) => ({
    ...b,
    nilai: terbaru[b.kunci],
    selisih: sebelumnya ? bulat(terbaru[b.kunci] - sebelumnya[b.kunci]) : null,
  }));

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali"
          onPress={() => {
            ketukRingan();
            router.back();
          }}
          style={({ pressed }) => ({
            width: TAP_MIN,
            height: TAP_MIN,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ ...typography.title, color: colors.text }}>‹</Text>
        </Pressable>
        <View>
          <Text style={{ ...typography.title, color: colors.text }}>Ukuran tubuh</Text>
          <Text style={{ ...typography.label, color: colors.textFaint, marginTop: 2 }}>
            Terakhir {formatTanggalPanjang(terbaru.tanggal)}
          </Text>
        </View>
      </View>

      {/* Pinggang jadi angka utama: ia penanda lemak perut yang paling responsif */}
      <Card style={{ paddingVertical: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
            Pinggang
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <Text style={{ ...typography.hero, color: colors.text }}>
              {formatDesimal(terbaru.pinggang_cm)}
            </Text>
            <Text style={{ ...typography.title, color: colors.textFaint, paddingBottom: spacing.md }}>
              cm
            </Text>
          </View>
          {pertama ? (
            <Text style={{ ...typography.label, color: colors.textMuted }}>
              {selisihTeks(terbaru.pinggang_cm - pertama.pinggang_cm)} sejak{' '}
              {formatTanggalPanjang(pertama.tanggal)}
            </Text>
          ) : null}
          <Text style={{ ...typography.caption, color: colors.textFaint, marginTop: spacing.xs }}>
            batas yang Anda tetapkan {formatDesimal(profil.batas_pinggang_cm)} cm
          </Text>
        </View>
      </Card>

      {/* Semua ukuran, dengan perubahan sejak pencatatan sebelumnya */}
      <View>
        <SectionHeader
          judul="Ukuran terbaru"
          aksi={sebelumnya ? `vs ${formatTanggalPanjang(sebelumnya.tanggal)}` : 'pencatatan pertama'}
        />
        <Card flat>
          {baris.map((b, i) => (
            <View
              key={b.kunci}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: spacing.lg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ ...typography.body, color: colors.text }}>{b.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
                {b.selisih !== null && b.selisih !== 0 ? (
                  <Text style={{ ...typography.caption, color: colors.textMuted }}>
                    {selisihTeks(b.selisih)}
                  </Text>
                ) : null}
                <Text style={{ ...typography.title, color: colors.text }}>
                  {formatDesimal(b.nilai)}
                </Text>
                <Text style={{ ...typography.caption, color: colors.textFaint }}>cm</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      {/* Riwayat pencatatan */}
      <View>
        <SectionHeader judul="Riwayat" aksi={`${mockUkuran.length} pencatatan`} />
        <Card flat>
          {[...mockUkuran].reverse().map((u, i) => (
            <BarisRiwayat key={u.id} ukuran={u} pertama={i === 0} />
          ))}
        </Card>
      </View>

      <Card>
        <Text style={{ ...typography.caption, color: colors.textFaint, lineHeight: 16 }}>
          Ukuran melengkapi berat, bukan menggantikannya. Berat bisa datar sementara pinggang
          mengecil dan lengan membesar — itu justru rekomposisi yang berhasil, dan tidak akan
          terlihat sama sekali dari timbangan. Lengan dan paha dicatat kiri dan kanan terpisah
          karena asimetri itu nyata dan berguna dilacak.
        </Text>
      </Card>

      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={{ ...typography.caption, color: colors.textFaint }}>
            Data tiruan · estimasi body fat menyusul
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/** Satu baris riwayat: tanggal + ukuran yang paling sering dilihat. */
function BarisRiwayat({ ukuran, pertama }: { ukuran: UkuranTubuh; pertama: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        borderTopWidth: pertama ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Text style={{ ...typography.label, color: colors.text }}>
        {formatTanggalPanjang(ukuran.tanggal)}
      </Text>
      <Text style={{ ...typography.caption, color: colors.textFaint }}>
        pinggang {formatDesimal(ukuran.pinggang_cm)} · dada {formatDesimal(ukuran.dada_cm)} · leher{' '}
        {formatDesimal(ukuran.leher_cm)}
      </Text>
    </View>
  );
}

/** "+0,4 cm" / "−0,3 cm"; tanda minus memakai karakter minus, bukan hyphen. */
function selisihTeks(selisih: number): string {
  const b = bulat(selisih);
  if (b === 0) return 'tidak berubah';
  return `${b > 0 ? '+' : '−'}${formatDesimal(Math.abs(b))} cm`;
}

function bulat(n: number): number {
  return Math.round(n * 10) / 10;
}
