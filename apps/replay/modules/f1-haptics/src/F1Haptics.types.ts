export type HapticTextureEvent = {
  durationMs?: number;
  intensity: number;
  sharpness: number;
  startMs: number;
  type: 'continuous' | 'transient';
};

export type HapticTextureDefinition = {
  events: HapticTextureEvent[];
  id: string;
};

export type TelemetryHapticDirection = 'center' | 'left' | 'right';

export type TelemetryHapticUpdate = {
  engineIntensity: number;
  enginePlaybackRate: number;
  engineSharpness: number;
  impactIntensity: number;
  impactIntervalMs: number;
  turnDirection: TelemetryHapticDirection;
};
