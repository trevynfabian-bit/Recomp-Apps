import { Pressable, Text, View } from 'react-native';
import { formatRentangTanggal } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';
import { ketukRingan } from '@/lib/haptics';
import type { RingkasanMingguan } from '@/types/domain';
import { colors, radius, spacing, TAP_MIN, tint, typography } from '@/theme';

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
        backgroundColor: colors.permukaan,
        borderWidth: 1,
        borderColor: tint(colors.aksen.isian, 'tepi'),
      }}
    >
      <View style={{ gap: spacing.xxs }}>
        <Text style={{ ...typography.caption, color: colors.aksen.teks, textTransform: 'uppercase' }}>
          Ringkasan mingguan
        </Text>
        <Text style={{ ...typography.bodyTebal, color: colors.teks }}>
          {formatRentangTanggal(ringkasan.periode.dari, ringkasan.periode.sampai)}
        </Text>
        <Text style={{ ...typography.caption, color: colors.teksSamar }}>
          dibuat otomatis tiap Senin pagi
        </Text>
      </View>

      {/* Angka dulu. Dua kolom supaya empat poin muat tanpa menggulung. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {ringkasan.poin.map((p) => (
          <View key={p.label} style={{ flexBasis: '46%', flexGrow: 1, gap: spacing.xxs }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>{p.label}</Text>
            <Text style={{ ...typography.title, color: colors.teks }}>{p.nilai}</Text>
            {p.delta ? (
              <Text style={{ ...typography.caption, color: warnaArah(p.arah) }}>{p.delta}</Text>
            ) : null}
            <PenandaSumber jenis={p.sumber} />
          </View>
        ))}
      </View>

      <Text style={{ ...typography.body, color: colors.teks }}>
        {ringkasan.bacaan}
      </Text>

      {ringkasan.lanjutan && ringkasan.lanjutan.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
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
                borderColor: colors.garisKontrol,
                backgroundColor: colors.permukaanCekung,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ ...typography.label, color: colors.teksRedup }}>{t}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Arah ditentukan pengirim, bukan disimpulkan dari tanda angkanya. */
function warnaArah(arah: 'sesuai' | 'berlawanan' | 'netral' | undefined): string {
  if (arah === 'sesuai') return colors.status.sukses.teks;
  if (arah === 'berlawanan') return colors.status.peringatan.teks;
  return colors.teksRedup;
}
