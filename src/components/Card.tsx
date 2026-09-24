import { View, type StyleProp, type ViewStyle } from 'react-native';
import { bayangan, colors, radius, spacing } from '@/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `flat` menghilangkan padding dalam untuk kartu yang mengatur isinya sendiri. */
  flat?: boolean;
};

/** Permukaan kartu standar: surface + border halus + radius lg. */
export function Card({ children, style, flat = false }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.permukaan,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.garis,
          padding: flat ? 0 : spacing.lg,
          ...bayangan.kartu,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
