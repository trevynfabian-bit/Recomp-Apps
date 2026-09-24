import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi, TombolUtama } from './Tombol';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  onEksporDulu: () => void;
  /** Disuntikkan dari layar; task backend menukarnya dengan penghapusan sungguhan. */
  hapus: () => Promise<void>;
};

/** Kata yang harus diketik — tindakan ini tidak bisa dibatalkan. */
export const KATA_KONFIRMASI_HAPUS = 'hapus';

/**
 * Hapus akun & semua data.
 *
 * Tidak bisa dibatalkan, jadi tiga hal dipegang: akibatnya disebut apa adanya
 * (termasuk yang TIDAK terhapus — izin Apple Health di iPhone, kunci Hevy di
 * Hevy), ekspor ditawarkan lebih dulu, dan tombolnya baru aktif setelah kata
 * konfirmasi diketik. Nadanya tetap tenang: ini keputusan pengguna, bukan
 * sesuatu yang perlu dihalang-halangi.
 */
export function SheetHapusAkun({ terbuka, onTutup, onEksporDulu, hapus }: Props) {
  const [ketik, setKetik] = useState('');
  const [status, setStatus] = useState<'idle' | 'memproses' | 'gagal'>('idle');

  useEffect(() => {
    if (!terbuka) return;
    setKetik('');
    setStatus('idle');
  }, [terbuka]);

  if (!terbuka) return null;
  const cocok = ketik.trim().toLowerCase() === KATA_KONFIRMASI_HAPUS;

  async function jalankan() {
    setStatus('memproses');
    try {
      await hapus();
      onTutup();
    } catch {
      setStatus('gagal');
    }
  }

  return (
    <KerangkaSheet terbuka onTutup={status === 'memproses' ? null : onTutup} label="Hapus akun">
      <Text style={{ ...typography.title, color: colors.text }}>Hapus akun & semua data?</Text>
      <Text style={{ ...typography.body, color: colors.textMuted }}>
        Profil, catatan harian, makanan, ukuran, latihan, data dari perangkat, percakapan coach, dan hasil lab
        dihapus dari server. Tidak bisa dibatalkan.
      </Text>
      <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>
        Izin Apple Health di iPhone dan kunci API di Hevy tetap ada di tempatnya sampai Anda mencabutnya di sana.
      </Text>

      <TombolBertepi label="Ekspor data dulu" onPress={onEksporDulu} nonaktif={status === 'memproses'} />

      <View style={{ gap: spacing.xs }}>
        <Text style={{ ...typography.label, color: colors.textMuted }}>
          Ketik &ldquo;{KATA_KONFIRMASI_HAPUS}&rdquo; untuk melanjutkan
        </Text>
        <TextInput
          value={ketik}
          onChangeText={setKetik}
          editable={status !== 'memproses'}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`Ketik ${KATA_KONFIRMASI_HAPUS} untuk melanjutkan`}
          placeholder={KATA_KONFIRMASI_HAPUS}
          placeholderTextColor={colors.textFaint}
          style={{
            ...typography.body,
            color: colors.text,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderKuat,
            backgroundColor: colors.surfaceSunken,
          }}
        />
      </View>

      {status === 'gagal' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, color: colors.aksenTeks.coral }}>
          Akun belum terhapus. Periksa koneksi lalu coba lagi.
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <TombolUtama
          merusak
          label="Hapus akun"
          nonaktif={!cocok}
          memproses={status === 'memproses'}
          onPress={jalankan}
        />
        <TombolBertepi label="Batal" onPress={onTutup} nonaktif={status === 'memproses'} />
      </View>
    </KerangkaSheet>
  );
}
