import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
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
            borderWidth: 1,
            borderColor: colors.garisKontrol,
            backgroundColor: colors.permukaanCekung,
            paddingHorizontal: spacing.lg,
          }}
        >
          <TextInput
            value={teks}
            onChangeText={(t) => setTeks(t.slice(0, MAKS_KARAKTER))}
            placeholder="Tanya apa saja tentang data Anda"
            placeholderTextColor={colors.teksSamar}
            multiline
            accessibilityLabel="Pertanyaan untuk coach"
            style={{
              ...typography.body,
              color: colors.teks,
              lineHeight: 22,
              paddingVertical: spacing.md,
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
