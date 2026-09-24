import { Pressable, Text, View } from 'react-native';
import { formatRentangTanggal } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';
import { ketukRingan } from '@/lib/haptics';
import type { RingkasanMingguan } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

type Props = {
  ringkasan: RingkasanMingguan;
  /** Mengirim pertanyaan lanjutan sebagai pesan biasa. */
  onTanya: (pertanyaan: string) => void;
};

/**
 * Ringkasan mingguan otomatis.
 *
 * Dirender sebagai KARTU selebar layar, bukan gelembung: ia tidak menjawab apa
 * pun. Gelembung menandakan percakapan, dan menaruh laporan berkala di dalam
 * gelembung membuatnya terbaca seolah menjawab pertanyaan yang tidak pernah
 * diajukan.
 *
 * Urutannya juga dibalik dari jawaban biasa: ANGKA dulu, narasi menyusul. Yang
 * membaca jawaban sudah punya pertanyaan di kepala; yang membuka app Senin pagi
 * belum, jadi ia perlu melihat apa yang terjadi sebelum diberi tahu artinya.
 */
export function KartuRingkasanMingguan({ ringkasan, onTanya }: Props) {
  return (
    <View
      style={{
        gap: spacing.lg,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.amber + '55',
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ ...typography.caption, color: colors.amber, textTransform: 'uppercase' }}>
          Ringkasan mingguan
        </Text>
        <Text style={{ ...typography.bodyTebal, color: colors.text }}>
          {formatRentangTanggal(ringkasan.periode.dari, ringkasan.periode.sampai)}
        </Text>
        <Text style={{ ...typography.caption, color: colors.textFaint }}>
          dibuat otomatis tiap Senin pagi
        </Text>
      </View>

      {/* Angka dulu. Dua kolom supaya empat poin muat tanpa menggulung. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {ringkasan.poin.map((p) => (
          <View key={p.label} style={{ flexBasis: '46%', flexGrow: 1, gap: spacing.xxs }}>
            <Text style={{ ...typography.caption, color: colors.textFaint }}>{p.label}</Text>
            <Text style={{ ...typography.title, color: colors.text }}>{p.nilai}</Text>
            {p.delta ? (
              <Text style={{ ...typography.caption, color: warnaArah(p.arah) }}>{p.delta}</Text>
            ) : null}
            <PenandaSumber jenis={p.sumber} />
          </View>
        ))}
      </View>

      <Text style={{ ...typography.body, color: colors.text, lineHeight: 24 }}>
        {ringkasan.bacaan}
      </Text>

      {ringkasan.lanjutan && ringkasan.lanjutan.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' }}>
            Tanya lanjutan
          </Text>
          {ringkasan.lanjutan.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityLabel={`Tanyakan: ${t}`}
              onPress={() => {
                ketukRingan();
                onTanya(t);
              }}
              style={({ pressed }) => ({
                minHeight: TAP_MIN,
                justifyContent: 'center',
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderKuat,
                backgroundColor: colors.surfaceSunken,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.textMuted }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Arah ditentukan pengirim, bukan disimpulkan dari tanda angkanya. */
function warnaArah(arah: 'sesuai' | 'berlawanan' | 'netral' | undefined): string {
  if (arah === 'sesuai') return colors.aksenTeks.jade;
  if (arah === 'berlawanan') return colors.amber;
  return colors.textMuted;
}
