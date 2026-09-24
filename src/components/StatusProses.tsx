import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors, radius, spacing, typography, ukuran, ukuranIkon } from '@/theme';

export type KeadaanProses = 'berjalan' | 'berhasil' | 'gagal';

type Props = {
  keadaan: KeadaanProses;
  /** Kalimat utama: apa yang sedang/sudah terjadi, mis. "Mengimpor… 12 dari 40 sesi". */
  judul: string;
  /** Baris kedua: rincian atau jalan keluar. */
  keterangan?: string;
  /** Kemajuan terhitung (impor); tanpa ini `berjalan` memakai spinner saja. */
  progres?: { selesai: number; total: number };
  /** `ringkas` untuk satu baris di dalam kartu (hasil sinkron); bawaan untuk sheet. */
  ringkas?: boolean;
};

/**
 * Status proses bersama untuk impor, sinkron, dan ekspor (bab Desain 8.6):
 * satu bentuk untuk "sedang berjalan", "berhasil", dan "gagal", masing-masing
 * dengan penanda + kalimat (tidak pernah warna saja), diumumkan ke pembaca layar.
 *
 * Berbeda dari `KeadaanMemuat`/`KeadaanGagal`, yang menggantikan ISI layar:
 * status proses menempel di samping isi yang tetap terlihat (kartu sumber,
 * sheet impor/ekspor).
 */
export function StatusProses({ keadaan, judul, keterangan, progres, ringkas = false }: Props) {
  const warna =
    keadaan === 'berhasil' ? colors.status.sukses.teks : keadaan === 'gagal' ? colors.status.bahaya.teks : colors.teksRedup;
  const ikon = keadaan === 'berhasil' ? 'checkmark-circle' : 'alert-circle-outline';
  const ukuranPenanda = ringkas ? ukuranIkon.kecil : ukuranIkon.sedang;

  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {keadaan === 'berjalan' ? (
          <ActivityIndicator size="small" color={colors.aksen.isian} />
        ) : (
          <Ionicons name={ikon} size={ukuranPenanda} color={warna} />
        )}
        <Text
          style={{
            ...(ringkas ? typography.labelBiasa : typography.bodyTebal),
            color: keadaan === 'berjalan' ? colors.teks : ringkas ? colors.teksRedup : warna,
            flex: 1,
          }}
        >
          {judul}
        </Text>
      </View>
      {progres ? (
        <View
          accessibilityRole="progressbar"
          aria-valuemin={0}
          aria-valuemax={progres.total}
          aria-valuenow={progres.selesai}
          style={{ height: ukuran.trackTebal, borderRadius: radius.pill, backgroundColor: colors.permukaanCekung, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${progres.total === 0 ? 100 : Math.min(progres.selesai / progres.total, 1) * 100}%`,
              height: '100%',
              backgroundColor: colors.aksen.isian,
            }}
          />
        </View>
      ) : null}
      {keterangan ? <Text style={{ ...typography.labelBiasa, color: colors.teksRedup }}>{keterangan}</Text> : null}
    </View>
  );
}
