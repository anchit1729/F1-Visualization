import type { Catalog, ReplayChunk, ReplayIndex } from '@f1/domain';
import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';
import chunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00000.json';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

import NotFoundScreen from '../src/app/+not-found';
import LibraryScreen from '../src/app/index';
import ReplayScreen, {
  generateStaticParams,
} from '../src/app/replay/[replayId]';
import AppHeader from '../src/components/ui/AppHeader';
import { replayRepository } from '../src/features/catalog/ReplayRepository';
import ReplayRepositoryError from '../src/features/catalog/ReplayRepositoryError';
import { AppThemeProvider } from '../src/theme/useAppTheme';
import { getTheme } from '../src/theme/tokens';

const mockTriggerFeedback = jest.fn();

jest.mock(
  '../src/features/feedback/useSemanticFeedback',
  () => () => mockTriggerFeedback,
);

const catalog = catalogFixture as Catalog;
const index = indexFixture as ReplayIndex;
const chunk = chunkFixture as ReplayChunk;
const loadedReplay = {
  index,
  indexUrl: '/replays/v1/tiny-race/index.json',
  summary: catalog.replays[0],
};

const routes = {
  '+not-found': NotFoundScreen,
  index: LibraryScreen,
  'replay/[replayId]': ReplayScreen,
};

function DarkHeaderFixture() {
  return (
    <AppThemeProvider appearance="dark">
      <AppHeader />
    </AppThemeProvider>
  );
}

beforeEach(() => {
  mockTriggerFeedback.mockClear();
  jest.spyOn(replayRepository, 'getCatalog').mockResolvedValue(catalog);
  jest.spyOn(replayRepository, 'getReplay').mockResolvedValue(loadedReplay);
  jest.spyOn(replayRepository, 'getChunk').mockResolvedValue(chunk);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('application routes', () => {
  test('keeps dark header material and text on the dark theme', async () => {
    const darkTheme = getTheme('dark');

    await renderRouter({ index: DarkHeaderFixture }, { initialUrl: '/' });

    expect(screen.getByTestId('app-header-surface')).toHaveStyle({
      backgroundColor: darkTheme.surfaces.chrome.backgroundColor,
    });
    expect(screen.getByRole('header', { name: 'Replay library' })).toHaveStyle({
      color: darkTheme.colors.text,
    });
  });

  test('generates a concrete static route for every curated replay', () => {
    expect(generateStaticParams()).toEqual(
      expect.arrayContaining([
        { replayId: 'tiny-demo' },
        { replayId: '2023-belgium-sprint' },
      ]),
    );
  });

  test('boots into the catalog library and navigates to a replay', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    expect(screen.getByRole('header', { name: 'Replay library' })).toBeTruthy();

    await fireEvent.press(
      await screen.findByRole('button', {
        name: /^Open Tiny Grand Prix/u,
      }),
    );

    expect(await screen.findByTestId('replay-track')).toBeTruthy();
    expect(screen.getByText(/1 of 2 cars positioned/u)).toBeTruthy();
    expect(screen.getByTestId('driver-list-driver-2')).toHaveProp(
      'accessibilityState',
      { disabled: true, selected: false },
    );
  });

  test('renders complete card metadata and an accessible action label', async () => {
    await renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByText('Fixture Grand Prix')).toBeTruthy();
    expect(
      within(screen.getByTestId('replay-card-tiny-race')).getByText('Race'),
    ).toBeTruthy();
    expect(screen.getByText(/2024 · Race · 10 sec · 2 drivers/u)).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Open Tiny Grand Prix, 2024 Race, 2 drivers, 10 sec',
      }),
    ).toBeTruthy();
  });

  test('filters the catalog by scope and year', async () => {
    const lapReplay = {
      ...catalog.replays[0],
      id: 'tiny-lap',
      replayScope: 'lap' as const,
      season: 2023,
      title: 'Tiny Fastest Lap',
    };
    jest.spyOn(replayRepository, 'getCatalog').mockResolvedValue({
      ...catalog,
      replays: [catalog.replays[0], lapReplay],
    });

    await renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('replay-card-tiny-race');

    const lapFilter = screen.getByRole('button', { name: 'Lap' });
    await fireEvent(lapFilter, 'focus');
    expect(screen.getByTestId('focus-ring')).toBeTruthy();
    await fireEvent.press(lapFilter);
    expect(screen.getByTestId('replay-card-tiny-lap')).toBeTruthy();
    expect(screen.queryByTestId('replay-card-tiny-race')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    await fireEvent.press(screen.getByRole('button', { name: '2024' }));
    expect(screen.getByTestId('replay-card-tiny-race')).toBeTruthy();
    expect(screen.queryByTestId('replay-card-tiny-lap')).toBeNull();
  });

  test('shows loading, empty, and retryable catalog states', async () => {
    let resolveCatalog: (value: Catalog) => void = () => undefined;
    const pending = new Promise<Catalog>((resolve) => {
      resolveCatalog = resolve;
    });
    jest.spyOn(replayRepository, 'getCatalog').mockReturnValue(pending);
    const loadingRender = await renderRouter(routes, { initialUrl: '/' });
    expect(
      screen.getByRole('progressbar', { name: 'Loading library' }),
    ).toBeTruthy();
    await loadingRender.unmount();
    resolveCatalog(catalog);

    jest.spyOn(replayRepository, 'getCatalog').mockResolvedValue({
      schemaVersion: 1,
      replays: [],
    });
    const emptyRender = await renderRouter(routes, { initialUrl: '/' });
    expect(
      await screen.findByText('No curated replays are available.'),
    ).toBeTruthy();
    await emptyRender.unmount();

    jest
      .spyOn(replayRepository, 'getCatalog')
      .mockRejectedValue(
        new ReplayRepositoryError('network', 'Catalog unavailable.'),
      );
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Catalog unavailable.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  test('opens a replay deep link and renders its initial frame', async () => {
    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });

    expect(await screen.findByText('Tiny Grand Prix')).toBeTruthy();
    expect(screen.getByTestId('replay-track')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Data quality and source' }),
    );
    expect(screen.getByRole('header', { name: 'Replay data' })).toBeTruthy();
    expect(screen.getByText('Source: fixture')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  });

  test('opens and closes live details for an available driver', async () => {
    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });

    await fireEvent.press(await screen.findByTestId('driver-list-driver-1'));
    expect(mockTriggerFeedback).toHaveBeenCalledWith('selection');
    expect(screen.getByTestId('driver-inspector')).toBeTruthy();
    expect(screen.getByText('100 km/h')).toBeTruthy();
    expect(screen.getByText('Not applied')).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Close driver details' }),
    );
    expect(screen.queryByTestId('driver-inspector')).toBeNull();
  });

  test('plays, seeks car markers, and pauses', async () => {
    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });
    expect(await screen.findByText(/1 of 2 cars positioned/u)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    const scrubber = screen.getByTestId('replay-scrubber');
    await fireEvent(scrubber, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(await screen.findByText(/2 of 2 cars positioned/u)).toBeTruthy();
    expect(scrubber).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ now: 1000 }),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  test('shows a visible replay loading error with retry', async () => {
    jest
      .spyOn(replayRepository, 'getReplay')
      .mockRejectedValue(new Error('Replay is unavailable.'));

    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });

    expect(await screen.findByText('Replay is unavailable.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  test('shows a library action without retrying a missing replay', async () => {
    jest
      .spyOn(replayRepository, 'getReplay')
      .mockRejectedValue(
        new ReplayRepositoryError('not-found', 'Replay is missing.'),
      );

    await renderRouter(routes, { initialUrl: '/replay/missing' });

    expect(await screen.findByText(/Replay is missing/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Back to library' }),
    ).toBeTruthy();
  });

  test('does not retry an unsupported replay schema', async () => {
    jest
      .spyOn(replayRepository, 'getReplay')
      .mockRejectedValue(
        new ReplayRepositoryError(
          'unsupported-schema',
          'This replay uses a newer data format.',
        ),
      );

    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });

    expect(
      await screen.findByText('This replay uses a newer data format.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  test('aborts replay loading when the route unmounts', async () => {
    let requestSignal: AbortSignal | undefined;
    jest
      .spyOn(replayRepository, 'getReplay')
      .mockImplementation((_, signal) => {
        requestSignal = signal;
        return new Promise(() => {
          // Intentionally pending until the route aborts the request.
        });
      });

    const rendered = await renderRouter(routes, {
      initialUrl: '/replay/tiny-race',
    });
    await rendered.unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  test('ignores a stale replay after rapid route switching', async () => {
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let resolveFirst: (value: typeof loadedReplay) => void = () => undefined;
    let resolveSecond: (value: typeof loadedReplay) => void = () => undefined;
    const secondReplay = {
      ...loadedReplay,
      index: { ...index, id: 'second-race' },
      summary: {
        ...loadedReplay.summary,
        id: 'second-race',
        title: 'Second Grand Prix',
      },
    };
    jest
      .spyOn(replayRepository, 'getReplay')
      .mockImplementation((id, signal) => {
        if (id === 'tiny-race') {
          firstSignal = signal;
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }

        secondSignal = signal;
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      });

    await renderRouter(routes, { initialUrl: '/replay/tiny-race' });
    await waitFor(() => expect(firstSignal).toBeDefined());
    await act(() => router.replace('/replay/second-race'));
    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    await waitFor(() => expect(secondSignal).toBeDefined());

    await act(() => resolveSecond(secondReplay));
    expect(await screen.findByText('Second Grand Prix')).toBeTruthy();
    await act(() => resolveFirst(loadedReplay));
    expect(screen.queryByText('Tiny Grand Prix')).toBeNull();
  });

  test('renders the not-found route for an unknown path', async () => {
    await renderRouter(routes, { initialUrl: '/missing' });

    expect(screen.getByText('Replay not found')).toBeTruthy();
  });
});
