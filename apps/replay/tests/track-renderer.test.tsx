import type { Driver, Point, ReplayIndex } from '@f1/domain';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import TrackRenderer, {
  getContrastingTextColor,
  getTrackLayout,
  resolveNearestDriverId,
} from '../src/components/replay/TrackRenderer';
import { AppThemeProvider } from '../src/theme/useAppTheme';
import { focus, getTheme } from '../src/theme/tokens';

const index = indexFixture as ReplayIndex;
const { drivers } = index;
const positions: Record<string, Point> = {
  'driver-1': { x: 10, y: 30 },
  'driver-2': { x: 12, y: 31 },
};

describe('TrackRenderer', () => {
  test('renders normalized track geometry and marker layers', async () => {
    await render(<TrackRenderer track={index.track} />);

    expect(getTrackLayout(index.track, { height: 192, width: 320 })).toEqual({
      aspectRatio: 5 / 3,
      unitsPerPixel: 0.3125,
      viewBox: '0 0 100 60',
    });
    expect(screen.getByTestId('track-svg')).toBeTruthy();
    expect(screen.getByTestId('track-centerline')).toBeTruthy();
    expect(screen.getByTestId('sector-marker-1')).toBeTruthy();
    expect(screen.getByTestId('sector-marker-2')).toBeTruthy();
    expect(screen.getByTestId('start-finish-marker')).toBeTruthy();
  });

  test('renders identifiable selected car dots', async () => {
    await render(
      <TrackRenderer
        drivers={drivers}
        onSelectDriver={() => undefined}
        positions={positions}
        selectedDriverId="driver-1"
        track={index.track}
      />,
    );

    expect(screen.getByTestId('car-hit-driver-1')).toHaveProp(
      'accessibilityState',
      { selected: true },
    );
    expect(screen.getByTestId('driver-list-driver-1')).toHaveProp(
      'accessibilityState',
      { disabled: false, selected: true },
    );
    expect(screen.getByTestId('car-number-driver-1')).toBeTruthy();
    expect(screen.getByTestId('car-number-driver-2')).toBeTruthy();
  });

  test('supports pointer, keyboard focus, and the driver-list fallback', async () => {
    const onSelectDriver = jest.fn();
    await render(
      <TrackRenderer
        drivers={drivers}
        onSelectDriver={onSelectDriver}
        positions={positions}
        track={index.track}
      />,
    );
    const car = screen.getByTestId('car-hit-driver-1');
    expect(car).toHaveProp('accessibilityLabel', 'Driver One, car 1');
    expect(car).toHaveProp('accessibilityRole', 'button');

    await fireEvent(car, 'focus');
    expect(screen.getByTestId('focus-ring')).toHaveStyle({
      borderColor: getTheme('light').colors.focusRing,
      borderWidth: focus.width,
    });
    await fireEvent.press(car, {
      nativeEvent: { locationX: 22, locationY: 22 },
    });
    expect(onSelectDriver).toHaveBeenLastCalledWith('driver-1');

    await fireEvent.press(screen.getByTestId('driver-list-driver-2'));
    expect(onSelectDriver).toHaveBeenLastCalledWith('driver-2');
  });

  test('marks unavailable drivers without creating a track hit target', async () => {
    const onSelectDriver = jest.fn();
    await render(
      <TrackRenderer
        drivers={drivers}
        onSelectDriver={onSelectDriver}
        positions={{ 'driver-1': positions['driver-1'] }}
        track={index.track}
      />,
    );

    expect(screen.queryByTestId('car-hit-driver-2')).toBeNull();
    expect(screen.getByTestId('driver-list-driver-2')).toHaveProp(
      'accessibilityState',
      { disabled: true, selected: false },
    );
    await fireEvent.press(screen.getByTestId('driver-list-driver-2'));
    expect(onSelectDriver).not.toHaveBeenCalled();
  });

  test('resolves crowded hits by distance and ignores missing cars', () => {
    const crowded = {
      'driver-1': { x: 50, y: 30 },
      'driver-2': { x: 52, y: 30 },
    };
    expect(
      resolveNearestDriverId(drivers, crowded, { x: 51.75, y: 30 }, 5),
    ).toBe('driver-2');
    expect(
      resolveNearestDriverId(
        drivers,
        { 'driver-1': crowded['driver-1'] },
        {
          x: 52,
          y: 30,
        },
      ),
    ).toBe('driver-1');
    expect(
      resolveNearestDriverId(drivers, {}, { x: 50, y: 30 }, 5),
    ).toBeUndefined();
  });

  test('chooses readable number colors for light and dark teams', () => {
    expect(getContrastingTextColor('#ffffff')).toBe('#000000');
    expect(getContrastingTextColor('#000000')).toBe('#ffffff');
  });

  test.each([
    ['mobile-light', 390, 'light'],
    ['mobile-dark', 390, 'dark'],
    ['desktop-light', 1024, 'light'],
    ['desktop-dark', 1024, 'dark'],
  ] as const)(
    'keeps the %s crowded layout complete',
    async (_, width, appearance) => {
      const crowdedDrivers: Driver[] = Array.from(
        { length: 8 },
        (__, item) => ({
          ...drivers[item % drivers.length],
          code: `D${item}`,
          driverNumber: item + 1,
          id: `driver-${item}`,
          name: `Driver ${item}`,
        }),
      );
      const crowdedPositions = Object.fromEntries(
        crowdedDrivers.map((driver, item) => [
          driver.id,
          { x: 45 + item, y: 27 + (item % 3) },
        ]),
      );
      const result = await render(
        <AppThemeProvider appearance={appearance}>
          <View style={{ width }}>
            <TrackRenderer
              drivers={crowdedDrivers}
              onSelectDriver={() => undefined}
              positions={crowdedPositions}
              selectedDriverId="driver-3"
              testID="crowded-track"
              track={index.track}
            />
          </View>
        </AppThemeProvider>,
      );

      expect(result.getAllByTestId(/^car-dot-/u)).toHaveLength(8);
      expect(result.getAllByTestId(/^car-hit-/u)).toHaveLength(8);
      expect(result.getAllByTestId(/^driver-list-/u)).toHaveLength(8);
      expect(result.getByTestId('crowded-track-map')).toHaveStyle({
        aspectRatio: 5 / 3,
      });
      expect(result.getByTestId('car-hit-driver-3')).toHaveProp(
        'accessibilityState',
        { selected: true },
      );
    },
  );
});
