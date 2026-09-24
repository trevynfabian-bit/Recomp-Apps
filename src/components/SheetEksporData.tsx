import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { formatAngka, formatUkuranBerkas } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi, TombolUtama } from './Tombol';
import { ketukBerhasil } from '@/lib/haptics';
import { useEkspor } from '@/state/ekspor';
import { colors, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
};

const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/**
 * Ekspor data saya.
 *
 * Isi berkas disebut SEBELUM disiapkan: "semua data" terlalu kabur untuk
 * dipercaya, dan orang yang mengekspor sebelum menghapus akun perlu tahu
 * persis apa yang dibawanya pergi. Formatnya terbuka (CSV per tabel + JSON),
 * supaya berkasnya berguna tanpa app ini.
 *
 * Prosesnya hidup di `useEkspor`, bukan di sheet ini: menutup sheet saat
 * berkas sedang disiapkan tidak membatalkannya, dan ada pemberitahuan saat
 * berkasnya siap. Sebelum dibagikan, satu kalimat mengingatkan bahwa isinya
 * data kesehatan — setelah keluar dari app, penjagaannya ada di tempat tujuan.
 */
export function SheetEksporData({ terbuka, onTutup }: Props) {
  const { status, isi, isiGagal, mulai, serahkan, buang, setSheetTerbuka } = useEkspor();
  const [galatSerah, setGalatSerah] = useState(false);
  const [menyerahkan, setMenyerahkan] = useState(false);

  useEffect(() => {
    setSheetTerbuka(terbuka);
    if (terbuka) setGalatSerah(false);
    return () => setSheetTerbuka(false);
  }, [terbuka, setSheetTerbuka]);

  if (!terbuka) return null;
  const web = Platform.OS === 'web';

  async function jalankanSerah() {
    setMenyerahkan(true);
    setGalatSerah(false);
    try {
      await serahkan();
      ketukBerhasil();
    } catch {
      setGalatSerah(true);
    } finally {
      setMenyerahkan(false);
    }
  }

  return (
    <KerangkaSheet terbuka onTutup={menyerahkan ? null : onTutup} label="Ekspor data">
      <Text style={{ ...typography.title, color: colors.text }}>Ekspor data saya</Text>
      <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 24 }}>
        Satu berkas ZIP berisi CSV per jenis data dan satu JSON lengkap — terbaca di spreadsheet mana pun, tanpa
        app ini.
      </Text>

      {isi === null ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.textFaint }}>
          {isiGagal
            ? 'Isi berkas belum bisa dihitung sekarang; berkasnya tetap bisa disiapkan.'
            : 'Menghitung isi berkas…'}
        </Text>
      ) : null}
      <View accessibilityRole="list" style={{ gap: spacing.xs }}>
        {(isi ?? []).map((b) => (
          <View key={b.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>{b.label}</Text>
            <Text style={{ ...typography.label, color: colors.text }}>{formatAngka(b.jumlah)}</Text>
          </View>
        ))}
      </View>

      {status.jenis === 'memproses' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.textMuted }}>
          Berkas sedang disiapkan. Sheet ini boleh ditutup; ada pemberitahuan saat berkasnya siap.
        </Text>
      ) : null}

      {status.jenis === 'siap' ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.bodySedang, color: colors.text }}>Berkas siap</Text>
          <Text style={{ ...typography.labelBiasa, color: colors.textMuted }}>
            {status.namaBerkas} · {formatUkuranBerkas(status.ukuranByte)} · disiapkan pukul {jam(status.dibuatPada)}
          </Text>
          <Text style={{ ...typography.labelBiasa, color: colors.textFaint }}>
            Berkas ini berisi data kesehatan Anda. Setelah {web ? 'diunduh' : 'dibagikan'}, penjagaannya mengikuti
            tempat tujuannya.
          </Text>
        </View>
      ) : null}

      {status.jenis === 'diserahkan' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.aksenTeks.jade }}>
          {status.cara === 'diunduh'
            ? 'Berkas sudah diunduh.'
            : 'Berkas sudah dibagikan. Salinan sementaranya di perangkat ini sudah dihapus.'}
        </Text>
      ) : null}

      {status.jenis === 'gagal' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, color: colors.aksenTeks.coral }}>
          Berkas belum bisa disiapkan. Periksa koneksi lalu coba lagi.
        </Text>
      ) : null}
      {galatSerah ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, color: colors.aksenTeks.coral, lineHeight: 19 }}>
          Berkas belum bisa {web ? 'diunduh' : 'dibagikan'}. Berkasnya masih siap; coba lagi.
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {status.jenis === 'siap' ? (
          <>
            <TombolUtama label={web ? 'Unduh berkas' : 'Bagikan berkas'} memproses={menyerahkan} onPress={() => void jalankanSerah()} />
            <TombolBertepi label="Buang berkas" onPress={buang} nonaktif={menyerahkan} />
          </>
        ) : (
          <TombolUtama
            label={status.jenis === 'diserahkan' ? 'Siapkan lagi' : status.jenis === 'gagal' ? 'Coba lagi' : 'Siapkan berkas'}
            memproses={status.jenis === 'memproses'}
            onPress={() => void mulai()}
          />
        )}
        <TombolBertepi label="Tutup" onPress={onTutup} nonaktif={menyerahkan} />
      </View>
    </KerangkaSheet>
  );
}
