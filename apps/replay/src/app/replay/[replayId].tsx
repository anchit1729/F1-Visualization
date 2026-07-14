import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import catalogArtifact from '../../../public/replays/v1/catalog.json';
import DriverInspector, {
  inspectorPresentationForWidth,
} from '../../components/replay/DriverInspector';
import PlaybackToolbar from '../../components/replay/PlaybackToolbar';
import ReplayInfoSheet from '../../components/replay/ReplayInfoSheet';
import TrackRenderer from '../../components/replay/TrackRenderer';
import ErrorState from '../../components/ui/ErrorState';
import ChromeButton from '../../components/ui/ChromeButton';
import ChromeSurface from '../../components/ui/ChromeSurface';
import LoadingState from '../../components/ui/LoadingState';
import Screen from '../../components/ui/Screen';
import ThemedText from '../../components/ui/ThemedText';
import { replayRepository } from '../../features/catalog/ReplayRepository';
import ReplayRepositoryError from '../../features/catalog/ReplayRepositoryError';
import useSemanticFeedback from '../../features/feedback/useSemanticFeedback';
import useTelemetryHaptics from '../../features/feedback/useTelemetryHaptics';
import {
  createReplayFrameSource,
  selectReplayFrame,
} from '../../features/replay/frameSelectors';
import { loadReplayStart } from '../../features/replay/loadReplayStart';
import useReplayPlayback from '../../features/playback/useReplayPlayback';
import { spacing, typography } from '../../theme/tokens';

type ReplayViewData = Awaited<ReturnType<typeof loadReplayStart>>;

type ReplayViewError = {
  canRetry: boolean;
  message: string;
};

export function generateStaticParams() {
  return catalogArtifact.replays.map(({ id }) => ({ replayId: id }));
}

export default function ReplayScreen() {
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const { replayId } = useLocalSearchParams<{ replayId?: string | string[] }>();
  const id = Array.isArray(replayId) ? replayId[0] : replayId;
  const [data, setData] = useState<ReplayViewData | null>(null);
  const [error, setError] = useState<ReplayViewError | null>(null);
  const [isInfoVisible, setInfoVisible] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const triggerFeedback = useSemanticFeedback();
  const retry = useCallback(() => setRequestKey((value) => value + 1), []);
  const replayPlayback = useReplayPlayback(data);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    setData(null);
    setError(null);
    setSelectedDriverId(null);

    if (!id) {
      setError({ canRetry: false, message: 'No replay was selected.' });
      return () => {
        isActive = false;
        controller.abort();
      };
    }

    loadReplayStart(replayRepository, id, controller.signal)
      .then((nextData) => {
        if (isActive) {
          setData(nextData);
        }
      })
      .catch((reason: unknown) => {
        if (
          isActive &&
          !(reason instanceof Error && reason.name === 'AbortError')
        ) {
          const isRepositoryError = reason instanceof ReplayRepositoryError;
          const isMissing = isRepositoryError && reason.kind === 'not-found';
          const guidance =
            __DEV__ && isMissing
              ? ` Replay ID: ${id}. Prepare curated artifacts with npm run replay:prepare.`
              : '';
          setError({
            canRetry:
              !isMissing &&
              !(isRepositoryError && reason.kind === 'unsupported-schema'),
            message: `${reason instanceof Error ? reason.message : 'The replay could not be loaded.'}${guidance}`,
          });
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [id, requestKey]);

  const frame = useMemo(() => {
    if (!data) return null;
    const source = createReplayFrameSource(
      data.replay.index,
      replayPlayback.chunks.length > 0 ? replayPlayback.chunks : [data.chunk],
    );
    return selectReplayFrame(
      source,
      replayPlayback.playback?.currentMs ?? data.replay.summary.startTimeMs,
    );
  }, [data, replayPlayback.chunks, replayPlayback.playback?.currentMs]);
  const positions = useMemo(() => {
    if (!frame) return {};
    return Object.fromEntries(
      Object.entries(frame.positionsByDriver).flatMap(([driverId, position]) =>
        position.status === 'available' ? [[driverId, position.value]] : [],
      ),
    );
  }, [frame]);
  const selectedDriver = data?.replay.index.drivers.find(
    ({ id: driverId }) => driverId === selectedDriverId,
  );
  const selectedTelemetry = selectedDriver
    ? frame?.telemetryByDriver[selectedDriver.id]
    : undefined;
  useTelemetryHaptics(
    selectedTelemetry,
    replayPlayback.playback?.status === 'playing',
  );
  const inspectorPresentation = inspectorPresentationForWidth(viewportWidth);
  const closeInspector = useCallback(() => {
    const focusId = selectedDriverId;
    setSelectedDriverId(null);
    if (Platform.OS === 'web' && focusId && typeof document !== 'undefined') {
      requestAnimationFrame(() =>
        document.getElementById(`car-select-${focusId}`)?.focus(),
      );
    }
  }, [selectedDriverId]);
  const handleSelectDriver = useCallback(
    (driverId: string) => {
      triggerFeedback('selection');
      setSelectedDriverId((selected) =>
        selected === driverId ? null : driverId,
      );
    },
    [triggerFeedback],
  );

  return (
    <Screen style={styles.screen}>
      {!data && !error ? (
        <ChromeSurface style={styles.loading} variant="panel">
          <LoadingState />
        </ChromeSurface>
      ) : null}
      {error ? (
        <View style={styles.error}>
          <ErrorState
            message={error.message}
            onRetry={error.canRetry ? retry : undefined}
          />
          <ChromeButton
            label="Back to library"
            onPress={() => router.replace('/')}
          />
        </View>
      ) : null}
      {data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <ThemedText accessibilityRole="header" style={styles.title}>
              {data.replay.summary.title}
            </ThemedText>
            <ThemedText style={styles.description} tone="secondary">
              {data.replay.summary.subtitle}
            </ThemedText>
          </View>
          <View
            style={[
              styles.replayBody,
              inspectorPresentation === 'side' && styles.replayBodyWide,
            ]}
          >
            <View style={styles.visualization}>
              <View style={styles.track}>
                <TrackRenderer
                  drivers={data.replay.index.drivers}
                  onSelectDriver={handleSelectDriver}
                  positions={positions}
                  selectedDriverId={selectedDriverId}
                  testID="replay-track"
                  track={data.replay.index.track}
                />
              </View>
              {replayPlayback.playback ? (
                <PlaybackToolbar
                  chunkError={replayPlayback.chunkError}
                  onRateChange={replayPlayback.changeRate}
                  onRetry={replayPlayback.retryChunk}
                  onSeek={replayPlayback.seekTo}
                  onSkip={replayPlayback.skip}
                  onTogglePlayback={replayPlayback.togglePlayback}
                  playback={replayPlayback.playback}
                />
              ) : null}
            </View>
            {frame && selectedDriver ? (
              <DriverInspector
                driver={selectedDriver}
                drivers={data.replay.index.drivers}
                onClose={closeInspector}
                overallFastestLap={frame.overallFastestLap}
                presentation={inspectorPresentation}
                telemetry={frame.telemetryByDriver[selectedDriver.id]}
                timing={frame.timingByDriver[selectedDriver.id]}
              />
            ) : null}
          </View>
          <ChromeSurface style={styles.status} variant="panel">
            <ThemedText style={styles.statusTitle}>Replay frame</ThemedText>
            <ThemedText tone="secondary">
              {Object.keys(positions).length} of{' '}
              {data.replay.index.drivers.length} cars positioned at the current
              replay time.
            </ThemedText>
            <ChromeButton
              label="Data quality and source"
              onPress={() => setInfoVisible(true)}
            />
          </ChromeSurface>
          <ReplayInfoSheet
            index={data.replay.index}
            onClose={() => setInfoVisible(false)}
            visible={isInfoVisible}
          />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.lg,
    maxWidth: 1180,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  description: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
  },
  error: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heading: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  screen: {
    paddingBottom: 0,
  },
  loading: {
    alignSelf: 'center',
  },
  replayBody: {
    alignItems: 'stretch',
    gap: spacing.lg,
    width: '100%',
  },
  replayBodyWide: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  status: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    padding: spacing.md,
  },
  statusTitle: {
    fontSize: typography.body,
    fontWeight: typography.weight.medium,
  },
  title: {
    fontSize: 28,
    fontWeight: typography.weight.regular,
  },
  track: {
    maxWidth: 760,
    width: '100%',
  },
  visualization: {
    flex: 1,
    gap: spacing.lg,
    minWidth: 0,
  },
});
