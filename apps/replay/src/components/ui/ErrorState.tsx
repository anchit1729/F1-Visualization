import { StyleSheet, View } from 'react-native';

import { spacing, typography } from '../../theme/tokens';
import Button from './Button';
import ThemedText from './ThemedText';

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View accessible accessibilityRole="alert" style={styles.container}>
      <ThemedText style={styles.message} tone="danger">
        {message}
      </ThemedText>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  message: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
  },
});
