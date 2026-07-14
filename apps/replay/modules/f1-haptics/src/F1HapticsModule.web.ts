import type {
  HapticTextureDefinition,
  TelemetryHapticUpdate,
} from './F1Haptics.types';

export const F1Haptics = {
  isSupported: () => false,
  playPattern: (_pattern: HapticTextureDefinition) => Promise.resolve(),
  startTelemetry: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  stopTelemetry: () => Promise.resolve(),
  updateTelemetry: (_update: TelemetryHapticUpdate) => Promise.resolve(),
};
