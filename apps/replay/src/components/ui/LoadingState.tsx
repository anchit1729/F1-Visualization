import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { spacing, typography } from '../../theme/tokens';
import ThemedText from './ThemedText';

type LoadingStateProps = {
  label?: string;
};

export default function LoadingState({
  label = 'Loading replay',
}: LoadingStateProps) {
  const theme = useAppTheme();

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={styles.container}
    >
      <ActivityIndicator color={theme.colors.accent} />
      <ThemedText style={styles.label} tone="secondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  label: {
    fontSize: typography.body,
  },
});
