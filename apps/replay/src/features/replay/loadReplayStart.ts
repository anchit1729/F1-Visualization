import type { ReplayChunk } from '@f1/domain';

import {
  type LoadedReplay,
  type ReplayRepository,
  throwIfAborted,
} from '../catalog/ReplayRepository';
import ReplayRepositoryError from '../catalog/ReplayRepositoryError';

export const replayChunkCacheLimitBytes = 8 * 1024 * 1024;

export class ReplayChunkCache {
  private readonly chunks = new Map<number, ReplayChunk>();

  private readonly maxBytes: number;

  private readonly repository: ReplayRepository;

  readonly replay: LoadedReplay;

  constructor(
    repository: ReplayRepository,
    replay: LoadedReplay,
    maxBytes = replayChunkCacheLimitBytes,
  ) {
    this.maxBytes = maxBytes;
    this.replay = replay;
    this.repository = repository;
  }

  get cachedIndexes() {
    return [...this.chunks.keys()].sort((left, right) => left - right);
  }

  get cachedChunks() {
    return this.cachedIndexes.flatMap((index) => {
      const chunk = this.chunks.get(index);
      return chunk ? [chunk] : [];
    });
  }

  has(chunkIndex: number) {
    return this.chunks.has(chunkIndex);
  }

  async load(chunkIndex: number, activeIndex: number, signal?: AbortSignal) {
    const cached = this.chunks.get(chunkIndex);
    if (cached) {
      return cached;
    }

    const chunk = await this.repository.getChunk(
      this.replay,
      chunkIndex,
      signal,
    );
    throwIfAborted(signal);
    this.chunks.set(chunkIndex, chunk);
    this.evictDistantChunks(activeIndex);
    return chunk;
  }

  async prefetchAdjacent(activeIndex: number, signal?: AbortSignal) {
    const lastIndex = this.replay.index.chunks.length - 1;
    const adjacentIndex =
      activeIndex < lastIndex ? activeIndex + 1 : activeIndex - 1;
    if (adjacentIndex >= 0) {
      await this.load(adjacentIndex, activeIndex, signal);
    }
  }

  private evictDistantChunks(activeIndex: number) {
    let bytes = this.cachedIndexes.reduce(
      (total, index) => total + this.replay.index.chunks[index].byteSize,
      0,
    );
    const candidates = this.cachedIndexes
      .filter((index) => index !== activeIndex)
      .sort(
        (left, right) =>
          Math.abs(right - activeIndex) - Math.abs(left - activeIndex),
      );

    candidates.forEach((index) => {
      if (bytes > this.maxBytes) {
        this.chunks.delete(index);
        bytes -= this.replay.index.chunks[index].byteSize;
      }
    });
  }
}

export function findChunkIndexAtTime(replay: LoadedReplay, timeMs: number) {
  const index = replay.index.chunks.findIndex(
    (chunk, chunkIndex, chunks) =>
      timeMs >= chunk.startMs &&
      (timeMs < chunk.endMs ||
        (chunkIndex === chunks.length - 1 && timeMs === chunk.endMs)),
  );
  if (index < 0) {
    throw new ReplayRepositoryError(
      'integrity',
      'The replay start time is outside its available chunks.',
    );
  }

  return index;
}

export async function loadReplayStart(
  repository: ReplayRepository,
  replayId: string,
  signal?: AbortSignal,
) {
  const replay = await repository.getReplay(replayId, signal);
  const chunkIndex = findChunkIndexAtTime(replay, replay.summary.startTimeMs);
  const cache = new ReplayChunkCache(repository, replay);
  const chunk = await cache.load(chunkIndex, chunkIndex, signal);
  cache.prefetchAdjacent(chunkIndex, signal).catch(() => undefined);
  return { cache, chunk, chunkIndex, replay };
}
