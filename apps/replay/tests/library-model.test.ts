import type { Catalog } from '@f1/domain';
import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';

import {
  focusReplayControl,
  rememberReplayControl,
  restoreReplayControl,
} from '../src/features/catalog/libraryFocus';
import {
  filterAndSortReplays,
  formatReplayDuration,
  getReplayButtonId,
  getReplayButtonLabel,
  getReplayYears,
} from '../src/features/catalog/libraryModel';

const [race] = (catalogFixture as Catalog).replays;
const lap = {
  ...race,
  id: 'tiny-lap',
  replayScope: 'lap' as const,
  season: 2023,
  title: 'Tiny Fastest Lap',
};
const newerRace = {
  ...race,
  id: 'newer-race',
  season: 2025,
  title: 'Newer Grand Prix',
};

describe('replay library model', () => {
  test('derives unique years in descending order', () => {
    expect(getReplayYears([lap, race, newerRace, race])).toEqual([
      2025, 2024, 2023,
    ]);
  });

  test('filters by scope and year without mutating the catalog', () => {
    const replays = [lap, race, newerRace];
    const original = [...replays];

    expect(
      filterAndSortReplays(replays, { scope: 'race', year: 'all' }).map(
        ({ id }) => id,
      ),
    ).toEqual(['newer-race', race.id]);
    expect(
      filterAndSortReplays(replays, { scope: 'all', year: 2023 }).map(
        ({ id }) => id,
      ),
    ).toEqual(['tiny-lap']);
    expect(replays).toEqual(original);
  });

  test('uses a stable title and ID fallback within the same year', () => {
    const sameTitle = { ...race, id: 'z-replay' };
    expect(
      filterAndSortReplays([sameTitle, race], {
        scope: 'all',
        year: 'all',
      }).map(({ id }) => id),
    ).toEqual([race.id, 'z-replay']);
  });

  test('formats concise duration and accessible labels', () => {
    expect(formatReplayDuration(10000)).toBe('10 sec');
    expect(formatReplayDuration(1736121)).toBe('29 min');
    expect(getReplayButtonLabel(race)).toContain(
      'Open Tiny Grand Prix, 2024 Race, 2 drivers, 10 sec',
    );
    expect(getReplayButtonId('race/unsafe id')).toBe('replay-race-unsafe-id');
  });

  test('restores focus only when the replay control is present', () => {
    const focus = jest.fn();
    const root = {
      getElementById: jest
        .fn()
        .mockReturnValueOnce({ focus })
        .mockReturnValueOnce(null),
    };

    expect(focusReplayControl(root, 'replay-tiny')).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focusReplayControl(root, 'missing')).toBe(false);
  });

  test('keeps pending focus across a library remount until the card exists', () => {
    const focus = jest.fn();
    const missingRoot = { getElementById: jest.fn().mockReturnValue(null) };
    const readyRoot = {
      getElementById: jest.fn().mockReturnValue({ focus }),
    };

    rememberReplayControl('replay-tiny');
    expect(restoreReplayControl(missingRoot)).toBe(false);
    expect(restoreReplayControl(readyRoot)).toBe(true);
    expect(readyRoot.getElementById).toHaveBeenCalledWith('replay-tiny');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(restoreReplayControl(readyRoot)).toBe(false);
  });
});
