import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import { colors, radius, spacing, TAP_MIN, typography, ukuran } from '@/theme';
import { TombolIkon } from './Tombol';

/** Batas panjang pertanyaan; penjaga tempel-seluruh-dokumen, bukan sensor. */
const MAKS_KARAKTER = 1000;

type Props = {
  /** Menolak kiriman baru selama coach masih menjawab. */
  sibuk: boolean;
  onKirim: (teks: string) => void;
};

/**
 * Bilah input chat.
 *
 * Tingginya tumbuh sampai beberapa baris lalu berhenti: pertanyaan tentang data
 * sering dua-tiga kalimat, tapi input yang tumbuh tanpa batas akan mendorong
 * seluruh percakapan keluar layar tepat saat pengguna ingin melihatnya.
 */
export function InputChat({ sibuk, onKirim }: Props) {
  const [teks, setTeks] = useState('');
  const [fokus, setFokus] = useState(false);
  const bersih = teks.trim();
  const bisaKirim = bersih.length > 0 && !sibuk;
  const sisaKarakter = MAKS_KARAKTER - teks.length;

  function kirim() {
    if (!bisaKirim) return;
    ketukRingan();
    onKirim(bersih);
    setTeks('');
  }

  return (
    <View
      style={{
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.garis,
        backgroundColor: colors.latar,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <View
          style={{
            flex: 1,
            borderRadius: radius.lg,
            // Fokus seperti Isian: tepi aksen 2 px; padding mengimbangi supaya teks tidak melompat.
            borderWidth: fokus ? 2 : 1,
            borderColor: fokus ? colors.aksen.isian : colors.garisKontrol,
            backgroundColor: colors.permukaanCekung,
            paddingHorizontal: spacing.lg - (fokus ? 1 : 0),
          }}
        >
          <TextInput
            value={teks}
            onChangeText={(t) => setTeks(t.slice(0, MAKS_KARAKTER))}
            placeholder={sibuk ? 'Coach sedang menjawab…' : 'Tanya apa saja tentang data Anda'}
            placeholderTextColor={colors.teksSamar}
            multiline
            accessibilityLabel="Pertanyaan untuk coach"
            accessibilityHint={Platform.OS === 'web' ? 'Enter mengirim, Shift+Enter baris baru' : undefined}
            onFocus={() => setFokus(true)}
            onBlur={() => setFokus(false)}
            // Web (papan ketik fisik): Enter mengirim, Shift+Enter baris baru —
            // kebiasaan kolom chat. Di ponsel, Enter tetap baris baru; kirim lewat tombol.
            onKeyPress={(e) => {
              if (Platform.OS !== 'web') return;
              const n = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (n.key === 'Enter' && !n.shiftKey) {
                e.preventDefault();
                kirim();
              }
            }}
            style={{
              ...typography.body,
              color: colors.teks,
              paddingVertical: spacing.md,
              outlineWidth: 0,
              // Tumbuh sampai ~4 baris lalu berhenti; sisanya digulung sendiri.
              minHeight: TAP_MIN,
              maxHeight: ukuran.isianChatMaks,
            }}
          />
        </View>

        <TombolIkon bentuk="aksen" ikon="arrow-up" aksesLabel="Kirim pertanyaan" nonaktif={!bisaKirim} onPress={kirim} />
      </View>

      {/* Sisa karakter baru muncul saat mendekati batas — sebelum itu ia cuma
          angka yang berkedip tanpa guna. */}
      <Text
        style={{
          ...typography.caption,
          color: sisaKarakter < 0 ? colors.status.bahaya.teks : colors.teksSamar,
          textAlign: 'right',
          // Tempat penghitung dicadangkan supaya kolom tidak melompat saat ia muncul.
          minHeight: typography.caption.lineHeight,
        }}
      >
        {sisaKarakter <= 100 ? `sisa ${sisaKarakter} karakter` : ''}
      </Text>
    </View>
  );
}
