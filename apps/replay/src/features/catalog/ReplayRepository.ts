import { type Catalog, type ReplayChunk, type ReplayIndex } from '@f1/domain';

import {
  parseCatalog,
  parseReplayChunk,
  parseReplayIndex,
} from './artifactParsing';
import ReplayRepositoryError from './ReplayRepositoryError';

export { default as ReplayRepositoryError } from './ReplayRepositoryError';

export type ReplaySummary = Catalog['replays'][number];
export type LoadedReplay = {
  index: ReplayIndex;
  indexUrl: string;
  summary: ReplaySummary;
};

type ReplayResponse = Pick<Response, 'ok' | 'status' | 'text'>;
export type ReplayFetcher = (
  url: string,
  init: { signal?: AbortSignal },
) => Promise<ReplayResponse>;

export interface ReplayRepository {
  getCatalog(signal?: AbortSignal): Promise<Catalog>;
  getChunk(
    replay: LoadedReplay,
    chunkIndex: number,
    signal?: AbortSignal,
  ): Promise<ReplayChunk>;
  getReplay(replayId: string, signal?: AbortSignal): Promise<LoadedReplay>;
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/u, '')}/${path.replace(/^\/+/u, '')}`;
}

function artifactDirectory(url: string) {
  return url.slice(0, url.lastIndexOf('/') + 1);
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error('The replay request was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

async function fetchJson(
  fetcher: ReplayFetcher,
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(signal);

  let response: ReplayResponse;
  try {
    response = await fetcher(url, { signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    throw new ReplayRepositoryError(
      'network',
      'The replay data could not be downloaded.',
    );
  }

  if (!response.ok) {
    throw new ReplayRepositoryError(
      response.status === 404 ? 'not-found' : 'network',
      response.status === 404
        ? 'The requested replay artifact was not found.'
        : `Replay request failed with HTTP ${response.status}.`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new ReplayRepositoryError(
      'network',
      'The replay data could not be downloaded.',
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ReplayRepositoryError(
      'integrity',
      'Replay data is not valid JSON.',
    );
  }
}

export class StaticHttpReplayRepository implements ReplayRepository {
  private readonly baseUrl: string;

  private cachedCatalog: Catalog | null = null;

  private readonly fetcher: ReplayFetcher;

  constructor(baseUrl = '/replays/v1/', fetcher: ReplayFetcher = fetch) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async getCatalog(signal?: AbortSignal) {
    if (this.cachedCatalog) {
      return this.cachedCatalog;
    }

    const value = await fetchJson(
      this.fetcher,
      joinUrl(this.baseUrl, 'catalog.json'),
      signal,
    );
    const catalog = parseCatalog(value);
    this.cachedCatalog = catalog;
    return catalog;
  }

  async getReplay(replayId: string, signal?: AbortSignal) {
    const catalog = await this.getCatalog(signal);
    const summary = catalog.replays.find((replay) => replay.id === replayId);
    if (!summary) {
      throw new ReplayRepositoryError(
        'not-found',
        `Replay “${replayId}” is not in the curated catalog.`,
      );
    }

    const indexUrl = joinUrl(this.baseUrl, summary.bundle.indexUrl);
    const value = await fetchJson(this.fetcher, indexUrl, signal);
    const index = parseReplayIndex(value, replayId);

    return { index, indexUrl, summary };
  }

  async getChunk(
    replay: LoadedReplay,
    chunkIndex: number,
    signal?: AbortSignal,
  ) {
    const descriptor = replay.index.chunks[chunkIndex];
    if (!descriptor) {
      throw new ReplayRepositoryError(
        'not-found',
        `Chunk ${chunkIndex} is not available for replay “${replay.index.id}”.`,
      );
    }

    const url = joinUrl(artifactDirectory(replay.indexUrl), descriptor.url);
    const value = await fetchJson(this.fetcher, url, signal);
    return parseReplayChunk(value, replay.index.id);
  }
}

export const replayRepository = new StaticHttpReplayRepository();
