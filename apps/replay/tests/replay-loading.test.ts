import type { Catalog, ReplayChunk, ReplayIndex } from '@f1/domain';
import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';
import chunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00000.json';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';

import type {
  LoadedReplay,
  ReplayRepository,
} from '../src/features/catalog/ReplayRepository';
import {
  findChunkIndexAtTime,
  loadReplayStart,
  ReplayChunkCache,
} from '../src/features/replay/loadReplayStart';

const catalog = catalogFixture as Catalog;
const index = indexFixture as ReplayIndex;
const chunk = chunkFixture as ReplayChunk;
const replay: LoadedReplay = {
  index,
  indexUrl: '/replays/tiny/index.json',
  summary: catalog.replays[0],
};

function repositoryWith(getChunk: ReplayRepository['getChunk']) {
  return {
    getCatalog: jest.fn().mockResolvedValue(catalog),
    getChunk,
    getReplay: jest.fn().mockResolvedValue(replay),
  } satisfies ReplayRepository;
}

describe('replay start loading', () => {
  test('loads the start chunk before prefetching its neighbor', async () => {
    const getChunk = jest.fn().mockResolvedValue(chunk);
    const repository = repositoryWith(getChunk);

    const result = await loadReplayStart(repository, replay.index.id);
    await Promise.resolve();

    expect(result.chunkIndex).toBe(0);
    expect(getChunk).toHaveBeenNthCalledWith(1, replay, 0, undefined);
    expect(getChunk).toHaveBeenNthCalledWith(2, replay, 1, undefined);
    expect(result.cache.cachedIndexes).toEqual([0, 1]);
    expect(result.cache.cachedChunks).toEqual([chunk, chunk]);
    expect(result.cache.has(0)).toBe(true);
    expect(result.cache.has(2)).toBe(false);
  });

  test('uses the next chunk at a shared boundary', () => {
    expect(findChunkIndexAtTime(replay, 5000)).toBe(1);
  });

  test('evicts distant chunks before the active chunk', async () => {
    const chunks = [0, 1, 2].map((chunkIndex) => ({
      ...index.chunks[0],
      byteSize: 1024,
      endMs: (chunkIndex + 1) * 1000,
      startMs: chunkIndex * 1000,
      url: `${chunkIndex}.json`,
    }));
    const extendedReplay = {
      ...replay,
      index: { ...index, chunks },
    };
    const getChunk = jest.fn().mockResolvedValue(chunk);
    const cache = new ReplayChunkCache(
      repositoryWith(getChunk),
      extendedReplay,
      2500,
    );

    await cache.load(0, 2);
    await cache.load(1, 2);
    await cache.load(2, 2);

    expect(cache.cachedIndexes).toEqual([1, 2]);
  });

  test('retries a failed chunk and rejects data received after cancellation', async () => {
    const getChunk = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(chunk);
    const cache = new ReplayChunkCache(repositoryWith(getChunk), replay);

    await expect(cache.load(0, 0)).rejects.toThrow('offline');
    await expect(cache.load(0, 0)).resolves.toEqual(chunk);
    expect(getChunk).toHaveBeenCalledTimes(2);

    const controller = new AbortController();
    const uncached = new ReplayChunkCache(repositoryWith(getChunk), replay);
    const pending = uncached.load(0, 0, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(uncached.cachedIndexes).toEqual([]);
  });
});
