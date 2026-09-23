import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatAngka, formatDesimal } from '@recomp/logika';
import { KerangkaSheet } from './KerangkaSheet';
import { TombolBertepi, TombolUtama } from './Tombol';
import { ketukBerhasil } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';

type Props = {
  terbuka: boolean;
  onTutup: () => void;
  /** Apa yang akan ada di berkas, per jenis data. */
  isi: { label: string; jumlah: number }[];
  /** Disuntikkan dari layar; task backend menukarnya dengan ekspor sungguhan. */
  siapkan: () => Promise<{ namaBerkas: string; ukuranMb: number }>;
};

/**
 * Ekspor data saya.
 *
 * Isi berkas disebut SEBELUM disiapkan: "semua data" terlalu kabur untuk
 * dipercaya, dan orang yang mengekspor sebelum menghapus akun perlu tahu
 * persis apa yang dibawanya pergi. Formatnya terbuka (CSV per tabel + JSON),
 * supaya berkasnya berguna tanpa app ini.
 */
export function SheetEksporData({ terbuka, onTutup, isi, siapkan }: Props) {
  const [status, setStatus] = useState<
    { jenis: 'awal' } | { jenis: 'memproses' } | { jenis: 'siap'; namaBerkas: string; ukuranMb: number } | { jenis: 'gagal' }
  >({ jenis: 'awal' });

  useEffect(() => {
    if (terbuka) setStatus({ jenis: 'awal' });
  }, [terbuka]);

  if (!terbuka) return null;

  async function jalankan() {
    setStatus({ jenis: 'memproses' });
    try {
      const hasil = await siapkan();
      ketukBerhasil();
      setStatus({ jenis: 'siap', ...hasil });
    } catch {
      setStatus({ jenis: 'gagal' });
    }
  }

  return (
    <KerangkaSheet terbuka onTutup={status.jenis === 'memproses' ? null : onTutup} label="Ekspor data">
      <Text style={{ ...typography.title, color: colors.text }}>Ekspor data saya</Text>
      <Text style={{ ...typography.body, color: colors.textMuted, lineHeight: 23 }}>
        Satu berkas ZIP berisi CSV per jenis data dan satu JSON lengkap — terbaca di spreadsheet mana pun, tanpa
        app ini.
      </Text>

      <View accessibilityRole="list" style={{ gap: spacing.xs }}>
        {isi.map((b) => (
          <View key={b.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>{b.label}</Text>
            <Text style={{ ...typography.label, color: colors.text }}>{formatAngka(b.jumlah)}</Text>
          </View>
        ))}
      </View>

      {status.jenis === 'siap' ? (
        <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.body, fontWeight: '600', color: colors.text }}>Berkas siap</Text>
          <Text style={{ ...typography.label, fontWeight: '500', color: colors.textMuted }}>
            {status.namaBerkas} · {formatDesimal(status.ukuranMb, 1)} MB
          </Text>
        </View>
      ) : null}
      {status.jenis === 'gagal' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...typography.label, color: colors.aksenTeks.coral }}>
          Berkas belum bisa disiapkan. Periksa koneksi lalu coba lagi.
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {status.jenis === 'siap' ? (
          <TombolUtama label="Bagikan berkas" onPress={onTutup} />
        ) : (
          <TombolUtama label="Siapkan berkas" memproses={status.jenis === 'memproses'} onPress={jalankan} />
        )}
        <TombolBertepi label="Tutup" onPress={onTutup} nonaktif={status.jenis === 'memproses'} />
      </View>
    </KerangkaSheet>
  );
}
