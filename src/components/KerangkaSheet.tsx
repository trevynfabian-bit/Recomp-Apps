import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { colors, radius, spacing, typography, ukuran } from '@/theme';

type Props = {
  terbuka: boolean;
  /** `null` membuat latar dan tombol kembali Android tidak menutup sheet. */
  onTutup: (() => void) | null;
  /** Label kecil di bawah pegangan, mis. "Sumber data". */
  label: string;
  children: React.ReactNode;
};

/**
 * Kerangka bottom sheet: latar gelap, pegangan, label, isi yang bisa digulir.
 *
 * `onTutup: null` dipakai saat sheet sedang memproses sesuatu yang tidak boleh
 * terputus di tengah jalan (mis. menunggu jawaban izin) — mengetuk latar di
 * saat seperti itu membuat pengguna tidak tahu apakah prosesnya jadi atau tidak.
 */
export function KerangkaSheet({ terbuka, onTutup, label, children }: Props) {
  return (
    <Modal
      visible={terbuka}
      transparent
      animationType="slide"
      onRequestClose={() => onTutup?.()}
    >
      {/* Papan ketik mendorong sheet ke atas (iOS), supaya kolom isian di
          dalamnya tidak tertutup. Android sudah mengubah ukuran jendelanya sendiri. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: colors.selubung, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityLabel="Tutup"
          disabled={onTutup === null}
          onPress={() => onTutup?.()}
          style={{ flex: 1 }}
        />
        <View
          style={{
            maxHeight: '88%',
            backgroundColor: colors.permukaan,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.garis,
          }}
        >
          <View style={{ alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm }}>
            <View style={{ width: ukuran.pegangan.lebar, height: ukuran.pegangan.tinggi, borderRadius: radius.pill, backgroundColor: colors.garis }} />
            <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase' }}>
              {label}
            </Text>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.md, gap: spacing.lg }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Judul sheet: `title`, diumumkan sebagai header. Satu tempat untuk gaya ini
 * supaya setiap sheet dibuka dengan judul yang sama (dan pembaca layar bisa
 * melompat ke sana).
 */
export function JudulSheet({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={{ ...typography.title, color: colors.teks }}>
      {children}
    </Text>
  );
}
