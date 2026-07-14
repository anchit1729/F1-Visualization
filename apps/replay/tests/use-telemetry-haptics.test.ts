import { act, renderHook } from '@testing-library/react-native';

import type { TelemetryFrame } from '../src/features/replay/frameSelectors';
import useTelemetryHaptics from '../src/features/feedback/useTelemetryHaptics';

jest.mock('../src/theme/useAccessibilityPreferences', () => ({
  useAccessibilityPreferences: () => ({ isReduceMotionEnabled: false }),
}));

const available = <T>(value: T) =>
  ({ quality: 'source', status: 'available', value }) as const;

const telemetry = {
  brakeApplied: available(false),
  gear: available(4),
  gForceQuality: available('estimated'),
  lateralG: available(-2),
  longitudinalG: available(-1),
  rpm: available(10_500),
  throttlePercent: available(70),
} as TelemetryFrame;

function makeNativeModule(isSupported = true) {
  return {
    isSupported: jest.fn(() => isSupported),
    startTelemetry: jest.fn(() => Promise.resolve()),
    stopTelemetry: jest.fn(() => Promise.resolve()),
    updateTelemetry: jest.fn(() => Promise.resolve()),
  };
}

describe('telemetry haptic lifecycle', () => {
  afterEach(() => jest.restoreAllMocks());

  test('starts, samples updates at 20 Hz, and stops with playback', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const nativeModule = makeNativeModule();
    const hook = await renderHook<
      void,
      { frame: TelemetryFrame; isPlaying: boolean }
    >(
      ({ frame, isPlaying }) =>
        useTelemetryHaptics(frame, isPlaying, nativeModule),
      { initialProps: { frame: telemetry, isPlaying: true } },
    );

    await act(() => Promise.resolve());
    expect(nativeModule.startTelemetry).toHaveBeenCalledTimes(1);
    expect(nativeModule.updateTelemetry).toHaveBeenCalledTimes(1);

    now += 25;
    await hook.rerender({ frame: { ...telemetry }, isPlaying: true });
    expect(nativeModule.updateTelemetry).toHaveBeenCalledTimes(1);

    now += 25;
    await hook.rerender({ frame: { ...telemetry }, isPlaying: true });
    expect(nativeModule.updateTelemetry).toHaveBeenCalledTimes(2);

    await hook.rerender({ frame: telemetry, isPlaying: false });
    expect(nativeModule.stopTelemetry).toHaveBeenCalledTimes(1);
  });

  test('does nothing when custom haptics are unsupported', async () => {
    const nativeModule = makeNativeModule(false);
    await renderHook(() => useTelemetryHaptics(telemetry, true, nativeModule));
    await act(() => Promise.resolve());

    expect(nativeModule.startTelemetry).not.toHaveBeenCalled();
    expect(nativeModule.updateTelemetry).not.toHaveBeenCalled();
  });
});
