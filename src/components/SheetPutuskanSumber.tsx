import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { PROFIL_SUMBER } from '@recomp/logika';
import type { SumberData } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi, TombolUtama } from './Tombol';
import { colors, spacing, typography } from '@/theme';

type Props = {
  /** Sumber yang akan diputuskan; `null` berarti sheet tertutup. */
  sumber: SumberData | null;
  onTutup: () => void;
  /** Disuntikkan dari layar; task backend menukarnya dengan pemutusan sungguhan. */
  putuskan: (sumber: SumberData, hapusData: boolean) => Promise<void>;
};

/**
 * Konfirmasi memutuskan sumber data.
 *
 * Sheet, bukan dialog OK/Batal, karena ada SATU keputusan kedua yang tidak
 * boleh diambil diam-diam: data yang sudah masuk ikut dihapus atau tidak.
 * Bawaannya TIDAK — memutuskan Strava karena ganti jam tidak berarti ingin
 * kehilangan setahun catatan lari, dan kehilangan itu tidak bisa dibatalkan.
 *
 * Akibat yang tidak terlihat juga disebut di sini, per jenis otorisasi: izin
 * Apple Health tetap tercatat di iPhone sampai dicabut di Pengaturan, dan
 * kunci Hevy tetap aktif di Hevy sampai diganti. Tanpa kalimat itu orang
 * mengira "putuskan" sudah mencabut semuanya.
 */
export function SheetPutuskanSumber({ sumber, onTutup, putuskan }: Props) {
  const [hapusData, setHapusData] = useState(false);
  const [status, setStatus] = useState<'idle' | 'memproses' | 'gagal'>('idle');

  useEffect(() => {
    if (sumber === null) return;
    setHapusData(false);
    setStatus('idle');
  }, [sumber]);

  if (sumber === null) return null;
  const profil = PROFIL_SUMBER[sumber];

  async function jalankan() {
    if (sumber === null) return;
    setStatus('memproses');
    try {
      await putuskan(sumber, hapusData);
      onTutup();
    } catch {
      setStatus('gagal');
    }
  }

  const akibatLain =
    profil.otorisasi === 'healthkit'
      ? 'Izin di iPhone tetap tercatat sampai Anda mencabutnya di Pengaturan › Kesehatan › Akses Data & Perangkat.'
      : profil.otorisasi === 'kunci_api'
        ? 'Kunci API dihapus dari app ini. Di Hevy, kunci itu tetap aktif sampai Anda membuat kunci baru.'
        : `Akses app ini di akun ${profil.nama} ikut dicabut.`;

  return (
    <KerangkaSheet
      terbuka
      onTutup={status === 'memproses' ? null : onTutup}
      label="Sumber data"
    >
      <Text style={{ ...typography.title, color: colors.text }}>Putuskan {profil.nama}?</Text>

      <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
        {kapital(gabung(profil.membawa))} yang baru dari {profil.nama} berhenti masuk. Yang sudah
        tercatat tetap tersimpan, kecuali Anda memilih menghapusnya.
      </Text>

      <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>
        {akibatLain}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ ...typography.body, color: colors.text, flex: 1 }}>
          Hapus juga data {profil.nama} yang sudah masuk
        </Text>
        <Switch
          accessibilityLabel={`Hapus juga data ${profil.nama} yang sudah masuk`}
          value={hapusData}
          onValueChange={setHapusData}
          disabled={status === 'memproses'}
          trackColor={{ true: colors.coral, false: colors.surfaceSunken }}
          thumbColor={colors.text}
        />
      </View>

      {hapusData ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...typography.label, color: colors.aksenTeks.coral, lineHeight: 20 }}
        >
          Tidak bisa dibatalkan. Rata-rata 7 hari, tren, dan budget dihitung ulang tanpa data ini.
        </Text>
      ) : null}

      {status === 'gagal' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, color: colors.aksenTeks.coral }}>
          Gagal memutuskan. Periksa koneksi lalu coba lagi.
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <TombolUtama
          merusak
          label={hapusData ? `Putuskan & hapus data` : `Putuskan ${profil.nama}`}
          memproses={status === 'memproses'}
          onPress={jalankan}
        />
        <TombolBertepi label="Batal" onPress={onTutup} nonaktif={status === 'memproses'} />
      </View>
    </KerangkaSheet>
  );
}

function gabung(daftar: string[]): string {
  if (daftar.length <= 1) return daftar.join('');
  return `${daftar.slice(0, -1).join(', ')} dan ${daftar[daftar.length - 1]}`;
}

function kapital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
