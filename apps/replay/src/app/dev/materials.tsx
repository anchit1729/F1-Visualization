import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ErrorState from '../../components/ui/ErrorState';
import ChromeButton from '../../components/ui/ChromeButton';
import ChromeIconButton from '../../components/ui/ChromeIconButton';
import ChromeSurface from '../../components/ui/ChromeSurface';
import IconButton from '../../components/ui/IconButton';
import LoadingState from '../../components/ui/LoadingState';
import Screen from '../../components/ui/Screen';
import { useAppTheme } from '../../theme/useAppTheme';
import { getTheme, radius, spacing, typography } from '../../theme/tokens';

export default function MaterialsScreen() {
  const theme = useAppTheme();
  const darkTheme = getTheme('dark');
  const lightTheme = getTheme('light');

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.colors.text }]}
        >
          Material gallery
        </Text>
        <ChromeSurface style={styles.sample} variant="chrome">
          <Text style={{ color: theme.colors.text }}>Chrome surface</Text>
        </ChromeSurface>
        <View style={styles.appearanceRow}>
          <View
            style={[
              styles.appearanceSample,
              { backgroundColor: lightTheme.colors.background },
            ]}
          >
            <ChromeSurface
              appearance="light"
              style={styles.sample}
              variant="control"
            >
              <Text style={{ color: lightTheme.colors.text }}>
                Light chrome
              </Text>
            </ChromeSurface>
          </View>
          <View
            style={[
              styles.appearanceSample,
              { backgroundColor: darkTheme.colors.background },
            ]}
          >
            <ChromeSurface
              appearance="dark"
              style={styles.sample}
              variant="control"
            >
              <Text style={{ color: darkTheme.colors.text }}>Dark chrome</Text>
            </ChromeSurface>
          </View>
        </View>
        <ChromeSurface style={styles.sample} variant="panel">
          <Text style={{ color: theme.colors.text }}>Matte panel</Text>
        </ChromeSurface>
        <Card style={styles.row}>
          <Button label="Primary action" />
          <ChromeButton label="Chrome action" />
          <IconButton accessibilityLabel="Standard icon">
            <Text style={{ color: theme.colors.text }}>●</Text>
          </IconButton>
          <ChromeIconButton accessibilityLabel="Chrome icon">
            <Text style={{ color: theme.colors.text }}>●</Text>
          </ChromeIconButton>
        </Card>
        <LoadingState />
        <ErrorState message="Example error state" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  appearanceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  appearanceSample: {
    borderRadius: radius.lg,
    flex: 1,
    minWidth: 220,
    padding: spacing.md,
  },
  content: {
    gap: spacing.md,
    marginHorizontal: 'auto',
    maxWidth: 720,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sample: {
    padding: spacing.lg,
  },
  screen: {
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: typography.weight.regular,
    lineHeight: typography.titleLineHeight,
  },
});
