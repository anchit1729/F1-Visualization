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
} from '../src/features/playback/playbackController';

const rates: PlaybackRate[] = [0.5, 1, 2];

describe('playback controller', () => {
  test.each(rates)('accumulates elapsed time at %sx', (rate) => {
    let state = createPlaybackState(1000, 10000);
    state = setPlaybackRate(state, rate, 0);
    state = play(state, 100);

    expect(tick(state, 1100).currentMs).toBe(1000 + 1000 * rate);
  });

  test('keeps repeated play and paused ticks stable', () => {
    const playing = play(createPlaybackState(0, 10000), 100);
    expect(play(playing, 500)).toBe(playing);

    const paused = pause(tick(playing, 1100), 1100);
    expect(paused.currentMs).toBe(1000);
    expect(tick(paused, 5000)).toBe(paused);
    expect(pause(paused, 5000)).toBe(paused);
  });

  test('stops at the end and restarts from the beginning', () => {
    const ended = tick(play(createPlaybackState(0, 1000), 0), 2000);
    expect(ended).toMatchObject({ currentMs: 1000, status: 'paused' });

    expect(play(ended, 3000)).toMatchObject({
      currentMs: 0,
      lastClockMs: 3000,
      status: 'playing',
    });
  });

  test('rebases the monotonic clock after a background gap', () => {
    const playing = tick(play(createPlaybackState(0, 10000), 0), 1000);
    const foregrounded = rebaseClock(playing, 60000);

    expect(tick(foregrounded, 61000).currentMs).toBe(2000);
  });

  test('clamps creation and seeks to the replay timeline', () => {
    expect(createPlaybackState(100, 200, 0).currentMs).toBe(100);
    expect(seek(createPlaybackState(100, 200), 0, true, 0).currentMs).toBe(100);
    expect(seek(createPlaybackState(100, 200), 300, true, 0).currentMs).toBe(
      200,
    );
    expect(() => createPlaybackState(100, 100)).toThrow(RangeError);
  });

  test('preserves playing state across an available seek', () => {
    const playing = play(createPlaybackState(0, 10000), 0);
    const sought = seek(playing, 7000, true, 500);

    expect(sought).toMatchObject({
      currentMs: 7000,
      lastClockMs: 500,
      status: 'playing',
    });
  });

  test('distinguishes buffering and resumes only when requested', () => {
    const pausedBuffer = seek(createPlaybackState(0, 10000), 5000, false, 0);
    expect(pausedBuffer.status).toBe('buffering');
    expect(finishBuffering(pausedBuffer, 100).status).toBe('paused');

    const playing = play(createPlaybackState(0, 10000), 0);
    const playingBuffer = seek(playing, 5000, false, 100);
    expect(playingBuffer).toMatchObject({
      resumeAfterBuffer: true,
      status: 'buffering',
    });
    expect(finishBuffering(playingBuffer, 200)).toMatchObject({
      lastClockMs: 200,
      status: 'playing',
    });
    expect(finishBuffering(pause(playingBuffer, 150), 200).status).toBe(
      'paused',
    );
  });

  test('ignores a clock value that moves backward', () => {
    const playing = tick(play(createPlaybackState(0, 10000), 1000), 2000);
    expect(tick(playing, 1500)).toBe(playing);
  });
});
