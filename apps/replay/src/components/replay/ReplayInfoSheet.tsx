import type { ReplayIndex } from '@f1/domain';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../theme/useAppTheme';
import { radius, spacing, typography } from '../../theme/tokens';
import ChromeButton from '../ui/ChromeButton';
import ChromeSurface from '../ui/ChromeSurface';
import ThemedText from '../ui/ThemedText';

type ReplayInfoSheetProps = {
  index: ReplayIndex;
  onClose: () => void;
  visible: boolean;
};

export default function ReplayInfoSheet({
  index,
  onClose,
  visible,
}: ReplayInfoSheetProps) {
  const theme = useAppTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
      >
        <ChromeSurface
          accessibilityLabel="Replay data information"
          style={styles.sheet}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText accessibilityRole="header" style={styles.title}>
              Replay data
            </ThemedText>
            <View
              style={[
                styles.details,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <ThemedText>
                Source:{' '}
                {index.provenance.map(({ provider }) => provider).join(', ')}
              </ThemedText>
              <ThemedText tone="secondary">
                Retrieved {index.provenance[0].retrievedAtUtc.slice(0, 10)} ·
                G-force {index.dataQuality.derivedGForce}
              </ThemedText>
              <ThemedText tone="secondary">
                Excluded location samples:{' '}
                {index.dataQuality.excludedLocationSamplePercentage}%
              </ThemedText>
              {index.dataQuality.warnings.map((warning) => (
                <ThemedText key={warning} tone="secondary">
                  {warning}
                </ThemedText>
              ))}
            </View>
            <ChromeButton label="Close" onPress={onClose} />
          </ScrollView>
        </ChromeSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    gap: spacing.md,
  },
  details: {
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  sheet: {
    alignSelf: 'center',
    maxHeight: '80%',
    maxWidth: 520,
    padding: spacing.lg,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: typography.weight.regular,
  },
});
