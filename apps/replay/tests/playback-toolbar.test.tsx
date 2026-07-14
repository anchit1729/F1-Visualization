import { fireEvent, render, screen } from '@testing-library/react-native';

import PlaybackToolbar, {
  formatPlaybackTime,
} from '../src/components/replay/PlaybackToolbar';
import { valueFromDrag } from '../src/components/replay/ReplayScrubber';
import {
  createPlaybackState,
  play,
  seek,
  tick,
  type PlaybackState,
} from '../src/features/playback/playbackController';

const mockTriggerFeedback = jest.fn();

jest.mock(
  '../src/features/feedback/useSemanticFeedback',
  () => () => mockTriggerFeedback,
);

const handlers = {
  onRateChange: jest.fn(),
  onRetry: jest.fn(),
  onSeek: jest.fn(),
  onSkip: jest.fn(),
  onTogglePlayback: jest.fn(),
};

function ToolbarFixture({
  chunkError,
  playback,
}: {
  chunkError?: string;
  playback: PlaybackState;
}) {
  return (
    <PlaybackToolbar
      chunkError={chunkError}
      onRateChange={handlers.onRateChange}
      onRetry={handlers.onRetry}
      onSeek={handlers.onSeek}
      onSkip={handlers.onSkip}
      onTogglePlayback={handlers.onTogglePlayback}
      playback={playback}
    />
  );
}

beforeEach(() => {
  Object.values(handlers).forEach((handler) => handler.mockClear());
  mockTriggerFeedback.mockClear();
});

describe('playback toolbar', () => {
  test('formats short and hour-long replay times', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(61000)).toBe('1:01');
    expect(formatPlaybackTime(3661000)).toBe('1:01:01');
  });

  test('exposes playback, skip, rate, and seek controls', async () => {
    await render(
      <ToolbarFixture playback={createPlaybackState(0, 10000, 5000)} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Skip backward 10 seconds' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Skip forward 10 seconds' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: /Playback speed 1x/u }),
    );

    expect(handlers.onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(mockTriggerFeedback).toHaveBeenCalledWith('play');
    expect(handlers.onSkip).toHaveBeenNthCalledWith(1, -10000);
    expect(handlers.onSkip).toHaveBeenNthCalledWith(2, 10000);
    expect(handlers.onRateChange).toHaveBeenCalledWith(2);

    const scrubber = screen.getByRole('adjustable', {
      name: 'Replay position',
    });
    expect(scrubber).toHaveProp('accessibilityValue', {
      max: 10000,
      min: 0,
      now: 5000,
      text: '0:05 of 0:10',
    });
    await fireEvent(scrubber, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(handlers.onSeek).toHaveBeenCalledWith(6000);
    expect(mockTriggerFeedback).toHaveBeenCalledWith('scrub');
  });

  test('shows pause, replay-at-end, and buffering states', async () => {
    const playing = play(createPlaybackState(0, 10000), 0);
    const playingRender = await render(<ToolbarFixture playback={playing} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    await playingRender.unmount();

    const ended = seek(createPlaybackState(0, 10000), 10000, true, 0);
    const endedRender = await render(<ToolbarFixture playback={ended} />);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
    await endedRender.unmount();

    const buffering = seek(playing, 5000, false, 100);
    await render(<ToolbarFixture playback={buffering} />);
    expect(screen.getByText('Buffering replay data…')).toBeTruthy();
    expect(screen.getByTestId('playback-toggle')).toHaveProp(
      'accessibilityState',
      { disabled: true },
    );
    expect(screen.getByTestId('replay-scrubber')).toHaveProp(
      'accessibilityState',
      { disabled: true },
    );
  });

  test('reports pause and natural completion as semantic feedback', async () => {
    const playing = play(createPlaybackState(0, 10000), 0);
    const rendered = await render(<ToolbarFixture playback={playing} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(mockTriggerFeedback).toHaveBeenCalledWith('pause');

    mockTriggerFeedback.mockClear();
    await rendered.rerender(<ToolbarFixture playback={tick(playing, 10000)} />);
    expect(mockTriggerFeedback).toHaveBeenCalledWith('complete');
  });

  test('offers retry after a segment failure', async () => {
    const buffering = seek(
      play(createPlaybackState(0, 10000), 0),
      5000,
      false,
      100,
    );
    await render(
      <ToolbarFixture chunkError="Segment unavailable." playback={buffering} />,
    );

    expect(screen.getByText('Segment unavailable.')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retry segment' }),
    );
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  test('maps drag distance to clamped replay time', () => {
    expect(valueFromDrag(5000, 50, 100, 0, 10000)).toBe(10000);
    expect(valueFromDrag(5000, -100, 100, 0, 10000)).toBe(0);
    expect(valueFromDrag(5000, 50, 0, 0, 10000)).toBe(5000);
  });
});
