import { useEffect, useMemo, useRef } from 'react';

import { F1Haptics } from '../../../modules/f1-haptics';
import type { TelemetryFrame } from '../replay/frameSelectors';
import { useAccessibilityPreferences } from '../../theme/useAccessibilityPreferences';
import {
  mapTelemetryToHaptics,
  telemetryHapticInputFromFrame,
} from './telemetryHaptics';

type TelemetryHapticsModule = Pick<
  NonNullable<typeof F1Haptics>,
  'isSupported' | 'startTelemetry' | 'stopTelemetry' | 'updateTelemetry'
>;

const updateIntervalMs = 50;

export default function useTelemetryHaptics(
  telemetry: TelemetryFrame | undefined,
  isPlaying: boolean,
  nativeModule: TelemetryHapticsModule | null = F1Haptics,
) {
  const { isReduceMotionEnabled } = useAccessibilityPreferences();
  const latestUpdate = useRef(
    telemetry
      ? mapTelemetryToHaptics(telemetryHapticInputFromFrame(telemetry))
      : null,
  );
  const isStarted = useRef(false);
  const lastUpdateAt = useRef(-Infinity);
  const isSupported = useMemo(() => {
    try {
      return nativeModule?.isSupported() ?? false;
    } catch {
      return false;
    }
  }, [nativeModule]);
  const isEnabled = Boolean(
    telemetry && isPlaying && isSupported && !isReduceMotionEnabled,
  );

  latestUpdate.current = telemetry
    ? mapTelemetryToHaptics(telemetryHapticInputFromFrame(telemetry))
    : null;

  useEffect(() => {
    if (!isEnabled || !nativeModule) return undefined;
    let isActive = true;
    nativeModule
      .startTelemetry()
      .then(() => {
        if (!isActive) return nativeModule.stopTelemetry();
        isStarted.current = true;
        lastUpdateAt.current = Date.now();
        const update = latestUpdate.current;
        return update ? nativeModule.updateTelemetry(update) : undefined;
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
      isStarted.current = false;
      lastUpdateAt.current = -Infinity;
      nativeModule.stopTelemetry().catch(() => undefined);
    };
  }, [isEnabled, nativeModule]);

  useEffect(() => {
    if (!isEnabled || !isStarted.current || !nativeModule) return;
    const now = Date.now();
    if (now - lastUpdateAt.current < updateIntervalMs) return;
    lastUpdateAt.current = now;
    const update = latestUpdate.current;
    if (update) nativeModule.updateTelemetry(update).catch(() => undefined);
  }, [isEnabled, nativeModule, telemetry]);
}
