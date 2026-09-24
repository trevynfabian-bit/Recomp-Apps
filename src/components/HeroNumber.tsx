import { Text, View } from 'react-native';
import { angkaTabular, colors, MAKS_SKALA_HERO, spacing, typography } from '@/theme';

type Props = {
  /** Angka utama, sudah diformat sebagai string. */
  nilai: string;
  unit: string;
  /** Label di atas angka, mis. "SISA KALORI HARI INI". */
  label: string;
  /** Keterangan di bawah angka, mis. "dari target 2.850 kcal". */
  keterangan?: string;
  /** Peran angka; menentukan warnanya (lihat `NadaHero`). Bawaan `aksen`. */
  nada?: NadaHero;
};

/**
 * Warna angka hero mengikuti PERAN angkanya, bukan selera layar (bab Desain 2.5):
 * - `aksen`: jatah yang tersisa untuk dipakai (sisa kalori, sisa budget,
 *   target hari ini) — angka yang ditindaklanjuti.
 * - `netral`: hasil ukur atau hitungan (berat, pinggang, jumlah sesi,
 *   sumber aktif) — fakta, tidak dinilai.
 * - `bahaya`: jatah sudah terlewati. Selalu bersama label yang mengatakannya
 *   ("Melewati jatah…"), tidak pernah warna saja.
 */
export type NadaHero = 'aksen' | 'netral' | 'bahaya';

function warnaHero(nada: NadaHero): string {
  if (nada === 'netral') return colors.teks;
  if (nada === 'bahaya') return colors.status.bahaya.isian;
  return colors.aksen.besar;
}

/** Label kapital kecil di atas angka hero; dipakai juga oleh `HeroPengganti`. */
function LabelHero({ children }: { children: string }) {
  return (
    <Text style={{ ...typography.caption, color: colors.teksSamar, textTransform: 'uppercase', textAlign: 'center' }}>
      {children}
    </Text>
  );
}

/**
 * SATU angka utama per layar (prinsip desain PRD): label kecil di atas,
 * angka raksasa di tengah, keterangan redup di bawah.
 */
export function HeroNumber({ nilai, unit, label, keterangan, nada = 'aksen' }: Props) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <LabelHero>{label}</LabelHero>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <Text
          maxFontSizeMultiplier={MAKS_SKALA_HERO}
          style={{ ...typography.hero, ...angkaTabular, color: warnaHero(nada) }}
        >
          {nilai}
        </Text>
        <Text style={{ ...typography.title, color: colors.teksSamar, paddingBottom: spacing.md }}>
          {unit}
        </Text>
      </View>
      {keterangan ? (
        <Text style={{ ...typography.labelBiasa, color: colors.teksRedup, textAlign: 'center' }}>{keterangan}</Text>
      ) : null}
    </View>
  );
}

/**
 * Pengganti angka hero saat angkanya belum bisa dihitung (mis. target belum
 * diisi): label yang SAMA dengan angka hero, lalu kalimat `title` yang
 * menyebut apa yang kurang, penjelasan, dan satu aksi. Tidak ada angka palsu
 * ("0 kcal") yang bisa dikira data.
 */
export function HeroPengganti({
  label,
  judul,
  keterangan,
  aksi,
}: {
  label: string;
  judul: string;
  keterangan?: string;
  /** Satu aksi utama, biasanya `<Tombol label="Isi target" … />`. */
  aksi?: React.ReactNode;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
      <LabelHero>{label}</LabelHero>
      <Text accessibilityRole="header" style={{ ...typography.title, color: colors.teks, textAlign: 'center' }}>
        {judul}
      </Text>
      {keterangan ? (
        <Text style={{ ...typography.body, color: colors.teksRedup, textAlign: 'center' }}>{keterangan}</Text>
      ) : null}
      {aksi}
    </View>
  );
}
