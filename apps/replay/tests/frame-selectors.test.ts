import type { ReplayChunk, ReplayIndex } from '@f1/domain';
import firstChunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00000.json';
import secondChunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00001.json';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';

import {
  createReplayFrameSource,
  lowerBoundByTime,
  selectDriverTiming,
  selectOverallFastestLap,
  selectPosition,
  selectReplayFrame,
  selectTelemetry,
} from '../src/features/replay/frameSelectors';

const index = indexFixture as ReplayIndex;
const chunks = [firstChunkFixture, secondChunkFixture] as ReplayChunk[];
const source = createReplayFrameSource(index, chunks);

function valueOf<T>(result: { status: string; value?: T }) {
  expect(result.status).toBe('available');
  return result.value as T;
}

describe('frame selectors', () => {
  test('finds exact and insertion indexes with binary search', () => {
    const samples = source.locationsByDriver['driver-1'];
    expect(lowerBoundByTime(samples, 0)).toBe(0);
    expect(lowerBoundByTime(samples, 2500)).toBe(1);
    expect(lowerBoundByTime(samples, 3000)).toBe(2);
    expect(lowerBoundByTime(samples, 11000)).toBe(samples.length);
  });

  test('deduplicates chunk overlap and preserves exact samples', () => {
    expect(source.locationsByDriver['driver-1']).toHaveLength(5);
    expect(selectPosition(source, 'driver-1', 5000)).toEqual({
      quality: 'source',
      status: 'available',
      value: { x: 90, y: 30 },
    });
  });

  test('interpolates continuous channels and holds discrete channels', () => {
    const position = selectPosition(source, 'driver-1', 1250);
    const telemetry = selectTelemetry(source, 'driver-1', 2500);

    expect(valueOf(position)).toEqual({ x: 30, y: 20 });
    expect(position).toMatchObject({ quality: 'interpolated' });
    expect(valueOf(telemetry.speedKph)).toBe(160);
    expect(valueOf(telemetry.throttlePercent)).toBe(80);
    expect(valueOf(telemetry.rpm)).toBe(9500);
    expect(telemetry.gear).toEqual({
      quality: 'held',
      status: 'available',
      value: 4,
    });
    expect(valueOf(telemetry.brakeApplied)).toBe(false);
  });

  test('reports missing, before-data, after-data, and excessive gaps', () => {
    expect(selectPosition(source, 'driver-2', 0)).toEqual({
      reason: 'before-data',
      status: 'unavailable',
    });
    expect(selectTelemetry(source, 'driver-2', 500).throttlePercent).toEqual({
      reason: 'missing',
      status: 'unavailable',
    });

    const firstChunkOnly = createReplayFrameSource(index, [chunks[0]]);
    expect(selectPosition(firstChunkOnly, 'driver-1', 6000)).toEqual({
      reason: 'after-data',
      status: 'unavailable',
    });

    const sparseChunks = structuredClone(chunks);
    sparseChunks[0].locationsByDriver['driver-1'] = [
      sparseChunks[0].locationsByDriver['driver-1'][0],
    ];
    sparseChunks[1].locationsByDriver['driver-1'] = [
      sparseChunks[1].locationsByDriver['driver-1'].at(-1)!,
    ];
    const sparseSource = createReplayFrameSource(index, sparseChunks);
    expect(selectPosition(sparseSource, 'driver-1', 5000)).toEqual({
      reason: 'gap',
      status: 'unavailable',
    });
  });

  test('selects lap, sector, and fastest timing only when available', () => {
    expect(selectDriverTiming(index, 'driver-1', 2999)).toMatchObject({
      bestLap: null,
      currentSectorsMs: [null, null, null],
      lastLap: null,
    });
    expect(selectDriverTiming(index, 'driver-1', 6500)).toMatchObject({
      currentSectorsMs: [3000, 3500, null],
    });
    expect(selectDriverTiming(index, 'driver-1', 10000)).toMatchObject({
      bestLap: { durationMs: 10000 },
      currentSectorsMs: [3000, 3500, 3500],
      lastLap: { lapNumber: 1 },
    });
    expect(selectDriverTiming(index, 'driver-2', 10000)).toMatchObject({
      currentSectorsMs: [3200, null, null],
    });
    expect(selectOverallFastestLap(index, 9999)).toBeNull();
    expect(selectOverallFastestLap(index, 10000)).toEqual(
      index.overallFastestLap,
    );
  });

  test('updates overall fastest lap as valid laps complete', () => {
    const changingIndex: ReplayIndex = {
      ...index,
      laps: [
        {
          ...index.laps[0],
          durationMs: 4000,
          endMs: 4000,
          sectorsMs: [1000, 1500, 1500],
        },
        {
          ...index.laps[0],
          driverId: 'driver-2',
          durationMs: 3500,
          endMs: 6000,
          sectorsMs: [1000, 1000, 1500],
        },
      ],
    };

    expect(selectOverallFastestLap(changingIndex, 5000)).toMatchObject({
      driverId: 'driver-1',
      durationMs: 4000,
    });
    expect(selectOverallFastestLap(changingIndex, 6000)).toMatchObject({
      driverId: 'driver-2',
      durationMs: 3500,
    });
  });

  test('matches the enumerated tiny frame at every second', () => {
    const expectedX = [10, 26, 42, 58, 74, 90, 74, 58, 42, 26, 10];
    const expectedY = [30, 22, 14, 14, 22, 30, 38, 46, 46, 38, 30];
    const expectedSpeed = [
      100, 124, 148, 172, 196, 220, 197, 174, 151, 128, 105,
    ];

    expectedX.forEach((x, second) => {
      const frame = selectReplayFrame(source, second * 1000);
      expect(valueOf(frame.positionsByDriver['driver-1'])).toEqual({
        x,
        y: expectedY[second],
      });
      expect(valueOf(frame.telemetryByDriver['driver-1'].speedKph)).toBe(
        expectedSpeed[second],
      );
    });
  });

  test('keeps randomized frames clamped, bounded, and immutable', () => {
    const before = JSON.stringify(chunks);
    let seed = 2026;
    Array.from({ length: 100 }).forEach(() => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const requestedTimeMs = (seed / 4294967296) * 14000 - 2000;
      const frame = selectReplayFrame(source, requestedTimeMs);
      expect(frame.timeMs).toBeGreaterThanOrEqual(0);
      expect(frame.timeMs).toBeLessThanOrEqual(10000);
      const position = frame.positionsByDriver['driver-1'];
      if (position.status === 'available') {
        expect(position.value.x).toBeGreaterThanOrEqual(10);
        expect(position.value.x).toBeLessThanOrEqual(90);
        expect(position.value.y).toBeGreaterThanOrEqual(10);
        expect(position.value.y).toBeLessThanOrEqual(50);
      }
    });
    expect(JSON.stringify(chunks)).toBe(before);
  });
});
