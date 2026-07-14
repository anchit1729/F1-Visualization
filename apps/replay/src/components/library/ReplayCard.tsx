import { StyleSheet, View } from 'react-native';

import type { ReplaySummary } from '../../features/catalog/ReplayRepository';
import {
  formatReplayDuration,
  getReplayButtonId,
  getReplayButtonLabel,
} from '../../features/catalog/libraryModel';
import { useAppTheme } from '../../theme/useAppTheme';
import { radius, spacing, typography } from '../../theme/tokens';
import TrackRenderer from '../replay/TrackRenderer';
import Card from '../ui/Card';
import ChromeButton from '../ui/ChromeButton';
import ThemedText from '../ui/ThemedText';

type ReplayCardProps = {
  onOpen: (replay: ReplaySummary) => void;
  replay: ReplaySummary;
};

export default function ReplayCard({ onOpen, replay }: ReplayCardProps) {
  const theme = useAppTheme();
  const scopeLabel = replay.replayScope === 'race' ? 'Race' : 'Lap';

  return (
    <Card style={styles.card} testID={`replay-card-${replay.id}`}>
      <TrackRenderer track={replay.trackPreview} />
      <View style={styles.heading}>
        <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
          <ThemedText style={styles.badgeLabel} tone="on-accent">
            {scopeLabel}
          </ThemedText>
        </View>
        <ThemedText style={styles.title}>{replay.title}</ThemedText>
      </View>
      <View style={styles.copy}>
        <ThemedText style={styles.meeting}>{replay.meetingName}</ThemedText>
        <ThemedText style={styles.metadata} tone="secondary">
          {replay.season} · {replay.sessionName} ·{' '}
          {formatReplayDuration(replay.durationMs)} · {replay.driverCount}{' '}
          drivers
        </ThemedText>
      </View>
      <ChromeButton
        accessibilityLabel={getReplayButtonLabel(replay)}
        label="Open replay"
        nativeID={getReplayButtonId(replay.id)}
        onPress={() => onOpen(replay)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.6,
  },
  card: {
    flexBasis: 320,
    flexGrow: 1,
    gap: spacing.md,
    maxWidth: 560,
    minWidth: 0,
  },
  copy: {
    gap: spacing.xs,
  },
  heading: {
    gap: spacing.sm,
  },
  meeting: {
    fontSize: typography.body,
  },
  metadata: {
    fontSize: typography.label,
    lineHeight: typography.bodyLineHeight,
  },
  title: {
    fontSize: 20,
    fontWeight: typography.weight.regular,
    letterSpacing: 0.15,
  },
});
