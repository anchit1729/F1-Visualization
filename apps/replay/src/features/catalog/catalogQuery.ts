import type { Catalog } from '@f1/domain';

import type { ReplayRepository } from './ReplayRepository';
import { throwIfAborted } from './ReplayRepository';
import ReplayRepositoryError from './ReplayRepositoryError';

export const replayQueryKeys = {
  catalog: ['replays', 'catalog'] as const,
  replay: (replayId: string) => ['replays', replayId] as const,
} as const;

export function shouldRetryReplayQuery(
  error: unknown,
  failureCount: number,
  maxNetworkRetries = 1,
) {
  return (
    error instanceof ReplayRepositoryError &&
    error.kind === 'network' &&
    failureCount < maxNetworkRetries
  );
}

async function executeReplayQueryAttempt<T>(
  query: () => Promise<T>,
  signal: AbortSignal | undefined,
  failureCount: number,
  maxNetworkRetries: number,
): Promise<T> {
  throwIfAborted(signal);
  try {
    return await query();
  } catch (error) {
    if (!shouldRetryReplayQuery(error, failureCount, maxNetworkRetries)) {
      throw error;
    }

    return executeReplayQueryAttempt(
      query,
      signal,
      failureCount + 1,
      maxNetworkRetries,
    );
  }
}

export function executeReplayQuery<T>(
  query: () => Promise<T>,
  signal?: AbortSignal,
  maxNetworkRetries = 1,
): Promise<T> {
  return executeReplayQueryAttempt(query, signal, 0, maxNetworkRetries);
}

export function loadCatalogQuery(
  repository: ReplayRepository,
  signal?: AbortSignal,
): Promise<Catalog> {
  return executeReplayQuery(() => repository.getCatalog(signal), signal);
}
