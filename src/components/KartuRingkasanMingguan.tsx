import { Text, View } from 'react-native';
import { formatRentangTanggal } from '@recomp/logika';
import { PenandaSumber } from './PenandaSumber';

import type { RingkasanMingguan } from '@/types/domain';
import { colors, spacing, typography } from '@/theme';
import { Card } from './Card';
import { Chip } from './Chip';

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
    <Card bayangan={false} nada="aksen" style={{ gap: spacing.lg }}>
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
            <Chip key={t} label={t} aksesLabel={`Tanyakan: ${t}`} onPress={() => onTanya(t)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/** Arah ditentukan pengirim, bukan disimpulkan dari tanda angkanya. */
function warnaArah(arah: 'sesuai' | 'berlawanan' | 'netral' | undefined): string {
  if (arah === 'sesuai') return colors.status.sukses.teks;
  if (arah === 'berlawanan') return colors.status.peringatan.teks;
  return colors.teksRedup;
}
