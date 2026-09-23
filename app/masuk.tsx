import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emailSah } from '@recomp/logika';
import { TombolUtama } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { KesalahanMasuk, useSesi } from '@/state/sesi';
import { colors, radius, spacing, TAP_MIN, typography } from '@/theme';

/**
 * Layar masuk.
 *
 * Akun dibuat di web (onboarding, PRD, dan persetujuan data kesehatan ada di
 * sana), jadi layar ini hanya MASUK — tidak ada daftar. Mengatakannya di layar
 * lebih baik daripada tombol "Daftar" yang berujung buntu.
 *
 * Pesan gagal datang dari `PESAN_GAGAL_MASUK`: netral, tidak menebak siapa yang
 * salah, dan tidak membedakan "email tidak terdaftar" dari "kata sandi salah"
 * (membedakannya membocorkan email mana yang punya akun).
 *
 * Setelah sesi berakhir, email akunnya sudah terisi dan satu kalimat tenang
 * menjelaskan kenapa diminta masuk lagi — bukan layar kosong tanpa alasan.
 *
 * `useSesi` masuk lewat Supabase Auth (akun yang sama dengan web). Tanpa
 * kredensial Supabase, autentikasi tiruan dipakai; lihat `@/mocks/sesi` untuk
 * memicu tiap keadaan gagal.
 */
export default function MasukScreen() {
  const insets = useSafeAreaInsets();
  const { masuk, kirimAturUlangSandi, pemulihan } = useSesi();
  // Sesi yang berakhir: email akunnya sudah terisi, cukup kata sandi.
  const [email, setEmail] = useState(pemulihan.email ?? '');
  const [info, setInfo] = useState(pemulihan.pesan);
  const [sandi, setSandi] = useState('');
  const [tampilSandi, setTampilSandi] = useState(false);
  const [memproses, setMemproses] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [aturUlang, setAturUlang] = useState<'idle' | 'mengirim' | 'terkirim' | 'gagal'>('idle');
  const refSandi = useRef<TextInput>(null);

  const isianLengkap = emailSah(email) && sandi.length > 0;

  async function kirim() {
    if (!isianLengkap || memproses) return;
    setMemproses(true);
    setGalat(null);
    setInfo(null);
    try {
      // Berhasil: tata letak akar berganti ke app; layar ini dilepas.
      await masuk(email.trim(), sandi);
    } catch (e) {
      setGalat(e instanceof KesalahanMasuk ? e.message : 'Belum bisa masuk. Coba lagi sebentar lagi.');
      setMemproses(false);
    }
  }

  async function lupaSandi() {
    if (!emailSah(email)) {
      setAturUlang('idle');
      setGalat('Isi email akun Anda dulu, lalu ketuk "Lupa kata sandi?" lagi.');
      return;
    }
    setGalat(null);
    setAturUlang('mengirim');
    try {
      await kirimAturUlangSandi(email.trim());
      setAturUlang('terkirim');
    } catch {
      setAturUlang('gagal');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.xl,
        }}
      >
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ ...typography.display, color: colors.text }}>
            Recomp Coach
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>
            Masuk dengan akun yang sama dengan web.
          </Text>
        </View>

        {info ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              alignItems: 'flex-start',
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <Text style={{ flex: 1, ...typography.label, fontWeight: '500', color: colors.textMuted, lineHeight: 19 }}>
              {info}
            </Text>
          </View>
        ) : null}

        <View style={{ gap: spacing.lg }}>
          <Isian label="Email">
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setGalat(null);
                setAturUlang('idle');
              }}
              editable={!memproses}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => refSandi.current?.focus()}
              accessibilityLabel="Email"
              placeholder="nama@contoh.id"
              placeholderTextColor={colors.textFaint}
              style={gayaIsian}
            />
          </Isian>

          <Isian label="Kata sandi">
            <View style={{ justifyContent: 'center' }}>
              <TextInput
                ref={refSandi}
                autoFocus={Boolean(pemulihan.email)}
                value={sandi}
                onChangeText={(t) => {
                  setSandi(t);
                  setGalat(null);
                }}
                editable={!memproses}
                secureTextEntry={!tampilSandi}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void kirim()}
                accessibilityLabel="Kata sandi"
                style={{ ...gayaIsian, paddingRight: TAP_MIN + spacing.xs }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tampilSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                onPress={() => {
                  ketukRingan();
                  setTampilSandi((t) => !t);
                }}
                hitSlop={4}
                style={{
                  position: 'absolute',
                  right: 0,
                  width: TAP_MIN,
                  height: TAP_MIN,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={tampilSandi ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </Isian>

          {galat ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.aksenTeks.coral} />
              <Text style={{ flex: 1, ...typography.label, fontWeight: '500', color: colors.aksenTeks.coral, lineHeight: 19 }}>
                {galat}
              </Text>
            </View>
          ) : null}

          <TombolUtama label="Masuk" nonaktif={!isianLengkap} memproses={memproses} onPress={() => void kirim()} />

          <Pressable
            accessibilityRole="button"
            accessibilityHint="Mengirim tautan atur ulang kata sandi ke email di atas"
            disabled={aturUlang === 'mengirim' || memproses}
            onPress={() => {
              ketukRingan();
              void lupaSandi();
            }}
            style={({ pressed }) => ({
              minHeight: TAP_MIN,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || aturUlang === 'mengirim' ? 0.6 : 1,
            })}
          >
            <Text style={{ ...typography.body, fontWeight: '600', color: colors.amber }}>
              {aturUlang === 'mengirim' ? 'Mengirim tautan…' : 'Lupa kata sandi?'}
            </Text>
          </Pressable>

          {aturUlang === 'terkirim' || aturUlang === 'gagal' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                ...typography.label,
                fontWeight: '500',
                color: aturUlang === 'terkirim' ? colors.textMuted : colors.aksenTeks.coral,
                lineHeight: 19,
                textAlign: 'center',
              }}
            >
              {aturUlang === 'terkirim'
                ? 'Bila email ini punya akun, tautan atur ulang sudah dikirim. Periksa kotak masuk Anda.'
                : 'Tautan belum terkirim. Periksa koneksi, lalu coba lagi.'}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint, lineHeight: 19, textAlign: 'center' }}>
            Belum punya akun? Akun dibuat di web Recomp Coach, lalu dipakai di sini.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textFaint} />
            <Text style={{ ...typography.label, fontWeight: '500', color: colors.textFaint }}>
              Data kesehatan hanya terbaca oleh akun Anda.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Isian({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.label, color: colors.textMuted }}>{label}</Text>
      {children}
    </View>
  );
}

const gayaIsian = {
  ...typography.body,
  color: colors.text,
  minHeight: TAP_MIN,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderKuat,
  backgroundColor: colors.surfaceSunken,
} as const;
