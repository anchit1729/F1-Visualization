import { GlassView } from 'expo-glass-effect';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { useLiquidGlass } from '../../theme/useLiquidGlass';
import { getTheme, type SurfaceVariant } from '../../theme/tokens';

type ChromeSurfaceProps = PropsWithChildren<{
  accessibilityLabel?: string;
  appearance?: 'dark' | 'light';
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: SurfaceVariant;
}>;

export default function ChromeSurface({
  accessibilityLabel,
  appearance,
  children,
  interactive = false,
  style,
  testID,
  variant = 'panel',
}: ChromeSurfaceProps) {
  const systemTheme = useAppTheme();
  const theme = appearance ? getTheme(appearance) : systemTheme;
  const recipe = theme.surfaces[variant];
  const glassRecipe = theme.liquidGlass[variant];
  const useGlass = useLiquidGlass();

  if (useGlass) {
    return (
      <GlassView
        accessibilityLabel={accessibilityLabel}
        colorScheme={theme.mode}
        glassEffectStyle={glassRecipe.effect}
        isInteractive={interactive}
        style={[
          styles.surface,
          {
            backgroundColor: 'transparent',
            borderColor: glassRecipe.borderColor,
            borderRadius: glassRecipe.radius,
          },
          style,
        ]}
        testID={testID}
        tintColor={glassRecipe.tintColor}
      >
        {children}
      </GlassView>
    );
  }

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
