import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  HapticTextureDefinition,
  TelemetryHapticUpdate,
} from './F1Haptics.types';

declare class F1HapticsModule extends NativeModule {
  isSupported(): boolean;

  playPattern(pattern: HapticTextureDefinition): Promise<void>;

  startTelemetry(): Promise<void>;

  stop(): Promise<void>;

  stopTelemetry(): Promise<void>;

  updateTelemetry(update: TelemetryHapticUpdate): Promise<void>;
}

export const F1Haptics =
  requireOptionalNativeModule<F1HapticsModule>('F1Haptics');
