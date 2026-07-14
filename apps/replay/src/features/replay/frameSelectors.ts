import type {
  FastestLap,
  LapTiming,
  Point,
  PositionSample,
  ReplayChunk,
  ReplayIndex,
  TelemetrySample,
} from '@f1/domain';

const positionMaxGapMs = 5000;
const telemetryMaxGapMs = 5000;

type TimedSample = { timeMs: number };

export type UnavailableReason =
  | 'after-data'
  | 'before-data'
  | 'gap'
  | 'missing';

export type SampleValue<T> =
  | {
      quality: 'held' | 'interpolated' | 'source';
      status: 'available';
      value: T;
    }
  | { reason: UnavailableReason; status: 'unavailable' };

export type PositionValue = SampleValue<Point>;

export type TelemetryFrame = {
  brakeApplied: SampleValue<boolean>;
  drs: SampleValue<number>;
  gear: SampleValue<number>;
  gForceQuality: SampleValue<TelemetrySample['gForceQuality']>;
  lateralG: SampleValue<number>;
  longitudinalG: SampleValue<number>;
  rpm: SampleValue<number>;
  speedKph: SampleValue<number>;
  throttlePercent: SampleValue<number>;
};

export type DriverTimingFrame = {
  bestLap: LapTiming | null;
  currentLap: LapTiming | null;
  currentSectorsMs: [number | null, number | null, number | null];
  lastLap: LapTiming | null;
};

export type ReplayFrameSource = {
  index: ReplayIndex;
  locationsByDriver: Record<string, PositionSample[]>;
  telemetryByDriver: Record<string, TelemetrySample[]>;
};

export type ReplayFrame = {
  overallFastestLap: FastestLap | null;
  positionsByDriver: Record<string, PositionValue>;
  telemetryByDriver: Record<string, TelemetryFrame>;
  timeMs: number;
  timingByDriver: Record<string, DriverTimingFrame>;
};

const unavailable = <T>(reason: UnavailableReason): SampleValue<T> => ({
  reason,
  status: 'unavailable',
});

export function lowerBoundByTime<T extends TimedSample>(
  samples: readonly T[],
  timeMs: number,
) {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timeMs < timeMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function sampleBounds<T extends TimedSample>(
  samples: readonly T[],
  timeMs: number,
) {
  const nextIndex = lowerBoundByTime(samples, timeMs);
  return {
    next: samples[nextIndex],
    previous: samples[nextIndex - 1],
  };
}

function mergeByDriver<T extends TimedSample>(
  chunks: readonly ReplayChunk[],
  select: (chunk: ReplayChunk) => Record<string, T[]>,
) {
  const merged: Record<string, Map<number, T>> = {};
  chunks.forEach((chunk) => {
    Object.entries(select(chunk)).forEach(([driverId, samples]) => {
      const byTime = merged[driverId] ?? new Map<number, T>();
      samples.forEach((sample) => byTime.set(sample.timeMs, sample));
      merged[driverId] = byTime;
    });
  });
  return Object.fromEntries(
    Object.entries(merged).map(([driverId, byTime]) => [
      driverId,
      [...byTime.values()].sort((left, right) => left.timeMs - right.timeMs),
    ]),
  );
}

export function createReplayFrameSource(
  index: ReplayIndex,
  chunks: readonly ReplayChunk[],
): ReplayFrameSource {
  return {
    index,
    locationsByDriver: mergeByDriver(
      chunks,
      (chunk) => chunk.locationsByDriver,
    ),
    telemetryByDriver: mergeByDriver(
      chunks,
      (chunk) => chunk.telemetryByDriver,
    ),
  };
}

function selectContinuous(
  samples: readonly TelemetrySample[],
  timeMs: number,
  read: (sample: TelemetrySample) => number | null,
): SampleValue<number> {
  const { next, previous } = sampleBounds(samples, timeMs);
  if (next?.timeMs === timeMs) {
    const value = read(next);
    return value === null
      ? unavailable('missing')
      : { quality: 'source', status: 'available', value };
  }
  if (!previous) return unavailable('before-data');
  if (!next) return unavailable('after-data');
  if (next.timeMs - previous.timeMs > telemetryMaxGapMs) {
    return unavailable('gap');
  }

  const start = read(previous);
  const end = read(next);
  if (start === null || end === null) return unavailable('missing');
  const progress = (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs);
  return {
    quality: 'interpolated',
    status: 'available',
    value: start + (end - start) * progress,
  };
}

function selectDiscrete<T>(
  samples: readonly TelemetrySample[],
  timeMs: number,
  read: (sample: TelemetrySample) => T | null,
): SampleValue<T> {
  const { next, previous } = sampleBounds(samples, timeMs);
  const sample = next?.timeMs === timeMs ? next : previous;
  if (!sample) return unavailable('before-data');
  if (timeMs - sample.timeMs > telemetryMaxGapMs) {
    return unavailable('after-data');
  }

  const value = read(sample);
  if (value === null) return unavailable('missing');
  return {
    quality: sample.timeMs === timeMs ? 'source' : 'held',
    status: 'available',
    value,
  };
}

export function selectPosition(
  source: ReplayFrameSource,
  driverId: string,
  timeMs: number,
): PositionValue {
  const samples = source.locationsByDriver[driverId] ?? [];
  const { next, previous } = sampleBounds(samples, timeMs);
  if (next?.timeMs === timeMs) {
    return {
      quality: next.quality,
      status: 'available',
      value: { x: next.x, y: next.y },
    };
  }
  if (!previous) return unavailable('before-data');
  if (!next) return unavailable('after-data');
  if (next.timeMs - previous.timeMs > positionMaxGapMs) {
    return unavailable('gap');
  }

  const progress = (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs);
  return {
    quality: 'interpolated',
    status: 'available',
    value: {
      x: previous.x + (next.x - previous.x) * progress,
      y: previous.y + (next.y - previous.y) * progress,
    },
  };
}

export function selectTelemetry(
  source: ReplayFrameSource,
  driverId: string,
  timeMs: number,
): TelemetryFrame {
  const samples = source.telemetryByDriver[driverId] ?? [];
  return {
    brakeApplied: selectDiscrete(
      samples,
      timeMs,
      (sample) => sample.brakeApplied,
    ),
    drs: selectDiscrete(samples, timeMs, (sample) => sample.drs),
    gear: selectDiscrete(samples, timeMs, (sample) => sample.gear),
    gForceQuality: selectDiscrete(
      samples,
      timeMs,
      (sample) => sample.gForceQuality,
    ),
    lateralG: selectContinuous(samples, timeMs, (sample) => sample.lateralG),
    longitudinalG: selectContinuous(
      samples,
      timeMs,
      (sample) => sample.longitudinalG,
    ),
    rpm: selectContinuous(samples, timeMs, (sample) => sample.rpm),
    speedKph: selectContinuous(samples, timeMs, (sample) => sample.speedKph),
    throttlePercent: selectContinuous(
      samples,
      timeMs,
      (sample) => sample.throttlePercent,
    ),
  };
}

function fastestCompletedLap(laps: readonly LapTiming[], timeMs: number) {
  return laps
    .filter(
      (lap) => lap.endMs <= timeMs && lap.isValid && lap.durationMs !== null,
    )
    .reduce<LapTiming | null>(
      (best, lap) =>
        !best || (lap.durationMs ?? Infinity) < (best.durationMs ?? Infinity)
          ? lap
          : best,
      null,
    );
}

function completedSectors(
  lap: LapTiming | null,
  timeMs: number,
): [number | null, number | null, number | null] {
  if (!lap) return [null, null, null];
  let canLocateSector = true;
  let elapsedMs = 0;
  return lap.sectorsMs.map((sectorMs) => {
    if (sectorMs === null || !canLocateSector) {
      canLocateSector = false;
      return null;
    }
    elapsedMs += sectorMs;
    return timeMs >= lap.startMs + elapsedMs ? sectorMs : null;
  }) as [number | null, number | null, number | null];
}

export function selectDriverTiming(
  index: ReplayIndex,
  driverId: string,
  timeMs: number,
): DriverTimingFrame {
  const laps = index.laps
    .filter((lap) => lap.driverId === driverId)
    .sort((left, right) => left.startMs - right.startMs);
  const completed = laps.filter((lap) => lap.endMs <= timeMs);
  const currentLap =
    laps.filter((lap) => lap.startMs <= timeMs && timeMs <= lap.endMs).at(-1) ??
    null;
  return {
    bestLap: fastestCompletedLap(laps, timeMs),
    currentLap,
    currentSectorsMs: completedSectors(currentLap, timeMs),
    lastLap: completed.at(-1) ?? null,
  };
}

export function selectOverallFastestLap(
  index: ReplayIndex,
  timeMs: number,
): FastestLap | null {
  const lap = fastestCompletedLap(index.laps, timeMs);
  if (!lap || lap.durationMs === null) return null;
  return {
    driverId: lap.driverId,
    durationMs: lap.durationMs,
    lapNumber: lap.lapNumber,
  };
}

export function selectReplayFrame(
  source: ReplayFrameSource,
  requestedTimeMs: number,
): ReplayFrame {
  const { index } = source;
  const timeMs = Math.min(
    Math.max(requestedTimeMs, index.timeline.startMs),
    index.timeline.endMs,
  );
  const driverEntries = index.drivers.map(({ id }) => [id, id] as const);
  return {
    overallFastestLap: selectOverallFastestLap(index, timeMs),
    positionsByDriver: Object.fromEntries(
      driverEntries.map(([driverId]) => [
        driverId,
        selectPosition(source, driverId, timeMs),
      ]),
    ),
    telemetryByDriver: Object.fromEntries(
      driverEntries.map(([driverId]) => [
        driverId,
        selectTelemetry(source, driverId, timeMs),
      ]),
    ),
    timeMs,
    timingByDriver: Object.fromEntries(
      driverEntries.map(([driverId]) => [
        driverId,
        selectDriverTiming(index, driverId, timeMs),
      ]),
    ),
  };
}
