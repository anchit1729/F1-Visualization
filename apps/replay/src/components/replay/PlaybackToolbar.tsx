import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  PlaybackRate,
  PlaybackState,
} from '../../features/playback/playbackController';
import useSemanticFeedback from '../../features/feedback/useSemanticFeedback';
import { useAppTheme } from '../../theme/useAppTheme';
import { spacing, typography } from '../../theme/tokens';
import Button from '../ui/Button';
import ChromeSurface from '../ui/ChromeSurface';
import IconButton from '../ui/IconButton';
import ThemedText from '../ui/ThemedText';
import ReplayScrubber from './ReplayScrubber';

type PlaybackToolbarProps = {
  chunkError?: string | null;
  onRateChange: (rate: PlaybackRate) => void;
  onRetry?: () => void;
  onSeek: (timeMs: number) => void;
  onSkip: (offsetMs: number) => void;
  onTogglePlayback: () => void;
  playback: PlaybackState;
};

const rates: PlaybackRate[] = [0.5, 1, 2];

export function formatPlaybackTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${clock.padStart(5, '0')}` : clock;
}

export default function PlaybackToolbar({
  chunkError,
  onRateChange,
  onRetry,
  onSeek,
  onSkip,
  onTogglePlayback,
  playback,
}: PlaybackToolbarProps) {
  const theme = useAppTheme();
  const triggerFeedback = useSemanticFeedback();
  const [previewMs, setPreviewMs] = useState(playback.currentMs);
  const scrubDetent = useRef<number | null>(null);
  const wasPlaying = useRef(playback.status === 'playing');
  useEffect(() => setPreviewMs(playback.currentMs), [playback.currentMs]);

  const isBuffering = playback.status === 'buffering';
  const isAtEnd = playback.currentMs === playback.endMs;
  const elapsedMs = previewMs - playback.startMs;
  const durationMs = playback.endMs - playback.startMs;
  let playLabel = 'Play';
  if (isAtEnd) playLabel = 'Replay';
  else if (playback.status === 'playing') playLabel = 'Pause';
  const nextRate = rates[(rates.indexOf(playback.rate) + 1) % rates.length];
  const iconStyle = [styles.icon, { color: theme.colors.text }];
  const handlePreview = useCallback(
    (timeMs: number) => {
      setPreviewMs(timeMs);
      const nextDetent = Math.floor(timeMs / 1000);
      if (scrubDetent.current !== nextDetent) {
        scrubDetent.current = nextDetent;
        triggerFeedback('scrub');
      }
    },
    [triggerFeedback],
  );
  const handleSeek = useCallback(
    (timeMs: number) => {
      triggerFeedback('scrub');
      onSeek(timeMs);
    },
    [onSeek, triggerFeedback],
  );
  const handleTogglePlayback = useCallback(() => {
    triggerFeedback(playback.status === 'playing' ? 'pause' : 'play');
    onTogglePlayback();
  }, [onTogglePlayback, playback.status, triggerFeedback]);

  useEffect(() => {
    if (isAtEnd && wasPlaying.current) triggerFeedback('complete');
    wasPlaying.current = playback.status === 'playing';
  }, [isAtEnd, playback.status, triggerFeedback]);

  return (
    <ChromeSurface
      accessibilityLabel="Playback controls"
      style={styles.toolbar}
      variant="chrome"
    >
      <View style={styles.timeRow}>
        <ThemedText style={styles.time}>
          {formatPlaybackTime(elapsedMs)}
        </ThemedText>
        <ThemedText style={styles.time} tone="secondary">
          {formatPlaybackTime(durationMs)}
        </ThemedText>
      </View>
      <ReplayScrubber
        disabled={isBuffering}
        maximumMs={playback.endMs}
        minimumMs={playback.startMs}
        onCommit={handleSeek}
        onPreview={handlePreview}
        valueMs={playback.currentMs}
        valueText={`${formatPlaybackTime(elapsedMs)} of ${formatPlaybackTime(durationMs)}`}
      />
      <View style={styles.controlRow}>
        <IconButton
          accessibilityLabel="Skip backward 10 seconds"
          disabled={isBuffering || playback.currentMs === playback.startMs}
          onPress={() => onSkip(-10000)}
          testID="skip-backward"
        >
          <Text style={iconStyle}>−10</Text>
        </IconButton>
        <IconButton
          accessibilityLabel={playLabel}
          disabled={isBuffering}
          onPress={handleTogglePlayback}
          testID="playback-toggle"
        >
          <Text style={iconStyle}>
            {playback.status === 'playing' ? 'Ⅱ' : '▶'}
          </Text>
        </IconButton>
        <IconButton
          accessibilityLabel="Skip forward 10 seconds"
          disabled={isBuffering || playback.currentMs === playback.endMs}
          onPress={() => onSkip(10000)}
          testID="skip-forward"
        >
          <Text style={iconStyle}>+10</Text>
        </IconButton>
        <IconButton
          accessibilityLabel={`Playback speed ${playback.rate}x. Set ${nextRate}x`}
          disabled={isBuffering}
          onPress={() => onRateChange(nextRate)}
          testID="playback-rate"
        >
          <Text style={iconStyle}>{playback.rate}×</Text>
        </IconButton>
      </View>
      {isBuffering || chunkError ? (
        <View style={styles.messageRow}>
          <ThemedText
            accessibilityLiveRegion="polite"
            tone={chunkError ? 'danger' : 'secondary'}
          >
            {chunkError ?? 'Buffering replay data…'}
          </ThemedText>
          {chunkError && onRetry ? (
            <Button label="Retry segment" onPress={onRetry} />
          ) : null}
        </View>
      ) : null}
    </ChromeSurface>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  icon: {
    fontSize: typography.label,
    fontWeight: typography.weight.medium,
  },
  messageRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  time: {
    fontSize: typography.label,
    fontVariant: ['tabular-nums'],
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  toolbar: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    padding: spacing.md,
  },
});
