import type { Catalog, ReplayChunk, ReplayIndex } from '@f1/domain';
import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';
import chunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00000.json';
import secondChunkFixture from '@f1/test-fixtures/replays/tiny/chunks/00001.json';
import indexFixture from '@f1/test-fixtures/replays/tiny/index.json';

import {
  StaticHttpReplayRepository,
  type ReplayFetcher,
} from '../src/features/catalog/ReplayRepository';
import InMemoryReplayRepository from '../src/features/catalog/InMemoryReplayRepository';

const catalog = catalogFixture as Catalog;
const index = indexFixture as ReplayIndex;
const chunk = chunkFixture as ReplayChunk;
const secondChunk = secondChunkFixture as ReplayChunk;

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(value)),
  } as unknown as Response;
}

function textResponse(value: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(value),
  } as unknown as Response;
}

function createFetchMock() {
  return jest.fn<ReturnType<ReplayFetcher>, Parameters<ReplayFetcher>>();
}

describe('StaticHttpReplayRepository', () => {
  test('validates and caches the catalog', async () => {
    const fetchMock = createFetchMock().mockResolvedValue(response(catalog));
    const repository = new StaticHttpReplayRepository('/assets/v1/', fetchMock);

    await expect(repository.getCatalog()).resolves.toEqual(catalog);
    await expect(repository.getCatalog()).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/assets/v1/catalog.json', {
      signal: undefined,
    });
  });

  test('loads the selected index and its first chunk using relative URLs', async () => {
    const fetchMock = createFetchMock()
      .mockResolvedValueOnce(response(catalog))
      .mockResolvedValueOnce(response(index))
      .mockResolvedValueOnce(response(secondChunk));
    const repository = new StaticHttpReplayRepository('/assets/v1/', fetchMock);

    const replay = await repository.getReplay('tiny-race');
    await expect(repository.getChunk(replay, 1)).resolves.toEqual(secondChunk);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/assets/v1/catalog.json',
      '/assets/v1/replays/tiny-race/index.json',
      '/assets/v1/replays/tiny-race/chunks/00001.json',
    ]);
  });

  test('maps missing replays and HTTP 404 responses to not-found', async () => {
    const catalogFetch = createFetchMock().mockResolvedValue(response(catalog));
    const repository = new StaticHttpReplayRepository(undefined, catalogFetch);

    await expect(repository.getReplay('missing')).rejects.toMatchObject({
      kind: 'not-found',
    });

    const missingFetch = createFetchMock().mockResolvedValue(response({}, 404));
    await expect(
      new StaticHttpReplayRepository(undefined, missingFetch).getCatalog(),
    ).rejects.toMatchObject({ kind: 'not-found' });
  });

  test('maps transport failures and non-404 responses to network', async () => {
    const rejectedFetch = createFetchMock().mockRejectedValue(
      new Error('offline'),
    );
    await expect(
      new StaticHttpReplayRepository(undefined, rejectedFetch).getCatalog(),
    ).rejects.toMatchObject({ kind: 'network' });

    const serverErrorFetch = createFetchMock().mockResolvedValue(
      response({}, 503),
    );
    await expect(
      new StaticHttpReplayRepository(undefined, serverErrorFetch).getCatalog(),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  test('maps malformed JSON and schema violations to integrity', async () => {
    const fetchMock = createFetchMock()
      .mockResolvedValueOnce(textResponse('{broken'))
      .mockResolvedValueOnce(response({ schemaVersion: 1, replays: 'bad' }));

    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(),
    ).rejects.toMatchObject({ kind: 'integrity' });
    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(),
    ).rejects.toMatchObject({ kind: 'integrity' });
  });

  test('distinguishes unsupported schemas from invalid artifacts', async () => {
    const fetchMock = createFetchMock()
      .mockResolvedValueOnce(response({ ...catalog, schemaVersion: 2 }))
      .mockResolvedValueOnce(response({ schemaVersion: 1, replays: 'bad' }));

    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(),
    ).rejects.toMatchObject({ kind: 'unsupported-schema' });
    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(),
    ).rejects.toMatchObject({ kind: 'integrity' });
  });

  test('cancels before issuing a request', async () => {
    const fetchMock = createFetchMock();
    const controller = new AbortController();
    controller.abort();

    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('preserves cancellation from an in-flight request', async () => {
    const fetchMock = createFetchMock().mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    );

    await expect(
      new StaticHttpReplayRepository(undefined, fetchMock).getCatalog(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('InMemoryReplayRepository', () => {
  test('loads and validates a complete replay without HTTP', async () => {
    const repository = new InMemoryReplayRepository({
      catalog,
      chunksByReplayId: { 'tiny-race': [chunk] },
      indexesByReplayId: { 'tiny-race': index },
    });

    await expect(repository.getCatalog()).resolves.toEqual(catalog);
    const replay = await repository.getReplay('tiny-race');
    expect(replay.index).toEqual(index);
    expect(replay.indexUrl).toBe('memory://tiny-race/index.json');
    await expect(repository.getChunk(replay, 0)).resolves.toEqual(chunk);
  });

  test('maps missing and mismatched in-memory artifacts', async () => {
    const missingRepository = new InMemoryReplayRepository({
      catalog,
      chunksByReplayId: {},
      indexesByReplayId: {},
    });
    await expect(
      missingRepository.getReplay('tiny-race'),
    ).rejects.toMatchObject({ kind: 'not-found' });

    const mismatchRepository = new InMemoryReplayRepository({
      catalog,
      chunksByReplayId: {},
      indexesByReplayId: {
        'tiny-race': { ...index, id: 'different-replay' },
      },
    });
    await expect(
      mismatchRepository.getReplay('tiny-race'),
    ).rejects.toMatchObject({ kind: 'integrity' });
  });
});
