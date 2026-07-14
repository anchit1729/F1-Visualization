import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';
import firstChunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00000.json';
import secondChunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00001.json';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';
import {
  catalogSchema,
  replayChunkSchema,
  replayIndexSchema,
} from '@f1/domain';

describe('replay contracts', () => {
  test('accepts the complete tiny fixture', () => {
    expect(catalogSchema.safeParse(catalogFixture).success).toBe(true);
    expect(replayIndexSchema.safeParse(indexFixture).success).toBe(true);
    expect(replayChunkSchema.safeParse(firstChunkFixture).success).toBe(true);
    expect(replayChunkSchema.safeParse(secondChunkFixture).success).toBe(true);
  });

  test('preserves the chunk overlap and intentional missing telemetry', () => {
    const firstBoundary =
      firstChunkFixture.locationsByDriver['driver-1'].at(-1);
    const secondBoundary = secondChunkFixture.locationsByDriver['driver-1'][0];
    const missingTelemetry = firstChunkFixture.telemetryByDriver['driver-2'][0];

    expect(firstBoundary?.timeMs).toBe(5000);
    expect(secondBoundary?.timeMs).toBe(5000);
    expect(missingTelemetry?.throttlePercent).toBeNull();
    expect(missingTelemetry?.gForceQuality).toBe('unavailable');
  });

  test('rejects an unknown schema version', () => {
    const catalog = structuredClone(catalogFixture);
    catalog.schemaVersion = 2;

    expect(catalogSchema.safeParse(catalog).success).toBe(false);
  });

  test('rejects samples with bad time ordering', () => {
    const chunk = structuredClone(firstChunkFixture);
    chunk.locationsByDriver['driver-1'][1].timeMs = 0;

    expect(replayChunkSchema.safeParse(chunk).success).toBe(false);
  });

  test('rejects invalid telemetry percentages', () => {
    const chunk = structuredClone(firstChunkFixture);
    chunk.telemetryByDriver['driver-1'][0].throttlePercent = 101;

    expect(replayChunkSchema.safeParse(chunk).success).toBe(false);
  });

  test('rejects duplicate driver IDs', () => {
    const index = structuredClone(indexFixture);
    index.drivers[1].id = index.drivers[0].id;

    expect(replayIndexSchema.safeParse(index).success).toBe(false);
  });

  test('rejects laps that reference an unknown driver', () => {
    const index = structuredClone(indexFixture);
    index.laps[0].driverId = 'missing-driver';

    expect(replayIndexSchema.safeParse(index).success).toBe(false);
  });

  test('rejects non-finite coordinates', () => {
    const chunk = structuredClone(firstChunkFixture);
    chunk.locationsByDriver['driver-1'][0].x = Number.POSITIVE_INFINITY;

    expect(replayChunkSchema.safeParse(chunk).success).toBe(false);
  });

  test('rejects a chunk outside the replay timeline', () => {
    const index = structuredClone(indexFixture);
    index.chunks[1].endMs = 10001;

    expect(replayIndexSchema.safeParse(index).success).toBe(false);
  });
});
