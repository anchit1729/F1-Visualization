import type { Driver, LapTiming } from '@f1/domain';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';
import { fireEvent, render, screen } from '@testing-library/react-native';

import DriverInspector, {
  formatLapTime,
  inspectorPresentationForWidth,
} from '../src/components/replay/DriverInspector';
import type {
  DriverTimingFrame,
  SampleValue,
  TelemetryFrame,
} from '../src/features/replay/frameSelectors';

const drivers = indexFixture.drivers as Driver[];
const lap = indexFixture.laps[0] as LapTiming;

function available<T>(value: T): SampleValue<T> {
  return { quality: 'source', status: 'available', value };
}

function missing<T>(): SampleValue<T> {
  return { reason: 'missing', status: 'unavailable' };
}

const telemetry: TelemetryFrame = {
  brakeApplied: available(true),
  drs: available(10),
  gear: available(7),
  gForceQuality: available('estimated'),
  lateralG: available(1.12),
  longitudinalG: available(-0.35),
  rpm: available(11000),
  speedKph: available(220),
  throttlePercent: available(84),
};

const timing: DriverTimingFrame = {
  bestLap: lap,
  currentLap: lap,
  currentSectorsMs: [3000, 3500, null],
  lastLap: lap,
};

const props = {
  driver: drivers[0],
  drivers,
  onClose: jest.fn(),
  overallFastestLap: {
    driverId: drivers[0].id,
    durationMs: 10000,
    lapNumber: 1,
  },
  presentation: 'side' as const,
  telemetry,
  timing,
};

function InspectorFixture({
  fastestLap = props.overallFastestLap,
  presentationValue = props.presentation,
  telemetryValue = telemetry,
  timingValue = timing,
}: {
  fastestLap?: typeof props.overallFastestLap;
  presentationValue?: 'bottom' | 'side';
  telemetryValue?: TelemetryFrame;
  timingValue?: DriverTimingFrame;
}) {
  return (
    <DriverInspector
      driver={props.driver}
      drivers={props.drivers}
      onClose={props.onClose}
      overallFastestLap={fastestLap}
      presentation={presentationValue}
      telemetry={telemetryValue}
      timing={timingValue}
    />
  );
}

beforeEach(() => props.onClose.mockClear());

describe('driver inspector', () => {
  test('formats timing values and selects the responsive presentation', () => {
    expect(formatLapTime(90415)).toBe('1:30.415');
    expect(formatLapTime(null)).toBe('Unavailable');
    expect(inspectorPresentationForWidth(799)).toBe('bottom');
    expect(inspectorPresentationForWidth(800)).toBe('side');
  });

  test('shows sourced telemetry, estimated g-force, and timing context', async () => {
    await render(<InspectorFixture />);

    expect(screen.getByRole('header', { name: '1 · ONE' })).toBeTruthy();
    expect(screen.getByText('220 km/h')).toBeTruthy();
    expect(screen.getByText('84%')).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();
    expect(screen.getByText('11,000')).toBeTruthy();
    expect(screen.getByText('-0.35 g')).toBeTruthy();
    expect(screen.getByText('1.12 g')).toBeTruthy();
    expect(screen.getByText('0:10.000 · Overall fastest')).toBeTruthy();
    expect(screen.getByText('0:10.000 · ONE')).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Close driver details' }),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test('uses a modal bottom sheet on narrow layouts', async () => {
    await render(<InspectorFixture presentationValue="bottom" />);

    expect(screen.getByTestId('driver-inspector')).toHaveStyle({
      maxHeight: '82%',
      width: '100%',
    });
  });

  test('updates live values and labels genuinely unavailable data', async () => {
    const result = await render(<InspectorFixture />);
    expect(screen.getByText('220 km/h')).toBeTruthy();

    await result.rerender(
      <InspectorFixture
        telemetryValue={{
          brakeApplied: missing(),
          drs: missing(),
          gear: missing(),
          gForceQuality: available('unavailable'),
          lateralG: available(4),
          longitudinalG: available(3),
          rpm: missing(),
          speedKph: available(221),
          throttlePercent: missing(),
        }}
        timingValue={{
          bestLap: null,
          currentLap: null,
          currentSectorsMs: [null, null, null],
          lastLap: null,
        }}
      />,
    );

    expect(screen.getByText('221 km/h')).toBeTruthy();
    expect(screen.queryByText('3.00 g')).toBeNull();
    expect(screen.queryByText('4.00 g')).toBeNull();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(5);
  });

  test('shows the personal-best delta when another car is faster', async () => {
    await render(
      <InspectorFixture
        fastestLap={{
          driverId: drivers[1].id,
          durationMs: 9000,
          lapNumber: 1,
        }}
      />,
    );

    expect(screen.getByText('0:10.000 · +1.000')).toBeTruthy();
    expect(screen.getByText('0:09.000 · TWO')).toBeTruthy();
  });
});
