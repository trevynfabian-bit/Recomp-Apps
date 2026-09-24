import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { angkaTabular, colors, radius, spacing, TAP_MIN, typography, ukuranIkon } from '@/theme';

type Props = Omit<TextInputProps, 'style' | 'editable' | 'placeholderTextColor'> & {
  /** Label di atas kolom; juga label pembaca layar bila `aksesLabel` kosong. */
  label: string;
  /** Satuan di ujung kanan kolom, mis. "kg", "kcal". */
  unit?: string;
  /** Keterangan di bawah kolom saat tidak ada galat. */
  keterangan?: string;
  /**
   * Kalimat galat. Mengganti keterangan, memberi tepi bahaya, dan diumumkan ke
   * pembaca layar. Warna tidak pernah sendirian: selalu dengan ikon + kalimat.
   */
  galat?: string | null;
  /**
   * Tandai kolom bermasalah tanpa kalimat di bawahnya — untuk form yang
   * menaruh satu kalimat galat bersama di bawah beberapa kolom.
   */
  ditandai?: boolean;
  nonaktif?: boolean;
  /** Label pembaca layar bila berbeda dari `label` (mis. "Target kalori Rest"). */
  aksesLabel?: string;
  /** Warna label; dipakai untuk membedakan makro (`colors.macroTeks.*`). */
  warnaLabel?: string;
  /** Elemen di ujung kanan di dalam kolom, mis. tombol tampilkan sandi. */
  ekor?: React.ReactNode;
  /** Kolom angka: digit tabular supaya lebar angka tidak berubah saat diketik. */
  angka?: boolean;
  ref?: React.Ref<TextInput>;
};

/**
 * Kolom isian seragam (bab Desain 8.6): label, kolom, satuan, keterangan, galat.
 *
 * Tepi kolom memberi tahu keadaannya: `garisKontrol` biasa (≥3:1), aksen saat
 * fokus, bahaya saat bermasalah — dua keadaan terakhir juga lebih tebal
 * supaya terbaca tanpa membedakan warna.
 */
export function Isian({
  label,
  unit,
  keterangan,
  galat,
  ditandai = false,
  nonaktif = false,
  aksesLabel,
  warnaLabel,
  ekor,
  angka = false,
  ref,
  onFocus,
  onBlur,
  accessibilityHint,
  ...inputProps
}: Props) {
  const [fokus, setFokus] = useState(false);
  const bermasalah = Boolean(galat) || ditandai;
  const tepi = bermasalah ? colors.status.bahaya.isian : fokus ? colors.aksen.isian : colors.garisKontrol;

  return (
    <View style={{ gap: spacing.xs, opacity: nonaktif ? 0.45 : 1 }}>
      <Text style={{ ...typography.caption, color: warnaLabel ?? colors.teksRedup }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: inputProps.multiline ? 'flex-start' : 'center',
          gap: spacing.xs,
          backgroundColor: colors.permukaanCekung,
          borderRadius: radius.md,
          borderWidth: bermasalah || fokus ? 2 : 1,
          borderColor: tepi,
          // Tepi 2 px menggeser isi 1 px; padding mengimbanginya supaya teks tidak melompat.
          paddingHorizontal: spacing.md - (bermasalah || fokus ? 1 : 0),
        }}
      >
        <TextInput
          ref={ref}
          editable={!nonaktif}
          placeholderTextColor={colors.teksSamar}
          accessibilityLabel={aksesLabel ?? label}
          accessibilityHint={galat ?? accessibilityHint ?? keterangan}
          accessibilityState={{ disabled: nonaktif }}
          onFocus={(e) => {
            setFokus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFokus(false);
            onBlur?.(e);
          }}
          style={{
            ...typography.body,
            ...(angka ? angkaTabular : null),
            flex: 1,
            minWidth: 0,
            minHeight: TAP_MIN,
            color: colors.teks,
            paddingVertical: spacing.sm,
            // Fokus sudah ditandai tepi aksen kolom; garis fokus bawaan browser
            // (web) di dalamnya hanya menggandakan.
            outlineWidth: 0,
          }}
          {...inputProps}
        />
        {unit ? <Text style={{ ...typography.caption, color: colors.teksSamar }}>{unit}</Text> : null}
        {ekor}
      </View>
      {galat ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Ionicons name="alert-circle-outline" size={ukuranIkon.kecil} color={colors.status.bahaya.teks} />
          <Text style={{ ...typography.labelBiasa, color: colors.status.bahaya.teks, flex: 1 }}>{galat}</Text>
        </View>
      ) : keterangan ? (
        <Text style={{ ...typography.labelBiasa, color: colors.teksSamar }}>{keterangan}</Text>
      ) : null}
    </View>
  );
}
