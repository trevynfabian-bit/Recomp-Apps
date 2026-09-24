import { Pressable, Text, View } from 'react-native';
import { ketukRingan } from '@/lib/haptics';
import { colors, KONTROL_SEGMEN, radius, sisaSentuh, spacing, typography, ukuran } from '@/theme';
import { Sisipan } from './Sisipan';

export type OpsiSegmen<T extends string> = {
  nilai: T;
  label: string;
  /** Sisipan redup setelah label, mis. "aktif" → "Cut · aktif". */
  sisipan?: string;
  /** Titik aksen di kanan label (mis. ada perubahan belum disimpan); sebutkan juga di `aksesLabel`. */
  penanda?: boolean;
  /** Label pembaca layar bila berbeda dari `aksesAwalan + label`. */
  aksesLabel?: string;
};

/**
 * Kontrol segmen bersama (bab Desain 8.6): pilih satu dari 2–4 opsi pendek.
 * Tinggi `KONTROL_SEGMEN` (40 pt) dengan area sentuh digenapkan ke 44 pt.
 *
 * `peran="radio"` (bawaan) untuk setelan yang langsung berlaku; `"tab"` bila
 * segmen mengganti isi di bawahnya (mis. fase di Target harian).
 */
export function PilihanSegmen<T extends string>({
  opsi,
  terpilih,
  onPilih,
  aksesAwalan,
  peran = 'radio',
}: {
  opsi: OpsiSegmen<T>[];
  terpilih: T;
  onPilih: (nilai: T) => void;
  /** Awalan label aksesibilitas, mis. "Satuan" → "Satuan kg · cm". */
  aksesAwalan?: string;
  peran?: 'radio' | 'tab';
}) {
  return (
    <View
      accessibilityRole={peran === 'radio' ? 'radiogroup' : 'tablist'}
      style={{
        flexDirection: 'row',
        padding: ukuran.sisipanSegmen,
        borderRadius: radius.pill,
        backgroundColor: colors.permukaanCekung,
      }}
    >
      {opsi.map((o) => {
        const aktif = o.nilai === terpilih;
        return (
          <Pressable
            key={o.nilai}
            hitSlop={{ top: sisaSentuh(KONTROL_SEGMEN), bottom: sisaSentuh(KONTROL_SEGMEN) }}
            accessibilityRole={peran}
            accessibilityState={{ selected: aktif }}
            accessibilityLabel={o.aksesLabel ?? (aksesAwalan ? `${aksesAwalan} ${o.label}` : o.label)}
            onPress={() => {
              if (aktif) return;
              ketukRingan();
              onPilih(o.nilai);
            }}
            style={{
              flex: 1,
              minHeight: KONTROL_SEGMEN,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: aktif ? colors.permukaan : 'transparent',
              borderWidth: aktif ? 1 : 0,
              borderColor: colors.garisKontrol,
            }}
          >
            <Text style={{ ...typography.label, color: aktif ? colors.teks : colors.teksRedup }}>
              {o.label}
              {o.sisipan ? <Sisipan>{o.sisipan}</Sisipan> : null}
            </Text>
            {o.penanda ? (
              <View
                style={{
                  width: ukuran.titikKecil,
                  height: ukuran.titikKecil,
                  borderRadius: radius.pill,
                  backgroundColor: colors.aksen.isian,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
