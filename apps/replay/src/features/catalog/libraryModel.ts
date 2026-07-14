import type { ReplaySummary } from './ReplayRepository';

export type ReplayScopeFilter = 'all' | 'lap' | 'race';
export type ReplayYearFilter = 'all' | number;

export type ReplayLibraryFilters = {
  scope: ReplayScopeFilter;
  year: ReplayYearFilter;
};

export function getReplayYears(replays: ReplaySummary[]) {
  return [...new Set(replays.map((replay) => replay.season))].sort(
    (left, right) => right - left,
  );
}

export function filterAndSortReplays(
  replays: ReplaySummary[],
  filters: ReplayLibraryFilters,
) {
  return [...replays]
    .filter(
      (replay) =>
        (filters.scope === 'all' || replay.replayScope === filters.scope) &&
        (filters.year === 'all' || replay.season === filters.year),
    )
    .sort(
      (left, right) =>
        right.season - left.season ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
}

export function formatReplayDuration(durationMs: number) {
  const minutes = Math.round(durationMs / 60000);
  return minutes < 1
    ? `${Math.round(durationMs / 1000)} sec`
    : `${minutes} min`;
}

export function getReplayButtonLabel(replay: ReplaySummary) {
  return `Open ${replay.title}, ${replay.season} ${replay.sessionName}, ${replay.driverCount} drivers, ${formatReplayDuration(replay.durationMs)}`;
}

export function getReplayButtonId(replayId: string) {
  return `replay-${replayId.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
}
