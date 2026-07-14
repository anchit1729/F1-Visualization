import type { Catalog, ReplayChunk, ReplayIndex } from '@f1/domain';

import {
  parseCatalog,
  parseReplayChunk,
  parseReplayIndex,
} from './artifactParsing';
import type { LoadedReplay, ReplayRepository } from './ReplayRepository';
import { throwIfAborted } from './ReplayRepository';
import ReplayRepositoryError from './ReplayRepositoryError';

export type InMemoryReplayArtifacts = {
  catalog: unknown;
  chunksByReplayId: Record<string, unknown[]>;
  indexesByReplayId: Record<string, unknown>;
};

export default class InMemoryReplayRepository implements ReplayRepository {
  private readonly artifacts: InMemoryReplayArtifacts;

  private cachedCatalog: Catalog | null = null;

  constructor(artifacts: InMemoryReplayArtifacts) {
    this.artifacts = artifacts;
  }

  getCatalog(signal?: AbortSignal): Promise<Catalog> {
    throwIfAborted(signal);
    if (!this.cachedCatalog) {
      this.cachedCatalog = parseCatalog(this.artifacts.catalog);
    }

    return Promise.resolve(this.cachedCatalog);
  }

  async getReplay(
    replayId: string,
    signal?: AbortSignal,
  ): Promise<LoadedReplay> {
    const catalog = await this.getCatalog(signal);
    const summary = catalog.replays.find((replay) => replay.id === replayId);
    const value = this.artifacts.indexesByReplayId[replayId];
    if (!summary || value === undefined) {
      throw new ReplayRepositoryError(
        'not-found',
        `Replay “${replayId}” is not available in memory.`,
      );
    }

    const index: ReplayIndex = parseReplayIndex(value, replayId);
    return { index, indexUrl: `memory://${replayId}/index.json`, summary };
  }

  getChunk(
    replay: LoadedReplay,
    chunkIndex: number,
    signal?: AbortSignal,
  ): Promise<ReplayChunk> {
    throwIfAborted(signal);
    const value =
      this.artifacts.chunksByReplayId[replay.index.id]?.[chunkIndex];
    if (value === undefined) {
      throw new ReplayRepositoryError(
        'not-found',
        `Chunk ${chunkIndex} for “${replay.index.id}” is not available in memory.`,
      );
    }

    return Promise.resolve(parseReplayChunk(value, replay.index.id));
  }
}
