import {
  catalogSchema,
  replayChunkSchema,
  replayIndexSchema,
  replaySchemaVersion,
  type Catalog,
  type ReplayChunk,
  type ReplayIndex,
} from '@f1/domain';

import ReplayRepositoryError from './ReplayRepositoryError';

function parseFailure(value: unknown) {
  const version =
    typeof value === 'object' && value !== null && 'schemaVersion' in value
      ? (value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  const unsupported = version !== undefined && version !== replaySchemaVersion;
  const versionLabel =
    typeof version === 'number' || typeof version === 'string'
      ? version
      : 'unknown';

  return new ReplayRepositoryError(
    unsupported ? 'unsupported-schema' : 'integrity',
    unsupported
      ? `Unsupported replay schema version: ${versionLabel}`
      : 'Replay data failed validation.',
  );
}

export function parseCatalog(value: unknown): Catalog {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) {
    throw parseFailure(value);
  }

  return parsed.data;
}

export function parseReplayIndex(
  value: unknown,
  expectedReplayId: string,
): ReplayIndex {
  const parsed = replayIndexSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== expectedReplayId) {
    throw parseFailure(value);
  }

  return parsed.data;
}

export function parseReplayChunk(
  value: unknown,
  expectedReplayId: string,
): ReplayChunk {
  const parsed = replayChunkSchema.safeParse(value);
  if (!parsed.success || parsed.data.replayId !== expectedReplayId) {
    throw parseFailure(value);
  }

  return parsed.data;
}
