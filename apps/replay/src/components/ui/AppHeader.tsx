import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../../theme/useAppTheme';
import { spacing, typography } from '../../theme/tokens';
import ChromeSurface from './ChromeSurface';
import IconButton from './IconButton';
import ThemedText from './ThemedText';

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useAppTheme();
  const isLibrary = pathname === '/';

  return (
    <SafeAreaView
      edges={['top']}
      style={{ backgroundColor: theme.colors.background }}
    >
      <View>
        <ChromeSurface
          style={[styles.surface, { borderTopColor: theme.colors.accent }]}
          testID="app-header-surface"
          variant="chrome"
        >
          {!isLibrary ? (
            <IconButton
              accessibilityLabel="Back to library"
              onPress={() => router.replace('/')}
            >
              <ThemedText style={styles.back}>‹</ThemedText>
            </IconButton>
          ) : null}
          <ThemedText
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.title}
          >
            {isLibrary ? 'Replay library' : 'Replay'}
          </ThemedText>
        </ChromeSurface>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: {
    fontSize: 28,
    lineHeight: 30,
  },
  surface: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: typography.body,
    fontWeight: typography.weight.regular,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
