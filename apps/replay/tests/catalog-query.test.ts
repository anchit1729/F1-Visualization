import catalogFixture from '@f1/test-fixtures/replays/tiny/catalog.json';

import ReplayRepositoryError from '../src/features/catalog/ReplayRepositoryError';
import {
  executeReplayQuery,
  replayQueryKeys,
  shouldRetryReplayQuery,
} from '../src/features/catalog/catalogQuery';

describe('catalog query policy', () => {
  test('provides stable keys for catalog and replay caches', () => {
    expect(replayQueryKeys.catalog).toEqual(['replays', 'catalog']);
    expect(replayQueryKeys.replay('tiny-race')).toEqual([
      'replays',
      'tiny-race',
    ]);
  });

  test('retries one transient network failure', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(
        new ReplayRepositoryError('network', 'Temporary failure.'),
      )
      .mockResolvedValue(catalogFixture);

    await expect(executeReplayQuery(query)).resolves.toEqual(catalogFixture);
    expect(query).toHaveBeenCalledTimes(2);
  });

  test.each(['integrity', 'not-found', 'unsupported-schema'] as const)(
    'does not retry %s failures',
    async (kind) => {
      const error = new ReplayRepositoryError(kind, 'Permanent failure.');
      const query = jest.fn().mockRejectedValue(error);

      await expect(executeReplayQuery(query)).rejects.toBe(error);
      expect(query).toHaveBeenCalledTimes(1);
      expect(shouldRetryReplayQuery(error, 0)).toBe(false);
    },
  );

  test('honors cancellation without starting or retrying work', async () => {
    const controller = new AbortController();
    const query = jest.fn();
    controller.abort();

    await expect(
      executeReplayQuery(query, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(query).not.toHaveBeenCalled();
  });
});
