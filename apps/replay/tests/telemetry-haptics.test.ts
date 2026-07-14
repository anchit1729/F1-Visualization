import type { TelemetryFrame } from '../src/features/replay/frameSelectors';
import {
  mapTelemetryToHaptics,
  telemetryHapticInputFromFrame,
} from '../src/features/feedback/telemetryHaptics';

const available = <T>(value: T) =>
  ({ quality: 'source', status: 'available', value }) as const;
const unavailable = { reason: 'missing', status: 'unavailable' } as const;

describe('telemetry haptic mapping', () => {
  test('uses RPM for cadence and throttle for engine load', () => {
    const lowRpm = mapTelemetryToHaptics({
      brakeApplied: false,
      lateralG: 0,
      longitudinalG: 0,
      rpm: 4_000,
      throttlePercent: 60,
    });
    const highRpm = mapTelemetryToHaptics({
      brakeApplied: false,
      lateralG: 0,
      longitudinalG: 0.4,
      rpm: 13_000,
      throttlePercent: 60,
    });
    const highLoad = mapTelemetryToHaptics({
      brakeApplied: false,
      lateralG: 0,
      longitudinalG: 0.4,
      rpm: 13_000,
      throttlePercent: 100,
    });

    expect(highRpm.enginePlaybackRate).toBeGreaterThan(
      lowRpm.enginePlaybackRate,
    );
    expect(highRpm.engineSharpness).toBeGreaterThan(lowRpm.engineSharpness);
    expect(highLoad.engineIntensity).toBeGreaterThan(highRpm.engineIntensity);
    expect(highLoad.engineIntensity).toBeLessThanOrEqual(0.62);
  });

  test.each([
    [-2, 'right'],
    [0, 'center'],
    [2, 'left'],
  ] as const)('maps lateral g %s to %s emphasis', (lateralG, direction) => {
    expect(
      mapTelemetryToHaptics({
        brakeApplied: false,
        lateralG,
        longitudinalG: 0,
        rpm: 9_000,
        throttlePercent: 50,
      }).turnDirection,
    ).toBe(direction);
  });

  test('raises impact strength and pulse rate under braking load', () => {
    const coasting = mapTelemetryToHaptics({
      brakeApplied: false,
      lateralG: 0,
      longitudinalG: 0,
      rpm: 10_000,
      throttlePercent: 40,
    });
    const braking = mapTelemetryToHaptics({
      brakeApplied: true,
      lateralG: 2.5,
      longitudinalG: -4,
      rpm: 10_000,
      throttlePercent: 0,
    });

    expect(coasting.impactIntensity).toBe(0);
    expect(braking.impactIntensity).toBeGreaterThan(0.5);
    expect(braking.impactIntervalMs).toBeLessThan(coasting.impactIntervalMs);
    expect(braking.engineIntensity).toBeGreaterThan(0.2);
  });

  test('suppresses unavailable g-force and reduces low-quality estimates', () => {
    const frame = {
      brakeApplied: available(false),
      gForceQuality: available('low'),
      lateralG: available(4),
      longitudinalG: available(-2),
      rpm: available(11_000),
      throttlePercent: available(60),
    } as TelemetryFrame;

    expect(telemetryHapticInputFromFrame(frame)).toEqual({
      brakeApplied: false,
      lateralG: 2,
      longitudinalG: -1,
      rpm: 11_000,
      throttlePercent: 60,
    });

    expect(
      telemetryHapticInputFromFrame({
        ...frame,
        gForceQuality: available('unavailable'),
        lateralG: unavailable,
        longitudinalG: unavailable,
      }),
    ).toEqual(expect.objectContaining({ lateralG: null, longitudinalG: null }));
  });

  test('clamps malformed numeric input to safe output ranges', () => {
    const mapped = mapTelemetryToHaptics({
      brakeApplied: true,
      lateralG: Number.NaN,
      longitudinalG: Number.NEGATIVE_INFINITY,
      rpm: Number.POSITIVE_INFINITY,
      throttlePercent: 500,
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        turnDirection: 'center',
      }),
    );
    expect(mapped.engineIntensity).toBeLessThanOrEqual(0.62);
    expect(mapped.engineSharpness).toBeLessThanOrEqual(1);
    expect(mapped.impactIntensity).toBeLessThanOrEqual(0.78);
  });
});
