import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emailSah } from '@recomp/logika';
import { Isian, TombolIkon, Tombol } from '@/components';

import { KesalahanAturUlang, KesalahanMasuk, useSesi } from '@/state/sesi';
import { colors, ukuranIkon, radius, spacing, typography } from '@/theme';

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
  // Galat format email baru tampil setelah kolomnya ditinggalkan: tombol Masuk
  // yang nonaktif tanpa alasan membuat orang menebak apa yang salah.
  const [emailDitinggalkan, setEmailDitinggalkan] = useState(false);
  const [kredensialSalah, setKredensialSalah] = useState(false);
  const galatEmail =
    emailDitinggalkan && email.trim().length > 0 && !emailSah(email)
      ? 'Format email belum benar, mis. nama@contoh.id.'
      : null;

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
      // Kredensial salah: kedua kolom ditandai (pesannya sengaja tidak menyebut
      // yang mana, supaya tidak membocorkan apakah email itu terdaftar), dan
      // sandi dipilih untuk diketik ulang.
      setKredensialSalah(e instanceof KesalahanMasuk && e.kode === 'kredensial');
      setMemproses(false);
      // Setelah kolom aktif lagi (selama memproses ia nonaktif dan menolak fokus).
      if (e instanceof KesalahanMasuk && e.kode === 'kredensial') setTimeout(() => refSandi.current?.focus(), 50);
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
          <Isian
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setGalat(null);
              setKredensialSalah(false);
              setAturUlang('idle');
              // Mengetik ulang menghapus galat format sampai kolomnya ditinggalkan lagi.
              if (emailDitinggalkan && emailSah(t)) setEmailDitinggalkan(false);
            }}
            onBlur={() => setEmailDitinggalkan(true)}
            galat={galatEmail}
            ditandai={kredensialSalah}
            nonaktif={memproses}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => refSandi.current?.focus()}
            placeholder="nama@contoh.id"
          />

          <Isian
            ref={refSandi}
            label="Kata sandi"
            autoFocus={Boolean(pemulihan.email)}
            value={sandi}
            onChangeText={(t) => {
              setSandi(t);
              setGalat(null);
              setKredensialSalah(false);
            }}
            nonaktif={memproses}
            secureTextEntry={!tampilSandi}
            ditandai={kredensialSalah}
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void kirim()}
            ekor={
              <TombolIkon
                bentuk="polos"
                ikon={tampilSandi ? 'eye-off-outline' : 'eye-outline'}
                aksesLabel={tampilSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                onPress={() => setTampilSandi((t) => !t)}
              />
            }
          />

          {galat ? (
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
            >
              <Ionicons name="alert-circle-outline" size={ukuranIkon.kecil} color={colors.status.bahaya.teks} />
              <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.status.bahaya.teks }}>
                {galat}
              </Text>
            </View>
          ) : null}

          <Tombol label="Masuk" nonaktif={!isianLengkap} memproses={memproses} onPress={() => void kirim()} />

          <Tombol
            varian="teks"
            sejajar="tengah"
            label={aturUlang === 'mengirim' ? 'Mengirim tautan…' : 'Lupa kata sandi?'}
            aksesPetunjuk="Mengirim tautan atur ulang kata sandi ke email di atas"
            memproses={aturUlang === 'mengirim'}
            nonaktif={memproses}
            onPress={() => void lupaSandi()}
          />

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

