import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { getTheme, type SurfaceVariant } from '../../theme/tokens';

type ChromeSurfaceProps = PropsWithChildren<{
  accessibilityLabel?: string;
  appearance?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: SurfaceVariant;
}>;

export default function ChromeSurface({
  accessibilityLabel,
  appearance,
  children,
  style,
  testID,
  variant = 'panel',
}: ChromeSurfaceProps) {
  const systemTheme = useAppTheme();
  const theme = appearance ? getTheme(appearance) : systemTheme;
  const recipe = theme.surfaces[variant];

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.surface,
        {
          backgroundColor: recipe.backgroundColor,
          borderColor: recipe.borderColor,
          borderRadius: recipe.radius,
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
