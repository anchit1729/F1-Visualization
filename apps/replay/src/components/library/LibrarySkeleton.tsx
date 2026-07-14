import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { radius, spacing } from '../../theme/tokens';
import Card from '../ui/Card';

export default function LibrarySkeleton() {
  const theme = useAppTheme();
  const placeholder = { backgroundColor: theme.colors.border };

  return (
    <View
      accessible
      accessibilityLabel="Loading library"
      accessibilityRole="progressbar"
      style={styles.grid}
    >
      {[0, 1].map((item) => (
        <Card key={item} style={styles.card}>
          <View style={[styles.preview, placeholder]} />
          <View style={[styles.title, placeholder]} />
          <View style={[styles.line, placeholder]} />
          <View style={[styles.control, placeholder]} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: 320,
    flexGrow: 1,
    gap: spacing.md,
    maxWidth: 560,
    minWidth: 0,
  },
  control: {
    borderRadius: radius.pill,
    height: 44,
    opacity: 0.45,
    width: 124,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  line: {
    borderRadius: radius.sm,
    height: 16,
    opacity: 0.45,
    width: '70%',
  },
  preview: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    opacity: 0.35,
    width: '100%',
  },
  title: {
    borderRadius: radius.sm,
    height: 24,
    opacity: 0.55,
    width: '86%',
  },
});
