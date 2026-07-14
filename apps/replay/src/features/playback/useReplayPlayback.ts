import type { ReplayChunk } from '@f1/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  findChunkIndexAtTime,
  type loadReplayStart,
} from '../replay/loadReplayStart';
import {
  createPlaybackState,
  finishBuffering,
  pause,
  play,
  rebaseClock,
  seek,
  setPlaybackRate,
  tick,
  type PlaybackRate,
  type PlaybackState,
} from './playbackController';

type ReplayData = Awaited<ReturnType<typeof loadReplayStart>>;

function monotonicNow() {
  return globalThis.performance?.now() ?? Date.now();
}

export default function useReplayPlayback(data: ReplayData | null) {
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [chunks, setChunks] = useState<ReplayChunk[]>([]);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const prefetchedFrom = useRef<number | null>(null);

  useEffect(() => {
    if (!data) {
      setPlayback(null);
      setChunks([]);
      return;
    }

    setPlayback(
      createPlaybackState(
        data.replay.summary.startTimeMs,
        data.replay.summary.endTimeMs,
      ),
    );
    setChunks(data.cache.cachedChunks);
    setChunkError(null);
    prefetchedFrom.current = data.chunkIndex;
  }, [data]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setPlayback((current) =>
          current ? rebaseClock(current, monotonicNow()) : current,
        );
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (playback?.status !== 'playing') return undefined;
    let frameId = requestAnimationFrame(function update() {
      setPlayback((current) =>
        current ? tick(current, monotonicNow()) : current,
      );
      frameId = requestAnimationFrame(update);
    });
    return () => cancelAnimationFrame(frameId);
  }, [playback?.status]);

  const activeChunkIndex = useMemo(
    () =>
      data && playback
        ? findChunkIndexAtTime(data.replay, playback.currentMs)
        : null,
    [data, playback],
  );

  useEffect(() => {
    if (!data || activeChunkIndex === null) return undefined;
    const controller = new AbortController();
    const syncChunks = () => setChunks(data.cache.cachedChunks);
    const prefetch = () => {
      if (prefetchedFrom.current === activeChunkIndex) return;
      prefetchedFrom.current = activeChunkIndex;
      data.cache
        .prefetchAdjacent(activeChunkIndex, controller.signal)
        .then(syncChunks)
        .catch(() => undefined);
    };

    if (data.cache.has(activeChunkIndex)) {
      syncChunks();
      prefetch();
      return () => controller.abort();
    }

    setChunkError(null);
    setPlayback((current) =>
      current
        ? seek(current, current.currentMs, false, monotonicNow())
        : current,
    );
    data.cache
      .load(activeChunkIndex, activeChunkIndex, controller.signal)
      .then(() => {
        syncChunks();
        setPlayback((current) =>
          current ? finishBuffering(current, monotonicNow()) : current,
        );
        prefetch();
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === 'AbortError')) {
          setChunkError(
            reason instanceof Error
              ? reason.message
              : 'This replay segment could not be loaded.',
          );
        }
      });
    return () => controller.abort();
  }, [activeChunkIndex, data, retryKey]);

  const togglePlayback = useCallback(
    () =>
      setPlayback((current) => {
        if (!current) return current;
        return current.status === 'playing'
          ? pause(current, monotonicNow())
          : play(current, monotonicNow());
      }),
    [],
  );
  const seekTo = useCallback(
    (timeMs: number) => {
      if (!data) return;
      const targetMs = Math.min(
        Math.max(timeMs, data.replay.summary.startTimeMs),
        data.replay.summary.endTimeMs,
      );
      const chunkIndex = findChunkIndexAtTime(data.replay, targetMs);
      const available = data.cache.has(chunkIndex);
      if (available) setChunks(data.cache.cachedChunks);
      setChunkError(null);
      setPlayback((current) =>
        current ? seek(current, targetMs, available, monotonicNow()) : current,
      );
    },
    [data],
  );
  const skip = useCallback(
    (offsetMs: number) => {
      if (playback) seekTo(playback.currentMs + offsetMs);
    },
    [playback, seekTo],
  );
  const changeRate = useCallback((rate: PlaybackRate) => {
    setPlayback((current) =>
      current ? setPlaybackRate(current, rate, monotonicNow()) : current,
    );
  }, []);
  const retryChunk = useCallback(() => {
    setChunkError(null);
    setRetryKey((current) => current + 1);
  }, []);

  return {
    changeRate,
    chunkError,
    chunks,
    playback,
    retryChunk,
    seekTo,
    skip,
    togglePlayback,
  };
}
