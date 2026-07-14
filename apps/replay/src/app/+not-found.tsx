import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import ChromeButton from '../components/ui/ChromeButton';
import Screen from '../components/ui/Screen';
import ThemedText from '../components/ui/ThemedText';
import { spacing, typography } from '../theme/tokens';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen style={styles.screen}>
      <ThemedText accessibilityRole="header" style={styles.title}>
        Replay not found
      </ThemedText>
      <ChromeButton
        label="Return to library"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: typography.weight.regular,
  },
});
