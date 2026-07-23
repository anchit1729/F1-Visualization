import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import LibrarySkeleton from '../components/library/LibrarySkeleton';
import ReplayCard from '../components/library/ReplayCard';
import ReplayFilters from '../components/library/ReplayFilters';
import ErrorState from '../components/ui/ErrorState';
import ChromeButton from '../components/ui/ChromeButton';
import Screen from '../components/ui/Screen';
import ThemedText from '../components/ui/ThemedText';
import {
  replayRepository,
  type ReplaySummary,
} from '../features/catalog/ReplayRepository';
import { loadCatalogQuery } from '../features/catalog/catalogQuery';
import {
  rememberReplayControl,
  restoreReplayControl,
} from '../features/catalog/libraryFocus';
import {
  filterAndSortReplays,
  getReplayButtonId,
  getReplayYears,
  type ReplayScopeFilter,
  type ReplayYearFilter,
} from '../features/catalog/libraryModel';
import { useLiquidGlass } from '../theme/useLiquidGlass';
import { spacing, typography } from '../theme/tokens';

export default function LibraryScreen() {
  const router = useRouter();
  const useGlass = useLiquidGlass();
  const [replays, setReplays] = useState<ReplaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);
  const [scope, setScope] = useState<ReplayScopeFilter>('all');
  const [year, setYear] = useState<ReplayYearFilter>('all');

  const retry = useCallback(() => setRequestKey((value) => value + 1), []);
  const resetFilters = useCallback(() => {
    setScope('all');
    setYear('all');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    loadCatalogQuery(replayRepository, controller.signal)
      .then((catalog) => setReplays(catalog.replays))
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === 'AbortError')) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'The replay library could not be loaded.',
          );
        }
      });

    return () => controller.abort();
  }, [requestKey]);

  useFocusEffect(
    useCallback(() => {
      if (
        !replays ||
        Platform.OS !== 'web' ||
        typeof document === 'undefined'
      ) {
        return undefined;
      }

      const frame = requestAnimationFrame(() => {
        restoreReplayControl(document);
      });
      return () => cancelAnimationFrame(frame);
    }, [replays]),
  );

  const years = useMemo(() => getReplayYears(replays ?? []), [replays]);
  const visibleReplays = useMemo(
    () => filterAndSortReplays(replays ?? [], { scope, year }),
    [replays, scope, year],
  );
  const openReplay = useCallback(
    (replay: ReplaySummary) => {
      rememberReplayControl(getReplayButtonId(replay.id));
      router.push(`/replay/${replay.id}`);
    },
    [router],
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={!useGlass}
      >
        <View style={styles.intro}>
          <ThemedText accessibilityRole="header" style={styles.title}>
            Replay library
          </ThemedText>
          <ThemedText style={styles.description} tone="secondary">
            Select a curated race or lap to inspect its circuit and opening
            frame.
          </ThemedText>
        </View>

        {!replays && !error ? <LibrarySkeleton /> : null}
        {error ? <ErrorState message={error} onRetry={retry} /> : null}
        {replays?.length === 0 ? (
          <ThemedText tone="secondary">
            No curated replays are available.
          </ThemedText>
        ) : null}
        {replays && replays.length > 0 ? (
          <>
            <ReplayFilters
              onScopeChange={setScope}
              onYearChange={setYear}
              scope={scope}
              year={year}
              years={years}
            />
            {visibleReplays.length === 0 ? (
              <View style={styles.emptyFiltered}>
                <ThemedText tone="secondary">
                  No replays match these filters.
                </ThemedText>
                <ChromeButton label="Reset filters" onPress={resetFilters} />
              </View>
            ) : (
              <View style={styles.grid}>
                {visibleReplays.map((replay) => (
                  <ReplayCard
                    key={replay.id}
                    onOpen={openReplay}
                    replay={replay}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignSelf: 'center',
    gap: spacing.lg,
    maxWidth: 1160,
    paddingBottom: spacing.xxl,
    width: '100%',
  },
  description: {
    fontSize: typography.body,
    lineHeight: typography.bodyLineHeight,
  },
  emptyFiltered: {
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  grid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  intro: {
    gap: spacing.sm,
  },
  screen: {
    paddingBottom: 0,
  },
  title: {
    fontSize: typography.title,
    fontWeight: typography.weight.regular,
    letterSpacing: -0.4,
    lineHeight: typography.titleLineHeight,
  },
});
