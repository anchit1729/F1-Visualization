import type {
  TelemetryHapticDirection,
  TelemetryHapticUpdate,
} from '../../../modules/f1-haptics';
import type { SampleValue, TelemetryFrame } from '../replay/frameSelectors';

export type TelemetryHapticInput = {
  brakeApplied: boolean;
  lateralG: number | null;
  longitudinalG: number | null;
  rpm: number | null;
  throttlePercent: number | null;
};

const idleRpm = 4_000;
const redlineRpm = 13_000;

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(Math.max(value, minimum), maximum);

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;

function smoothstep(edge: number, value: number) {
  const normalized = clamp((value - edge) / (1 - edge));
  return normalized * normalized * (3 - 2 * normalized);
}

function directionFromLateralG(lateralG: number): TelemetryHapticDirection {
  if (Math.abs(lateralG) < 0.35) return 'center';
  // Ingestion derives positive lateral g from counter-clockwise (left) yaw.
  return lateralG > 0 ? 'left' : 'right';
}

export function mapTelemetryToHaptics({
  brakeApplied,
  lateralG,
  longitudinalG,
  rpm,
  throttlePercent,
}: TelemetryHapticInput): TelemetryHapticUpdate {
  const throttle = clamp((throttlePercent ?? 0) / 100);
  const hasRpm = rpm !== null && Number.isFinite(rpm) && rpm > 0;
  const rpmNormalized = hasRpm
    ? clamp(((rpm ?? idleRpm) - idleRpm) / (redlineRpm - idleRpm))
    : throttle;
  const engineBody = hasRpm
    ? 0.11 + 0.17 * rpmNormalized
    : 0.08 + 0.12 * throttle;
  const brakingEngineFloor = brakeApplied ? 0.18 + 0.12 * rpmNormalized : 0;

  const safeLateralG = Number.isFinite(lateralG) ? (lateralG ?? 0) : 0;
  const safeLongitudinalG = Number.isFinite(longitudinalG)
    ? (longitudinalG ?? 0)
    : 0;
  const brakingG = clamp(Math.max(0, -safeLongitudinalG) / 4.5);
  const corneringG = clamp(Math.abs(safeLateralG) / 5);
  const brakingLoad = 0.65 * Number(brakeApplied) + 0.35 * brakingG;
  const impact = smoothstep(0.35, Math.max(brakingLoad, 0.8 * corneringG));

  return {
    engineIntensity: clamp(
      Math.max(engineBody + 0.28 * throttle ** 1.2, brakingEngineFloor),
      0,
      0.62,
    ),
    enginePlaybackRate: lerp(0.55, 1.85, rpmNormalized),
    engineSharpness: clamp(0.08 + 0.42 * rpmNormalized),
    impactIntensity: 0.78 * impact,
    impactIntervalMs: lerp(180, 55, impact),
    turnDirection: directionFromLateralG(safeLateralG),
  };
}

function availableValue<T>(sample: SampleValue<T>) {
  return sample.status === 'available' ? sample.value : null;
}

function gForceConfidence(quality: TelemetryFrame['gForceQuality']) {
  const value = availableValue(quality);
  if (value === 'estimated') return 1;
  if (value === 'low') return 0.5;
  return 0;
}

export function telemetryHapticInputFromFrame(
  frame: TelemetryFrame,
): TelemetryHapticInput {
  const confidence = gForceConfidence(frame.gForceQuality);
  const lateralG = availableValue(frame.lateralG);
  const longitudinalG = availableValue(frame.longitudinalG);

  return {
    brakeApplied: availableValue(frame.brakeApplied) ?? false,
    lateralG: lateralG === null ? null : lateralG * confidence,
    longitudinalG: longitudinalG === null ? null : longitudinalG * confidence,
    rpm: availableValue(frame.rpm),
    throttlePercent: availableValue(frame.throttlePercent),
  };
}
