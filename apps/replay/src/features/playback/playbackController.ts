export type PlaybackRate = 0.5 | 1 | 2;
export type PlaybackStatus = 'buffering' | 'paused' | 'playing';

export type PlaybackState = Readonly<{
  currentMs: number;
  endMs: number;
  lastClockMs: number | null;
  rate: PlaybackRate;
  resumeAfterBuffer: boolean;
  startMs: number;
  status: PlaybackStatus;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createPlaybackState(
  startMs: number,
  endMs: number,
  initialMs = startMs,
): PlaybackState {
  if (endMs <= startMs) {
    throw new RangeError('Playback end must be after its start.');
  }

  return {
    currentMs: clamp(initialMs, startMs, endMs),
    endMs,
    lastClockMs: null,
    rate: 1,
    resumeAfterBuffer: false,
    startMs,
    status: 'paused',
  };
}

export function tick(state: PlaybackState, clockMs: number): PlaybackState {
  if (
    state.status !== 'playing' ||
    state.lastClockMs === null ||
    clockMs <= state.lastClockMs
  ) {
    return state;
  }

  const currentMs = Math.min(
    state.currentMs + (clockMs - state.lastClockMs) * state.rate,
    state.endMs,
  );
  const isAtEnd = currentMs === state.endMs;
  return {
    ...state,
    currentMs,
    lastClockMs: isAtEnd ? null : clockMs,
    status: isAtEnd ? 'paused' : 'playing',
  };
}

export function play(state: PlaybackState, clockMs: number): PlaybackState {
  if (state.status === 'buffering') {
    return state.resumeAfterBuffer
      ? state
      : { ...state, resumeAfterBuffer: true };
  }
  if (state.status === 'playing') {
    return state;
  }

  return {
    ...state,
    currentMs:
      state.currentMs === state.endMs ? state.startMs : state.currentMs,
    lastClockMs: clockMs,
    status: 'playing',
  };
}

export function pause(state: PlaybackState, clockMs: number): PlaybackState {
  if (state.status === 'buffering') {
    return state.resumeAfterBuffer
      ? { ...state, resumeAfterBuffer: false }
      : state;
  }
  if (state.status === 'paused') {
    return state;
  }

  const advanced = tick(state, clockMs);
  return advanced.status === 'playing'
    ? { ...advanced, lastClockMs: null, status: 'paused' }
    : advanced;
}

export function seek(
  state: PlaybackState,
  targetMs: number,
  isChunkAvailable: boolean,
  clockMs: number,
): PlaybackState {
  const shouldResume =
    state.status === 'playing' ||
    (state.status === 'buffering' && state.resumeAfterBuffer);
  const currentMs = clamp(targetMs, state.startMs, state.endMs);

  if (!isChunkAvailable) {
    return {
      ...state,
      currentMs,
      lastClockMs: null,
      resumeAfterBuffer: shouldResume,
      status: 'buffering',
    };
  }

  return {
    ...state,
    currentMs,
    lastClockMs: shouldResume ? clockMs : null,
    resumeAfterBuffer: false,
    status: shouldResume ? 'playing' : 'paused',
  };
}

export function finishBuffering(
  state: PlaybackState,
  clockMs: number,
): PlaybackState {
  if (state.status !== 'buffering') {
    return state;
  }

  return {
    ...state,
    lastClockMs: state.resumeAfterBuffer ? clockMs : null,
    resumeAfterBuffer: false,
    status: state.resumeAfterBuffer ? 'playing' : 'paused',
  };
}

export function setPlaybackRate(
  state: PlaybackState,
  rate: PlaybackRate,
  clockMs: number,
): PlaybackState {
  return { ...tick(state, clockMs), rate };
}

export function rebaseClock(
  state: PlaybackState,
  clockMs: number,
): PlaybackState {
  return state.status === 'playing'
    ? { ...state, lastClockMs: clockMs }
    : state;
}
