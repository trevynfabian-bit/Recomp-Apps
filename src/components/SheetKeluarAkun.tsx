import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { JudulSheet, KerangkaSheet } from './KerangkaSheet';
import { Tombol } from './Tombol';
import { colors, ukuranIkon, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /** Akun yang sedang masuk; disebut supaya jelas akun mana yang dipakai untuk masuk lagi. */
  email: string;
  /** Selalu berhasil di perangkat; setelahnya tata letak akar pindah ke layar masuk. */
  keluar: () => Promise<void>;
};

/**
 * Keluar dari akun.
 *
 * Bukan tindakan merusak — tidak ada data yang hilang — jadi tombolnya bukan
 * coral. Yang disebut adalah apa yang BERUBAH di perangkat ini, karena itu
 * yang tidak terlihat: pengingat berhenti, dan Apple Health (yang dibaca dari
 * iPhone) tidak terkirim sampai masuk lagi. Sumber yang tersambung di server
 * tetap berjalan, supaya orang tidak mengira datanya bolong.
 */
export function SheetKeluarAkun({ terbuka, onTutup, email, keluar }: Props) {
  const [memproses, setMemproses] = useState(false);

  useEffect(() => {
    if (terbuka) setMemproses(false);
  }, [terbuka]);

  if (!terbuka) return null;

  return (
    <KerangkaSheet terbuka onTutup={memproses ? null : onTutup} label="Keluar dari akun">
      <JudulSheet>Keluar dari akun?</JudulSheet>
      <Text style={{ ...typography.body, color: colors.teksRedup }}>
        Semua data tetap tersimpan di akun Anda dan kembali utuh saat masuk lagi.
      </Text>

      <View accessibilityRole="list" style={{ gap: spacing.md }}>
        <Butir ikon="notifications-off-outline">Pengingat di perangkat ini berhenti.</Butir>
        <Butir ikon="heart-outline">Data Apple Health dari iPhone ini tidak terkirim selama Anda keluar.</Butir>
        <Butir ikon="cloud-done-outline">Strava, WHOOP, dan Hevy tetap tersinkron di server.</Butir>
        <Butir ikon="log-in-outline">Masuk lagi dengan {email}.</Butir>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Tombol
          label="Keluar"
          memproses={memproses}
          onPress={() => {
            setMemproses(true);
            // Berhasil: layar ini dilepas bersama seluruh tumpukan app.
            void keluar();
          }}
        />
        <Tombol varian="bertepi" label="Batal" onPress={onTutup} nonaktif={memproses} />
      </View>
    </KerangkaSheet>
  );
}

function Butir({ ikon, children }: { ikon: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Ionicons name={ikon} size={ukuranIkon.sedang} color={colors.teksRedup} />
      <Text style={{ flex: 1, ...typography.labelBiasa, color: colors.teksRedup }}>
        {children}
      </Text>
    </View>
  );
}
