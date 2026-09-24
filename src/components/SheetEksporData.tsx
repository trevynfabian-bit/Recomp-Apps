import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Text, View } from 'react-native';
import { formatAngka, formatUkuranBerkas } from '@recomp/logika';
import { JudulSheet, KerangkaSheet } from './KerangkaSheet';
import { Panel } from './Card';
import { StatusProses } from './StatusProses';
import { Tombol } from './Tombol';
import { ketukBerhasil } from '@/lib/haptics';
import { useEkspor } from '@/state/ekspor';
import { colors, spacing, typography, ukuranIkon } from '@/theme';

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
      <JudulSheet>Ekspor data saya</JudulSheet>
      <Text style={{ ...typography.body, color: colors.teksRedup }}>
        Satu berkas ZIP berisi CSV per jenis data dan satu JSON lengkap — terbaca di spreadsheet mana pun, tanpa
        app ini.
      </Text>

      {isi === null ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
          {isiGagal
            ? 'Isi berkas belum bisa dihitung sekarang; berkasnya tetap bisa disiapkan.'
            : 'Menghitung isi berkas…'}
        </Text>
      ) : null}
      <View accessibilityRole="list" style={{ gap: spacing.xs }}>
        {(isi ?? []).map((b) => (
          <View key={b.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{b.label}</Text>
            <Text style={{ ...typography.label, color: colors.teks }}>{formatAngka(b.jumlah)}</Text>
          </View>
        ))}
      </View>

      {/* Aman dibuka di spreadsheet: dikatakan sebelum berkas disiapkan, karena
          itulah alasan orang ragu membuka CSV berisi catatan bebas. */}
      <Panel style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name="shield-checkmark-outline" size={ukuranIkon.kecil} color={colors.status.sukses.teks} />
          <Text style={{ ...typography.label, color: colors.teks }}>Aman dibuka di Excel & Google Sheets</Text>
        </View>
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>
          Teks yang diawali =, +, -, atau @ (mis. catatan) diberi tanda kutip di depannya, jadi tidak pernah dijalankan
          sebagai rumus. CSV memakai UTF-8, jadi huruf dan simbol terbaca benar.
        </Text>
      </Panel>

      {status.jenis === 'memproses' ? (
        <StatusProses
          keadaan="berjalan"
          judul="Berkas sedang disiapkan…"
          keterangan="Sheet ini boleh ditutup; ada pemberitahuan saat berkasnya siap."
        />
      ) : null}

      {status.jenis === 'siap' ? (
        <View style={{ gap: spacing.xs }}>
          <StatusProses
            keadaan="berhasil"
            judul="Berkas siap"
            keterangan={`${status.namaBerkas} · ${formatUkuranBerkas(status.ukuranByte)} · disiapkan pukul ${jam(status.dibuatPada)}`}
          />
          <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>
            Berkas ini berisi data kesehatan Anda. Setelah {web ? 'diunduh' : 'dibagikan'}, penjagaannya mengikuti
            tempat tujuannya.
          </Text>
        </View>
      ) : null}

      {status.jenis === 'diserahkan' ? (
        <StatusProses
          keadaan="berhasil"
          judul={status.cara === 'diunduh' ? 'Berkas sudah diunduh' : 'Berkas sudah dibagikan'}
          keterangan={status.cara === 'diunduh' ? undefined : 'Salinan sementaranya di perangkat ini sudah dihapus.'}
        />
      ) : null}

      {status.jenis === 'gagal' ? (
        <StatusProses keadaan="gagal" judul="Berkas belum bisa disiapkan" keterangan="Periksa koneksi lalu coba lagi." />
      ) : null}
      {galatSerah ? (
        <StatusProses
          keadaan="gagal"
          judul={`Berkas belum bisa ${web ? 'diunduh' : 'dibagikan'}`}
          keterangan="Berkasnya masih siap; coba lagi."
        />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {status.jenis === 'siap' ? (
          <>
            <Tombol label={web ? 'Unduh berkas' : 'Bagikan berkas'} memproses={menyerahkan} onPress={() => void jalankanSerah()} />
            <Tombol varian="bertepi" label="Buang berkas" onPress={buang} nonaktif={menyerahkan} />
          </>
        ) : (
          <Tombol
            label={status.jenis === 'diserahkan' ? 'Siapkan lagi' : status.jenis === 'gagal' ? 'Coba lagi' : 'Siapkan berkas'}
            memproses={status.jenis === 'memproses'}
            onPress={() => void mulai()}
          />
        )}
        <Tombol varian="bertepi" label="Tutup" onPress={onTutup} nonaktif={menyerahkan} />
      </View>
    </KerangkaSheet>
  );
}
