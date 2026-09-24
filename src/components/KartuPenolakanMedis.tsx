import { Text, View } from 'react-native';
import type { PenolakanMedis } from '@recomp/logika';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  penolakan: PenolakanMedis;
};

/**
 * Penolakan coach saat pertanyaannya melewati batas medis.
 *
 * Dirender sebagai kartu bertepi, bukan gelembung jawaban, karena ia memang
 * bukan jawaban. Gelembung akan membuatnya terbaca seperti pendapat coach atas
 * pertanyaannya; kartu membuatnya terbaca sebagai apa adanya — batas yang
 * memang tidak akan dilewati, berapa kali pun ditanyakan ulang.
 *
 * Tiga hal wajib ada di sini, dan ketiganya punya alasan:
 * ALASAN, supaya penolakan tidak terasa sewenang-wenang; KATA PEMICU, supaya
 * pengguna bisa memeriksa sendiri kenapa pertanyaannya ditolak dan menulis
 * ulang bila itu salah tangkap; dan APA YANG MASIH BISA DIBANTU, supaya
 * percakapannya punya jalan ke depan alih-alih berhenti di jalan buntu.
 */
export function KartuPenolakanMedis({ penolakan }: Props) {
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.permukaan,
        borderWidth: 1,
        borderColor: colors.aksen.isian + '55',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ ...typography.body, color: colors.aksen.teks }}>▲</Text>
        <Text style={{ ...typography.bodyTebal, color: colors.aksen.teks, flex: 1 }}>
          {penolakan.judul}
        </Text>
      </View>

      <Text style={{ ...typography.body, color: colors.teks }}>
        {penolakan.alasan}
      </Text>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
          Yang masih bisa saya bantu
        </Text>
        {penolakan.bisaDibantu.map((b) => (
          <View key={b} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: colors.teksSamar }}>·</Text>
            <Text style={{ ...typography.caption, color: colors.teksRedup, flex: 1 }}>
              {b}
            </Text>
          </View>
        ))}
      </View>

      {/* Kata pemicunya disebut: kalau penolakannya salah tangkap, pengguna
          perlu tahu kata mana yang harus ia hindari saat menulis ulang. */}
      <Text style={{ ...typography.caption, color: colors.teksSamar }}>
        Ditolak karena pertanyaan Anda memuat kata “{penolakan.pemicu}”. Kalau maksud Anda bukan
        soal obat atau kondisi medis, coba tulis ulang tanpa kata itu.
      </Text>
    </View>
  );
}
