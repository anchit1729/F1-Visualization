import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { spacing } from '../../theme/tokens';

type ScreenProps = PropsWithChildren<
  Pick<ViewProps, 'accessibilityLabel' | 'style' | 'testID'>
>;

export default function Screen({
  accessibilityLabel,
  children,
  style,
  testID,
}: ScreenProps) {
  const theme = useAppTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.screen,
        { backgroundColor: theme.colors.background },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.lg,
  },
});
