import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emailSah } from '@recomp/logika';
import { TombolUtama } from '@/components';
import { ketukRingan } from '@/lib/haptics';
import { KesalahanAturUlang, KesalahanMasuk, useSesi } from '@/state/sesi';
import { colors, ukuranIkon, radius, spacing, TAP_MIN, typography } from '@/theme';

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
  const [pesanAturUlang, setPesanAturUlang] = useState('');
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
    } catch (e) {
      setPesanAturUlang(e instanceof KesalahanAturUlang ? e.message : 'Tautan belum terkirim. Coba lagi sebentar lagi.');
      setAturUlang('gagal');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.latar }}
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
          <Text accessibilityRole="header" style={{ ...typography.display, color: colors.teks }}>
            Recomp Coach
          </Text>
          <Text style={{ ...typography.body, color: colors.teksRedup }}>
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
              backgroundColor: colors.permukaan,
            }}
          >
            <Ionicons name="time-outline" size={ukuranIkon.kecil} color={colors.teksRedup} />
            <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.teksRedup }}>
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
              placeholderTextColor={colors.teksSamar}
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
                <Ionicons name={tampilSandi ? 'eye-off-outline' : 'eye-outline'} size={ukuranIkon.sedang} color={colors.teksRedup} />
              </Pressable>
            </View>
          </Isian>

          {galat ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
            >
              <Ionicons name="information-circle-outline" size={ukuranIkon.kecil} color={colors.status.bahaya.teks} />
              <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
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
            <Text style={{ ...typography.bodySedang, color: colors.aksen.teks }}>
              {aturUlang === 'mengirim' ? 'Mengirim tautan…' : 'Lupa kata sandi?'}
            </Text>
          </Pressable>

          {aturUlang === 'terkirim' || aturUlang === 'gagal' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                ...typography.labelBiasa,
                color: aturUlang === 'terkirim' ? colors.teksRedup : colors.status.bahaya.teks,
                textAlign: 'center',
              }}
            >
              {aturUlang === 'terkirim'
                ? 'Bila email ini punya akun, tautan atur ulang sudah dikirim. Periksa kotak masuk Anda.'
                : pesanAturUlang}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar, textAlign: 'center' }}>
            Belum punya akun? Akun dibuat di web Recomp Coach, lalu dipakai di sini.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="lock-closed-outline" size={ukuranIkon.mini} color={colors.teksSamar} />
            <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
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
      <Text style={{ ...typography.label, color: colors.teksRedup }}>{label}</Text>
      {children}
    </View>
  );
}

const gayaIsian = {
  ...typography.body,
  get color() {
    return colors.teks;
  },
  minHeight: TAP_MIN,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
  borderRadius: radius.md,
  borderWidth: 1,
  get borderColor() {
    return colors.garisKontrol;
  },
  get backgroundColor() {
    return colors.permukaanCekung;
  },
} as const;
