import { z } from 'zod';

export const replaySchemaVersion = 1 as const;

const finiteNumberSchema = z.number().finite();
const millisecondsSchema = z.number().int().nonnegative();
const nullableMillisecondsSchema = millisecondsSchema.nullable();
const qualitySchema = z.enum(['unavailable', 'low', 'estimated']);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export const pointSchema = z
  .object({
    x: finiteNumberSchema,
    y: finiteNumberSchema,
  })
  .strict();

export const trackGeometrySchema = z
  .object({
    viewBox: z.tuple([
      finiteNumberSchema,
      finiteNumberSchema,
      finiteNumberSchema.positive(),
      finiteNumberSchema.positive(),
    ]),
    centerline: z.array(pointSchema).min(2),
    startFinish: pointSchema,
    sectorBoundaries: z.array(pointSchema).max(2),
  })
  .strict();

export const driverSchema = z
  .object({
    id: z.string().min(1),
    driverNumber: z.number().int().min(1).max(99),
    code: z.string().min(2).max(4),
    name: z.string().min(1),
    teamName: z.string().min(1),
    teamColor: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  })
  .strict();

export const lapTimingSchema = z
  .object({
    driverId: z.string().min(1),
    lapNumber: z.number().int().positive(),
    startMs: millisecondsSchema,
    endMs: millisecondsSchema,
    durationMs: nullableMillisecondsSchema,
    sectorsMs: z.tuple([
      nullableMillisecondsSchema,
      nullableMillisecondsSchema,
      nullableMillisecondsSchema,
    ]),
    isPitOutLap: z.boolean(),
    isValid: z.boolean(),
  })
  .strict()
  .refine((lap) => lap.endMs > lap.startMs, {
    message: 'Lap end must be after its start',
    path: ['endMs'],
  });

export const fastestLapSchema = z
  .object({
    driverId: z.string().min(1),
    lapNumber: z.number().int().positive(),
    durationMs: millisecondsSchema,
  })
  .strict();

export const provenanceSchema = z
  .object({
    provider: z.string().min(1),
    sourceUrl: z.url(),
    retrievedAtUtc: z.iso.datetime({ offset: true }),
    sourceHash: sha256Schema,
    transformationVersion: z.string().min(1),
  })
  .strict();

export const dataQualitySchema = z
  .object({
    warnings: z.array(z.string()),
    excludedLocationSamplePercentage: finiteNumberSchema.min(0).max(100),
    derivedGForce: qualitySchema,
  })
  .strict();

export const chunkDescriptorSchema = z
  .object({
    startMs: millisecondsSchema,
    endMs: millisecondsSchema,
    url: z.string().min(1),
    byteSize: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict()
  .refine((chunk) => chunk.endMs > chunk.startMs, {
    message: 'Chunk end must be after its start',
    path: ['endMs'],
  });

export const positionSampleSchema = z
  .object({
    timeMs: millisecondsSchema,
    x: finiteNumberSchema,
    y: finiteNumberSchema,
    quality: z.enum(['source', 'interpolated']),
  })
  .strict();

export const telemetrySampleSchema = z
  .object({
    timeMs: millisecondsSchema,
    speedKph: finiteNumberSchema.nonnegative().nullable(),
    throttlePercent: finiteNumberSchema.min(0).max(100).nullable(),
    brakeApplied: z.boolean().nullable(),
    rpm: z.number().int().nonnegative().nullable(),
    gear: z.number().int().min(0).max(8).nullable(),
    drs: z.number().int().nonnegative().nullable(),
    longitudinalG: finiteNumberSchema.nullable(),
    lateralG: finiteNumberSchema.nullable(),
    gForceQuality: qualitySchema,
    sourceGapMs: nullableMillisecondsSchema.optional(),
  })
  .strict();

const timelineSchema = z
  .object({
    startMs: millisecondsSchema,
    endMs: millisecondsSchema,
    chunkDurationMs: millisecondsSchema.positive(),
  })
  .strict()
  .refine((timeline) => timeline.endMs > timeline.startMs, {
    message: 'Timeline end must be after its start',
    path: ['endMs'],
  });

export const replayIndexSchema = z
  .object({
    id: z.string().min(1),
    schemaVersion: z.literal(replaySchemaVersion),
    sessionStartUtc: z.iso.datetime({ offset: true }),
    timeline: timelineSchema,
    track: trackGeometrySchema,
    drivers: z.array(driverSchema).min(1),
    laps: z.array(lapTimingSchema),
    overallFastestLap: fastestLapSchema.nullable(),
    chunks: z.array(chunkDescriptorSchema).min(1),
    dataQuality: dataQualitySchema,
    provenance: z.array(provenanceSchema).min(1),
  })
  .strict()
  .superRefine((index, context) => {
    const driverIds = new Set(index.drivers.map((driver) => driver.id));
    if (driverIds.size !== index.drivers.length) {
      context.addIssue({
        code: 'custom',
        message: 'Driver IDs must be unique',
        path: ['drivers'],
      });
    }

    index.laps.forEach((lap, lapIndex) => {
      if (!driverIds.has(lap.driverId)) {
        context.addIssue({
          code: 'custom',
          message: 'Lap references an unknown driver',
          path: ['laps', lapIndex, 'driverId'],
        });
      }

      if (
        lap.startMs < index.timeline.startMs ||
        lap.endMs > index.timeline.endMs
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Lap is outside the replay timeline',
          path: ['laps', lapIndex],
        });
      }
    });

    if (
      index.overallFastestLap &&
      !driverIds.has(index.overallFastestLap.driverId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Fastest lap references an unknown driver',
        path: ['overallFastestLap', 'driverId'],
      });
    }

    index.chunks.forEach((chunk, chunkIndex) => {
      if (
        chunk.startMs < index.timeline.startMs ||
        chunk.endMs > index.timeline.endMs
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Chunk is outside the replay timeline',
          path: ['chunks', chunkIndex],
        });
      }

      const previous = index.chunks[chunkIndex - 1];
      if (previous && chunk.startMs < previous.startMs) {
        context.addIssue({
          code: 'custom',
          message: 'Chunks must be ordered by start time',
          path: ['chunks', chunkIndex, 'startMs'],
        });
      }
    });
  });

const replaySummarySchema = z
  .object({
    id: z.string().min(1),
    schemaVersion: z.literal(replaySchemaVersion),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    season: z.number().int().min(1950),
    meetingName: z.string().min(1),
    sessionName: z.string().min(1),
    replayScope: z.enum(['race', 'lap']),
    durationMs: millisecondsSchema.positive(),
    startTimeMs: millisecondsSchema,
    endTimeMs: millisecondsSchema,
    driverCount: z.number().int().positive(),
    trackPreview: trackGeometrySchema,
    bundle: z
      .object({
        indexUrl: z.string().min(1),
        byteSize: z.number().int().positive(),
        sha256: sha256Schema,
      })
      .strict(),
    provenance: z.array(provenanceSchema).min(1),
  })
  .strict()
  .refine(
    (replay) =>
      replay.endTimeMs > replay.startTimeMs &&
      replay.durationMs === replay.endTimeMs - replay.startTimeMs,
    {
      message: 'Replay duration must match its time range',
      path: ['durationMs'],
    },
  );

export const catalogSchema = z
  .object({
    schemaVersion: z.literal(replaySchemaVersion),
    replays: z.array(replaySummarySchema),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set(catalog.replays.map((replay) => replay.id));
    if (ids.size !== catalog.replays.length) {
      context.addIssue({
        code: 'custom',
        message: 'Replay IDs must be unique',
        path: ['replays'],
      });
    }
  });

const positionSamplesByDriverSchema = z.record(
  z.string().min(1),
  z.array(positionSampleSchema),
);
const telemetrySamplesByDriverSchema = z.record(
  z.string().min(1),
  z.array(telemetrySampleSchema),
);

export const replayChunkSchema = z
  .object({
    schemaVersion: z.literal(replaySchemaVersion),
    replayId: z.string().min(1),
    startMs: millisecondsSchema,
    endMs: millisecondsSchema,
    locationsByDriver: positionSamplesByDriverSchema,
    telemetryByDriver: telemetrySamplesByDriverSchema,
  })
  .strict()
  .superRefine((chunk, context) => {
    if (chunk.endMs <= chunk.startMs) {
      context.addIssue({
        code: 'custom',
        message: 'Chunk end must be after its start',
        path: ['endMs'],
      });
    }

    const validateSamples = (
      samplesByDriver: Record<string, Array<{ timeMs: number }>>,
      field: 'locationsByDriver' | 'telemetryByDriver',
    ) => {
      Object.entries(samplesByDriver).forEach(([driverId, samples]) => {
        samples.forEach((sample, sampleIndex) => {
          if (sample.timeMs < chunk.startMs || sample.timeMs > chunk.endMs) {
            context.addIssue({
              code: 'custom',
              message: 'Sample is outside the chunk range',
              path: [field, driverId, sampleIndex, 'timeMs'],
            });
          }

          const previous = samples[sampleIndex - 1];
          if (previous && sample.timeMs <= previous.timeMs) {
            context.addIssue({
              code: 'custom',
              message: 'Samples must be strictly ordered by time',
              path: [field, driverId, sampleIndex, 'timeMs'],
            });
          }
        });
      });
    };

    validateSamples(chunk.locationsByDriver, 'locationsByDriver');
    validateSamples(chunk.telemetryByDriver, 'telemetryByDriver');
  });

export type Catalog = z.infer<typeof catalogSchema>;
export type ChunkDescriptor = z.infer<typeof chunkDescriptorSchema>;
export type DataQuality = z.infer<typeof dataQualitySchema>;
export type Driver = z.infer<typeof driverSchema>;
export type FastestLap = z.infer<typeof fastestLapSchema>;
export type LapTiming = z.infer<typeof lapTimingSchema>;
export type Point = z.infer<typeof pointSchema>;
export type PositionSample = z.infer<typeof positionSampleSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type ReplayChunk = z.infer<typeof replayChunkSchema>;
export type ReplayIndex = z.infer<typeof replayIndexSchema>;
export type TelemetrySample = z.infer<typeof telemetrySampleSchema>;
export type TrackGeometry = z.infer<typeof trackGeometrySchema>;
